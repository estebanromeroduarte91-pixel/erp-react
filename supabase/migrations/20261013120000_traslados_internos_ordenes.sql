-- Traslados físicos de órdenes entre sucursales.
-- La orden conserva su branch_id de origen mientras viaja y solo cambia de
-- sucursal cuando el destino confirma la recepción.

create table if not exists public.orden_traslados_internos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  orden_id text not null references public.ordenes(id) on delete cascade,
  orden_num text not null,
  origen_id text not null,
  origen_nombre text not null,
  destino_id text not null,
  destino_nombre text not null,
  estado text not null default 'en_transito'
    check (estado in ('en_transito', 'recibido', 'cancelado')),
  nota text,
  enviado_por uuid,
  enviado_por_nombre text,
  recibido_por uuid,
  recibido_por_nombre text,
  cancelado_por uuid,
  creado_en timestamptz not null default now(),
  recibido_en timestamptz,
  cancelado_en timestamptz,
  constraint traslado_sucursales_distintas check (origen_id <> destino_id)
);

create unique index if not exists ux_orden_traslado_interno_activo
  on public.orden_traslados_internos (empresa_id, orden_id)
  where estado = 'en_transito';

create index if not exists ix_traslado_interno_destino_estado
  on public.orden_traslados_internos (empresa_id, destino_id, estado, creado_en desc);

create index if not exists ix_traslado_interno_origen_estado
  on public.orden_traslados_internos (empresa_id, origen_id, estado, creado_en desc);

alter table public.orden_traslados_internos enable row level security;

drop policy if exists "empresa lee traslados internos" on public.orden_traslados_internos;
create policy "empresa lee traslados internos"
on public.orden_traslados_internos
for select
to authenticated
using (
  empresa_id = public.mi_empresa_id()
  or public.is_platform_admin()
);

-- Las escrituras se hacen exclusivamente por las RPC siguientes: así el
-- traslado y el cambio final de branch_id quedan dentro de una transacción.
revoke all on table public.orden_traslados_internos from anon;
revoke insert, update, delete on table public.orden_traslados_internos from authenticated;
grant select on table public.orden_traslados_internos to authenticated;

create or replace function public.fn_crear_traslado_interno(
  p_orden_id text,
  p_destino_id text,
  p_nota text default null,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_imp boolean;
  v_rol text;
  v_branch_usuario text;
  v_orden public.ordenes%rowtype;
  v_origen_nombre text;
  v_destino_nombre text;
  v_usuario_nombre text;
  v_traslado public.orden_traslados_internos%rowtype;
begin
  v_imp := p_empresa_id is not null and public.is_platform_admin();
  v_empresa := case when v_imp then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa is null then raise exception 'No autenticado'; end if;

  v_rol := public.mi_rol();
  if not v_imp and coalesce(v_rol, '') not in ('admin', 'encargado') then
    raise exception 'Solo un administrador o encargado puede trasladar órdenes' using errcode = '42501';
  end if;

  select * into v_orden
  from public.ordenes
  where id = p_orden_id and empresa_id = v_empresa
  for update;

  if not found then raise exception 'Orden no encontrada'; end if;
  if coalesce(v_orden.is_draft, false) then raise exception 'No se puede trasladar una orden incompleta'; end if;
  if v_orden.status = 'Entregado' then raise exception 'No se puede trasladar una orden entregada'; end if;
  if nullif(v_orden.branch_id, '') is null then raise exception 'La orden no tiene una sucursal de origen'; end if;
  if nullif(p_destino_id, '') is null then raise exception 'Selecciona una sucursal de destino'; end if;
  if v_orden.branch_id = p_destino_id then raise exception 'La sucursal de destino debe ser distinta al origen'; end if;

  v_branch_usuario := public.fn_mi_branch_id();
  if not v_imp and v_rol <> 'admin' and
     (v_branch_usuario is null or v_branch_usuario <> v_orden.branch_id) then
    raise exception 'Solo la sucursal que tiene la orden puede enviarla' using errcode = '42501';
  end if;

  select coalesce(b->>'nombre', b->>'name') into v_origen_nombre
  from public.erp_data ed
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(ed.datos) = 'array' then ed.datos else '[]'::jsonb end
  ) b
  where ed.empresa_id = v_empresa and ed.clave = 'bodegas' and b->>'id' = v_orden.branch_id
  limit 1;

  select coalesce(b->>'nombre', b->>'name') into v_destino_nombre
  from public.erp_data ed
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(ed.datos) = 'array' then ed.datos else '[]'::jsonb end
  ) b
  where ed.empresa_id = v_empresa and ed.clave = 'bodegas'
    and b->>'id' = p_destino_id
    and coalesce(nullif(b->>'activo', '')::boolean, true)
  limit 1;

  if v_origen_nombre is null then raise exception 'La sucursal de origen ya no está disponible'; end if;
  if v_destino_nombre is null then raise exception 'La sucursal de destino no existe o está inactiva'; end if;

  select nombre into v_usuario_nombre from public.user_profiles where id = auth.uid();

  insert into public.orden_traslados_internos (
    empresa_id, orden_id, orden_num,
    origen_id, origen_nombre, destino_id, destino_nombre,
    nota, enviado_por, enviado_por_nombre
  ) values (
    v_empresa, v_orden.id, v_orden.num,
    v_orden.branch_id, v_origen_nombre, p_destino_id, v_destino_nombre,
    nullif(left(trim(coalesce(p_nota, '')), 500), ''), auth.uid(), v_usuario_nombre
  )
  returning * into v_traslado;

  return to_jsonb(v_traslado);
