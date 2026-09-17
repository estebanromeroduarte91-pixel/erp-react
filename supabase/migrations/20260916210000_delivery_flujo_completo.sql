-- Delivery: flujo completo retiro → taller → entrega.
-- Va DESPUÉS de 20260916193000_modulo_delivery.sql. Es idempotente: se puede
-- volver a correr sin romper nada.

-- ── 1. Estados del recorrido completo ───────────────────────────────────────
alter table public.delivery_solicitudes
  drop constraint if exists delivery_solicitudes_estado_check;

update public.delivery_solicitudes set estado = case estado
  when 'contactada' then 'retiro_agendado'
  when 'agendada'   then 'retiro_agendado'
  when 'en_retiro'  then 'en_ruta_retiro'
  when 'recibida'   then 'en_taller'
  else estado end
where estado in ('contactada','agendada','en_retiro','recibida');

alter table public.delivery_solicitudes
  add constraint delivery_solicitudes_estado_check check (estado in (
    'nueva','retiro_agendado','en_ruta_retiro','en_taller',
    'por_entregar','entrega_agendada','en_ruta_entrega','entregada','cancelada'
  ));

-- ── 2. Enlace con la orden, datos de entrega y fotos ────────────────────────
alter table public.delivery_solicitudes
  add column if not exists orden_id text references public.ordenes(id) on delete set null,
  add column if not exists entrega_direccion text,
  add column if not exists entrega_comuna text,
  add column if not exists entrega_referencia text,
  add column if not exists entrega_fecha date,
  add column if not exists entrega_bloque text,
  add column if not exists fotos text[] not null default '{}'::text[];

create unique index if not exists delivery_solicitudes_orden_idx
  on public.delivery_solicitudes(orden_id) where orden_id is not null;

-- ── 3. Numeración DEL- por empresa (antes era una secuencia global) ─────────
drop index if exists public.delivery_solicitudes_numero_idx;
alter table public.delivery_solicitudes alter column numero drop default;
create unique index if not exists delivery_solicitudes_empresa_numero_idx
  on public.delivery_solicitudes(empresa_id, numero);

create or replace function public.fn_delivery_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Lock por empresa: dos solicitudes simultáneas no pueden tomar el mismo número.
  perform pg_advisory_xact_lock(hashtext('delivery_numero:' || new.empresa_id::text));
  select coalesce(max(numero), 0) + 1 into new.numero
    from public.delivery_solicitudes where empresa_id = new.empresa_id;
  return new;
end $$;

drop trigger if exists trg_delivery_numero on public.delivery_solicitudes;
create trigger trg_delivery_numero before insert on public.delivery_solicitudes
for each row execute function public.fn_delivery_numero();

drop sequence if exists public.delivery_solicitud_numero_seq;

-- ── 4. Historial de estados ─────────────────────────────────────────────────
create table if not exists public.delivery_eventos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.delivery_solicitudes(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  usuario_id uuid,
  creado_en timestamptz not null default now()
);
create index if not exists delivery_eventos_solicitud_idx
  on public.delivery_eventos(solicitud_id, creado_en);

alter table public.delivery_eventos enable row level security;
revoke all on public.delivery_eventos from anon;
grant select on public.delivery_eventos to authenticated;

drop policy if exists "empresa lee eventos delivery" on public.delivery_eventos;
create policy "empresa lee eventos delivery" on public.delivery_eventos
for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

