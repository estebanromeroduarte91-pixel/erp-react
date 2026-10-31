-- Bandeja de Conversaciones, partiendo por el correo.
--
-- Una conversación por contacto y canal (como en WhatsApp o Instagram, que
-- vienen después): todo lo que escribe cliente@gmail.com cae en el mismo hilo,
-- aunque cambie el asunto. Es lo que espera un mostrador, que piensa en
-- personas y no en hilos de correo.
--
-- Los mensajes solo los escribe el servidor (Edge Functions con service_role):
-- el navegador lee, marca como leído, cierra o reasigna, y nada más.

create table if not exists public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp', 'instagram', 'messenger')),
  -- En correo, la dirección en minúsculas. En los demás canales, el id que
  -- entregue Meta para ese contacto.
  contacto_externo text not null,
  contacto_nombre text,
  asunto text,
  ultimo_mensaje_en timestamptz not null default now(),
  ultimo_extracto text,
  ultima_direccion text check (ultima_direccion in ('entrante', 'saliente')),
  no_leidos integer not null default 0,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  asignado_a uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (empresa_id, canal, contacto_externo)
);

create index if not exists conversaciones_empresa_fecha_idx
  on public.conversaciones (empresa_id, ultimo_mensaje_en desc);

create table if not exists public.conversacion_mensajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  -- Message-ID del correo. Es lo que impide guardar dos veces el mismo
  -- mensaje si una revisión se repite, y lo que usa la respuesta para que el
  -- cliente la vea en el mismo hilo de su Gmail.
  id_externo text,
  en_respuesta_a text,
  referencias text,
  de_nombre text,
  de_direccion text,
  para text,
  asunto text,
  texto text,
  html text,
  adjuntos jsonb not null default '[]'::jsonb,
  enviado_en timestamptz not null default now(),
  autor_id uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

create unique index if not exists conversacion_mensajes_externo_uidx
  on public.conversacion_mensajes (empresa_id, id_externo) where id_externo is not null;
create index if not exists conversacion_mensajes_conv_fecha_idx
  on public.conversacion_mensajes (conversacion_id, enviado_en);

-- Estado de la lectura de la casilla. El UID de IMAP solo vale junto con su
-- UIDVALIDITY: si el hosting reconstruye la casilla, los UID se reinician y
-- hay que volver a partir desde los mensajes recientes.
create table if not exists public.correo_entrante (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  activo boolean not null default false,
  imap_host text,
  imap_port integer not null default 993,
  uid_validity bigint,
  ultimo_uid bigint,
  ultima_revision timestamptz,
  ultimo_error text,
  activado_en timestamptz,
  actualizado_en timestamptz not null default now()
);

alter table public.conversaciones enable row level security;
alter table public.conversacion_mensajes enable row level security;
alter table public.correo_entrante enable row level security;