exception
  when unique_violation then
    raise exception 'Esta orden ya tiene un traslado interno activo';
end;
$$;

create or replace function public.fn_recibir_traslado_interno(
  p_traslado_id uuid,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_imp boolean;
  v_rol text;
  v_branch_usuario text;
  v_usuario_nombre text;
  v_traslado public.orden_traslados_internos%rowtype;
begin
  v_imp := p_empresa_id is not null and public.is_platform_admin();
  v_empresa := case when v_imp then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa is null then raise exception 'No autenticado'; end if;

  v_rol := public.mi_rol();
  if not v_imp and coalesce(v_rol, '') not in ('admin', 'encargado') then
    raise exception 'Solo un administrador o encargado puede recibir órdenes' using errcode = '42501';
  end if;

  select * into v_traslado
  from public.orden_traslados_internos
  where id = p_traslado_id and empresa_id = v_empresa
  for update;

  if not found then raise exception 'Traslado no encontrado'; end if;
  if v_traslado.estado <> 'en_transito' then raise exception 'Este traslado ya fue procesado'; end if;

  v_branch_usuario := public.fn_mi_branch_id();
  if not v_imp and v_rol <> 'admin' and
     (v_branch_usuario is null or v_branch_usuario <> v_traslado.destino_id) then
    raise exception 'Solo la sucursal de destino puede recibir esta orden' using errcode = '42501';
  end if;

  -- Bloquea también la orden y exige que siga físicamente en el origen. Si
  -- alguien la movió por otra vía mientras viajaba, se detiene en vez de pisar.
  perform 1 from public.ordenes
  where id = v_traslado.orden_id and empresa_id = v_empresa
  for update;

  update public.ordenes
  set branch_id = v_traslado.destino_id, updated_at = now()
  where id = v_traslado.orden_id
    and empresa_id = v_empresa
    and branch_id = v_traslado.origen_id;

  if not found then
    raise exception 'La orden ya no se encuentra en la sucursal de origen';
  end if;

  select nombre into v_usuario_nombre from public.user_profiles where id = auth.uid();

  update public.orden_traslados_internos
  set estado = 'recibido',
      recibido_por = auth.uid(),
      recibido_por_nombre = v_usuario_nombre,
      recibido_en = now()
  where id = v_traslado.id
  returning * into v_traslado;

  return to_jsonb(v_traslado);
end;
$$;

create or replace function public.fn_cancelar_traslado_interno(
  p_traslado_id uuid,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_imp boolean;
  v_rol text;
  v_branch_usuario text;
  v_traslado public.orden_traslados_internos%rowtype;
begin
  v_imp := p_empresa_id is not null and public.is_platform_admin();
  v_empresa := case when v_imp then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa is null then raise exception 'No autenticado'; end if;

  v_rol := public.mi_rol();
  if not v_imp and coalesce(v_rol, '') not in ('admin', 'encargado') then
    raise exception 'Solo un administrador o encargado puede cancelar traslados' using errcode = '42501';
  end if;

  select * into v_traslado
  from public.orden_traslados_internos
  where id = p_traslado_id and empresa_id = v_empresa
  for update;

  if not found then raise exception 'Traslado no encontrado'; end if;
  if v_traslado.estado <> 'en_transito' then raise exception 'Este traslado ya fue procesado'; end if;

  v_branch_usuario := public.fn_mi_branch_id();
  if not v_imp and v_rol <> 'admin' and
     (v_branch_usuario is null or v_branch_usuario <> v_traslado.origen_id) then
    raise exception 'Solo la sucursal de origen puede cancelar el traslado' using errcode = '42501';
  end if;

  update public.orden_traslados_internos
  set estado = 'cancelado', cancelado_por = auth.uid(), cancelado_en = now()
  where id = v_traslado.id
  returning * into v_traslado;

  return to_jsonb(v_traslado);
end;
$$;

revoke all on function public.fn_crear_traslado_interno(text, text, text, uuid) from public, anon;
revoke all on function public.fn_recibir_traslado_interno(uuid, uuid) from public, anon;
revoke all on function public.fn_cancelar_traslado_interno(uuid, uuid) from public, anon;
grant execute on function public.fn_crear_traslado_interno(text, text, text, uuid) to authenticated;
grant execute on function public.fn_recibir_traslado_interno(uuid, uuid) to authenticated;
grant execute on function public.fn_cancelar_traslado_interno(uuid, uuid) to authenticated;

-- Entrega instantánea de la bandeja "Por recibir" entre sesiones abiertas.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'orden_traslados_internos'
     ) then
    alter publication supabase_realtime add table public.orden_traslados_internos;
  end if;
end;
$$;