create or replace function public.fn_delivery_evento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.delivery_eventos(solicitud_id, empresa_id, estado_anterior, estado_nuevo, usuario_id)
    values (new.id, new.empresa_id, null, new.estado, auth.uid());
  elsif new.estado is distinct from old.estado then
    insert into public.delivery_eventos(solicitud_id, empresa_id, estado_anterior, estado_nuevo, usuario_id)
    values (new.id, new.empresa_id, old.estado, new.estado, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_delivery_evento on public.delivery_solicitudes;
create trigger trg_delivery_evento after insert or update of estado on public.delivery_solicitudes
for each row execute function public.fn_delivery_evento();

-- ── 5. Reglas de edición ────────────────────────────────────────────────────
-- Técnicos y vendedores mueven el estado, agendan fechas y bloques, escriben
-- notas y enlazan la orden. Datos del cliente y direcciones: admin o
-- encargado. La orden enlazada tiene que ser de la misma empresa.
create or replace function public.fn_delivery_validar_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.mi_rol();
begin
  new.actualizado_en := now();
  if new.empresa_id is distinct from old.empresa_id or new.numero is distinct from old.numero then
    raise exception 'No se puede cambiar la empresa ni el número de la solicitud';
  end if;

  if new.orden_id is not null and new.orden_id is distinct from old.orden_id then
    if not exists (select 1 from public.ordenes o where o.id = new.orden_id and o.empresa_id = new.empresa_id) then
      raise exception 'La orden no pertenece a esta empresa';
    end if;
  end if;

  if auth.uid() is not null and not public.is_platform_admin() and coalesce(v_rol, '') not in ('admin','encargado') then
    if (new.nombre, new.apellido, new.rut, new.telefono, new.email, new.direccion, new.comuna,
        new.referencia_direccion, new.tipo_equipo, new.marca, new.modelo, new.falla,
        new.entrega_direccion, new.entrega_comuna, new.entrega_referencia, new.fotos)
       is distinct from
       (old.nombre, old.apellido, old.rut, old.telefono, old.email, old.direccion, old.comuna,
        old.referencia_direccion, old.tipo_equipo, old.marca, old.modelo, old.falla,
        old.entrega_direccion, old.entrega_comuna, old.entrega_referencia, old.fotos) then
      raise exception 'Solo un administrador o encargado puede editar los datos de la solicitud';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_delivery_validar_update on public.delivery_solicitudes;
create trigger trg_delivery_validar_update before update on public.delivery_solicitudes
for each row execute function public.fn_delivery_validar_update();

-- ── 6. La orden de taller mueve la solicitud sola ───────────────────────────
-- OT en "Listo"     → la solicitud pasa a "Por entregar".
-- OT en "Entregado" → la solicitud queda "Entregada".
create or replace function public.fn_delivery_sync_orden()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'Listo' then
    update public.delivery_solicitudes set estado = 'por_entregar'
     where orden_id = new.id and estado = 'en_taller';
  elsif new.status = 'Entregado' then
    update public.delivery_solicitudes set estado = 'entregada'
     where orden_id = new.id and estado in ('en_taller','por_entregar','entrega_agendada','en_ruta_entrega');
  elsif new.status in ('Chequeo','Reparación') then
    -- Si reabren la OT, la solicitud vuelve al taller.
    update public.delivery_solicitudes set estado = 'en_taller'
     where orden_id = new.id and estado in ('por_entregar','entrega_agendada');
  end if;
  return new;
end $$;

drop trigger if exists trg_delivery_sync_orden on public.ordenes;
create trigger trg_delivery_sync_orden after update of status on public.ordenes
for each row execute function public.fn_delivery_sync_orden();

-- ── 7. Fotos: bucket privado, cada empresa ve solo su carpeta ───────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-fotos', 'delivery-fotos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "delivery fotos lectura empresa" on storage.objects;
create policy "delivery fotos lectura empresa" on storage.objects
for select to authenticated
using (bucket_id = 'delivery-fotos'
  and ((storage.foldername(name))[1] = public.mi_empresa_id()::text or public.is_platform_admin()));

-- ── 8. Configuración del formulario de Steve Docs ───────────────────────────
-- Comunas y bloques los lee el formulario web desde el endpoint, así se
-- cambian acá sin tocar WordPress. turnstile_site_key se completa cuando se
-- cree el sitio en Cloudflare.
update public.delivery_formularios
   set configuracion = configuracion || jsonb_build_object(
         'comunas', coalesce(configuracion->'comunas', '["Las Condes","Lo Barnechea","Vitacura","Providencia","La Reina","Ñuñoa"]'::jsonb),
         'bloques', coalesce(configuracion->'bloques', '["10:00 – 13:00","15:00 – 19:00"]'::jsonb),
         'whatsapp', coalesce(configuracion->'whatsapp', '"56966587162"'::jsonb)
       ),
       actualizado_en = now()
 where slug = 'steve-docs';