drop policy if exists "empresa lee sus conversaciones" on public.conversaciones;
create policy "empresa lee sus conversaciones"
on public.conversaciones for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "empresa gestiona sus conversaciones" on public.conversaciones;
create policy "empresa gestiona sus conversaciones"
on public.conversaciones for update to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin())
with check (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "empresa lee sus mensajes" on public.conversacion_mensajes;
create policy "empresa lee sus mensajes"
on public.conversacion_mensajes for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "empresa lee su correo entrante" on public.correo_entrante;
create policy "empresa lee su correo entrante"
on public.correo_entrante for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

revoke all on public.conversaciones, public.conversacion_mensajes, public.correo_entrante from anon, authenticated;
grant select on public.conversaciones, public.conversacion_mensajes, public.correo_entrante to authenticated;
-- Desde el navegador solo se puede marcar leído, cerrar/reabrir y asignar.
grant update (no_leidos, estado, asignado_a) on public.conversaciones to authenticated;

-- Activa o pausa la lectura de la casilla. Mismo patrón de impersonación que
-- las migraciones 47-49: p_empresa_id solo se honra para un platform admin.
drop function if exists public.fn_correo_entrante_activar(boolean, uuid);
create or replace function public.fn_correo_entrante_activar(p_activo boolean, p_empresa_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_impersonando boolean := p_empresa_id is not null and public.is_platform_admin();
  v_empresa uuid := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;
begin
  if v_empresa is null then
    raise exception 'Usuario sin empresa';
  end if;
  if not v_impersonando and public.mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede conectar el correo';
  end if;

  insert into public.correo_entrante (empresa_id, activo, activado_en, actualizado_en)
  values (v_empresa, p_activo, case when p_activo then now() end, now())
  on conflict (empresa_id) do update
    set activo = excluded.activo,
        activado_en = case when excluded.activo then coalesce(public.correo_entrante.activado_en, now())
                           else public.correo_entrante.activado_en end,
        ultimo_error = case when excluded.activo then null else public.correo_entrante.ultimo_error end,
        actualizado_en = now();
end;
$$;

revoke all on function public.fn_correo_entrante_activar(boolean, uuid) from public, anon, authenticated, service_role;
grant execute on function public.fn_correo_entrante_activar(boolean, uuid) to authenticated;

-- Registra un mensaje y actualiza su conversación en una sola transacción.
-- Solo para el servidor: lo llaman correo-entrante-sync y
-- conversacion-responder con service_role. Si el Message-ID ya estaba, no
-- hace nada y devuelve null: una revisión repetida no duplica ni suma no leídos.
drop function if exists public.fn_conversacion_registrar_mensaje(uuid, text, text, text, text, jsonb);
create or replace function public.fn_conversacion_registrar_mensaje(
  p_empresa uuid,
  p_canal text,
  p_contacto text,
  p_contacto_nombre text,
  p_direccion text,
  p_mensaje jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
  v_msg uuid;
  v_fecha timestamptz := coalesce(nullif(p_mensaje->>'enviado_en', '')::timestamptz, now());
  v_texto text := coalesce(p_mensaje->>'texto', '');
  v_extracto text := left(regexp_replace(v_texto, '\s+', ' ', 'g'), 160);
begin
  if p_direccion not in ('entrante', 'saliente') then
    raise exception 'Dirección no válida';
  end if;

  insert into public.conversaciones (empresa_id, canal, contacto_externo, contacto_nombre, asunto)
  values (p_empresa, p_canal, lower(p_contacto), nullif(p_contacto_nombre, ''), nullif(p_mensaje->>'asunto', ''))
  on conflict (empresa_id, canal, contacto_externo) do update
    set contacto_nombre = coalesce(public.conversaciones.contacto_nombre, excluded.contacto_nombre)
  returning id into v_conv;

  insert into public.conversacion_mensajes (
    empresa_id, conversacion_id, direccion, id_externo, en_respuesta_a, referencias,
    de_nombre, de_direccion, para, asunto, texto, html, adjuntos, enviado_en, autor_id
  ) values (
    p_empresa, v_conv, p_direccion,
    nullif(p_mensaje->>'id_externo', ''), nullif(p_mensaje->>'en_respuesta_a', ''), nullif(p_mensaje->>'referencias', ''),
    nullif(p_mensaje->>'de_nombre', ''), nullif(lower(p_mensaje->>'de_direccion'), ''), nullif(p_mensaje->>'para', ''),
    nullif(p_mensaje->>'asunto', ''), v_texto, nullif(p_mensaje->>'html', ''),
    coalesce(p_mensaje->'adjuntos', '[]'::jsonb), v_fecha, nullif(p_mensaje->>'autor_id', '')::uuid
  )
  on conflict (empresa_id, id_externo) where id_externo is not null do nothing
  returning id into v_msg;

  if v_msg is null then
    return null;
  end if;

  -- Un correo viejo que entra tarde no debe pisar el extracto del más nuevo.
  update public.conversaciones c
     set ultimo_mensaje_en = greatest(c.ultimo_mensaje_en, v_fecha),
         ultimo_extracto = case when v_fecha >= c.ultimo_mensaje_en then v_extracto else c.ultimo_extracto end,
         ultima_direccion = case when v_fecha >= c.ultimo_mensaje_en then p_direccion else c.ultima_direccion end,
         asunto = case when v_fecha >= c.ultimo_mensaje_en then coalesce(nullif(p_mensaje->>'asunto', ''), c.asunto) else c.asunto end,
         no_leidos = case when p_direccion = 'entrante' then c.no_leidos + 1 else 0 end,
         -- Si el cliente vuelve a escribir, la conversación se reabre sola.
         estado = case when p_direccion = 'entrante' then 'abierta' else c.estado end
   where c.id = v_conv;

  return v_msg;
end;
$$;

revoke all on function public.fn_conversacion_registrar_mensaje(uuid, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.fn_conversacion_registrar_mensaje(uuid, text, text, text, text, jsonb) to service_role;
