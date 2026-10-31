-- Canales de Meta (Messenger, y después Instagram) para Conversaciones.
--
-- Al revés que el correo, acá Meta avisa: cada mensaje llega al webhook
-- `meta-webhook` con el id de la página, y esta tabla dice de qué empresa es.
-- El token de la página (con el que Pixit responde) se guarda cifrado en
-- Vault, igual que la contraseña SMTP; la tabla solo guarda su referencia.

create table if not exists public.canales_meta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  canal text not null check (canal in ('messenger', 'instagram')),
  -- Messenger: id de la página de Facebook. Instagram: id de la cuenta
  -- profesional. Es lo que trae cada evento del webhook para enrutarlo.
  cuenta_id text not null,
  cuenta_nombre text,
  token_secret_id uuid,
  activo boolean not null default true,
  conectado_por uuid references auth.users(id) on delete set null,
  conectado_en timestamptz not null default now(),
  ultimo_evento timestamptz,
  ultimo_error text,
  -- Una página solo puede estar conectada a una empresa: si no, sus mensajes
  -- podrían terminar en la bandeja de otro taller.
  unique (canal, cuenta_id)
);

create index if not exists canales_meta_empresa_idx on public.canales_meta (empresa_id);

alter table public.canales_meta enable row level security;

drop policy if exists "empresa lee sus canales meta" on public.canales_meta;
create policy "empresa lee sus canales meta"
on public.canales_meta for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

revoke all on public.canales_meta from anon, authenticated;
-- Sin token_secret_id: el navegador no necesita ni la referencia.
grant select (id, empresa_id, canal, cuenta_id, cuenta_nombre, activo, conectado_en, ultimo_evento, ultimo_error)
  on public.canales_meta to authenticated;

-- Guarda (o reemplaza) la conexión de una página. Solo el servidor:
-- meta-conectar la llama con service_role después de validar con Meta que
-- quien conecta administra la página.
drop function if exists public.fn_canal_meta_guardar(uuid, text, text, text, text, uuid);
create or replace function public.fn_canal_meta_guardar(
  p_empresa uuid,
  p_canal text,
  p_cuenta_id text,
  p_cuenta_nombre text,
  p_token text,
  p_usuario uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_fila public.canales_meta%rowtype;
  v_secret uuid;
  v_id uuid;
begin
  if coalesce(p_token, '') = '' or length(p_token) > 4096 then
    raise exception 'Token de Meta no válido';
  end if;

  select * into v_fila from public.canales_meta where canal = p_canal and cuenta_id = p_cuenta_id;
  if found and v_fila.empresa_id <> p_empresa then
    raise exception 'Esta página ya está conectada a otra empresa en Pixit';
  end if;

  if v_fila.token_secret_id is not null then
    perform vault.update_secret(v_fila.token_secret_id, p_token);
    v_secret := v_fila.token_secret_id;
  else
    v_secret := vault.create_secret(
      p_token,
      'meta_' || p_canal || '_' || p_cuenta_id,
      'Token de página de Meta (' || p_canal || ') de la empresa ' || p_empresa::text
    );
  end if;

  insert into public.canales_meta (empresa_id, canal, cuenta_id, cuenta_nombre, token_secret_id, activo, conectado_por, conectado_en, ultimo_error)
  values (p_empresa, p_canal, p_cuenta_id, p_cuenta_nombre, v_secret, true, p_usuario, now(), null)
  on conflict (canal, cuenta_id) do update
    set cuenta_nombre = excluded.cuenta_nombre,
        token_secret_id = excluded.token_secret_id,
        activo = true,
        conectado_por = excluded.conectado_por,
        conectado_en = now(),
        ultimo_error = null
  returning id into v_id;
  return v_id;
end;
$$;

-- Entrega la conexión con el token descifrado. Solo el servidor: el webhook
-- (por cuenta_id) y conversacion-responder (por empresa).
drop function if exists public.fn_canal_meta_credencial(text, text, uuid);
create or replace function public.fn_canal_meta_credencial(p_canal text, p_cuenta_id text default null, p_empresa uuid default null)
returns table (empresa_id uuid, cuenta_id text, cuenta_nombre text, token text)
language sql
security definer
stable
set search_path = public, vault
as $$
  select c.empresa_id, c.cuenta_id, c.cuenta_nombre, coalesce(ds.decrypted_secret, '')
  from public.canales_meta c
  left join vault.decrypted_secrets ds on ds.id = c.token_secret_id
  where c.canal = p_canal
    and c.activo
    and (p_cuenta_id is null or c.cuenta_id = p_cuenta_id)
    and (p_empresa is null or c.empresa_id = p_empresa)
  order by c.conectado_en desc
  limit 1;
$$;

-- Desconectar desde la app (solo admin). Desactiva y borra el token: una
-- página desconectada no debe seguir pudiendo responder.
drop function if exists public.fn_canal_meta_desconectar(uuid, uuid);
create or replace function public.fn_canal_meta_desconectar(p_id uuid, p_empresa_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_impersonando boolean := p_empresa_id is not null and public.is_platform_admin();
  v_empresa uuid := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;
  v_secret uuid;
begin
  if not v_impersonando and public.mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede desconectar canales';
  end if;
  select token_secret_id into v_secret
    from public.canales_meta
   where id = p_id and empresa_id = v_empresa;
  update public.canales_meta
     set activo = false, token_secret_id = null
   where id = p_id and empresa_id = v_empresa;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

revoke all on function public.fn_canal_meta_guardar(uuid, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.fn_canal_meta_credencial(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.fn_canal_meta_desconectar(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.fn_canal_meta_guardar(uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.fn_canal_meta_credencial(text, text, uuid) to service_role;
grant execute on function public.fn_canal_meta_desconectar(uuid, uuid) to authenticated;
