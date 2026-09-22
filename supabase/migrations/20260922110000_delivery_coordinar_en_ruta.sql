-- Permite asignar motoboy a solicitudes creadas antes del nuevo flujo, ya en ruta.
-- Su estado no retrocede al coordinar el viaje.
create or replace function public.fn_delivery_coordinar_viaje(
  p_solicitud_id uuid, p_tipo text, p_sucursal_id text,
  p_sucursal_nombre text, p_sucursal_direccion text,
  p_motoboy_id uuid, p_fecha date, p_bloque text, p_distancia_km numeric
)
returns table (viaje_id uuid, acceso_token text, monto numeric)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_solicitud public.delivery_solicitudes%rowtype;
  v_motoboy public.delivery_motoboys%rowtype;
  v_viaje public.delivery_viajes%rowtype;
  v_token text;
  v_cliente_direccion text;
  v_estado text;
begin
  if auth.uid() is null or not (
    (public.mi_rol() in ('admin','encargado') and public.mi_empresa_id() is not null)
    or public.is_platform_admin()
  ) then
    raise exception 'No tienes permiso para coordinar viajes';
  end if;
  if p_tipo not in ('retiro','entrega') or p_fecha is null
     or p_distancia_km is null or p_distancia_km <= 0
     or length(trim(coalesce(p_sucursal_id,''))) = 0
     or length(trim(coalesce(p_sucursal_direccion,''))) = 0 then
    raise exception 'Completa el tipo, fecha, sucursal y kilómetros del viaje';
  end if;

  select * into v_solicitud from public.delivery_solicitudes
    where id = p_solicitud_id for update;
  if not found or (v_solicitud.empresa_id <> public.mi_empresa_id()
     and not public.is_platform_admin()) then
    raise exception 'Solicitud no disponible';
  end if;
  if not exists (select 1 from public.empresa_modulos
      where empresa_id = v_solicitud.empresa_id and modulo = 'delivery' and activo) then
    raise exception 'Delivery no está habilitado para esta empresa';
  end if;
  if (p_tipo = 'retiro' and v_solicitud.estado not in ('nueva','retiro_agendado','en_ruta_retiro'))
     or (p_tipo = 'entrega' and v_solicitud.estado not in ('por_entregar','entrega_agendada','en_ruta_entrega')) then
    raise exception 'La solicitud no está en una etapa que se pueda coordinar';
  end if;

  select * into v_motoboy from public.delivery_motoboys
    where id = p_motoboy_id and empresa_id = v_solicitud.empresa_id and activo;
  if not found then raise exception 'Selecciona un motoboy activo de esta empresa'; end if;

  v_cliente_direccion := case when p_tipo = 'entrega'
    then coalesce(nullif(trim(v_solicitud.entrega_direccion), ''), v_solicitud.direccion)
         || ', ' || coalesce(nullif(trim(v_solicitud.entrega_comuna), ''), v_solicitud.comuna)
    else v_solicitud.direccion || ', ' || v_solicitud.comuna end;
  v_estado := case
    when v_solicitud.estado in ('en_ruta_retiro','en_ruta_entrega') then v_solicitud.estado
    when p_tipo = 'retiro' then 'retiro_agendado'
    else 'entrega_agendada' end;
  v_token := encode(gen_random_bytes(32), 'hex');

  update public.delivery_solicitudes
    set estado = v_estado,
        fecha_preferida = case when p_tipo = 'retiro' then p_fecha else fecha_preferida end,
        bloque_horario = case when p_tipo = 'retiro' then nullif(trim(p_bloque), '') else bloque_horario end,
        entrega_fecha = case when p_tipo = 'entrega' then p_fecha else entrega_fecha end,
        entrega_bloque = case when p_tipo = 'entrega' then nullif(trim(p_bloque), '') else entrega_bloque end
    where id = p_solicitud_id;

  insert into public.delivery_viajes (
    empresa_id, solicitud_id, tipo, motoboy_id, estado,
    sucursal_id, sucursal_nombre, sucursal_direccion, cliente_direccion,
    fecha, bloque, distancia_km, distancia_fuente, tarifa_km, minimo_viaje,
    acceso_hash, acceso_expira
  ) values (
    v_solicitud.empresa_id, p_solicitud_id, p_tipo, p_motoboy_id, 'asignado',
    trim(p_sucursal_id), trim(p_sucursal_nombre), trim(p_sucursal_direccion), v_cliente_direccion,
    p_fecha, nullif(trim(p_bloque), ''), p_distancia_km, 'manual',
    v_motoboy.tarifa_km, v_motoboy.minimo_viaje,
    encode(digest(v_token, 'sha256'), 'hex'), now() + interval '30 days'
  )
  on conflict (solicitud_id, tipo) do update set
    motoboy_id = excluded.motoboy_id, estado = 'asignado',
    sucursal_id = excluded.sucursal_id, sucursal_nombre = excluded.sucursal_nombre,
    sucursal_direccion = excluded.sucursal_direccion, cliente_direccion = excluded.cliente_direccion,
    fecha = excluded.fecha, bloque = excluded.bloque,
    distancia_km = excluded.distancia_km, distancia_fuente = excluded.distancia_fuente,
    tarifa_km = excluded.tarifa_km, minimo_viaje = excluded.minimo_viaje,
    acceso_hash = excluded.acceso_hash, acceso_expira = excluded.acceso_expira
  returning * into v_viaje;

  return query select v_viaje.id, v_token, v_viaje.monto;
end $$;

revoke all on function public.fn_delivery_coordinar_viaje(uuid,text,text,text,text,uuid,date,text,numeric) from public, anon;
grant execute on function public.fn_delivery_coordinar_viaje(uuid,text,text,text,text,uuid,date,text,numeric) to authenticated;
