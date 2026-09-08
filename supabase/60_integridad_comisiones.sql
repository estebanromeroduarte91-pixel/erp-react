-- Integridad de comisiones técnicas.
-- Ejecutar después de 58_comision_manual_bruta.sql y 59_pagos_comisiones_tecnicas.sql.
--
-- Garantiza que una comisión solo se pague con una venta vigente y evita
-- anular una venta si su comisión ya generó un gasto contable.

create or replace function public.pagar_comision_tecnica(
  p_orden_id uuid,
  p_fecha date default current_date,
  p_metodo text default 'Transferencia'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden public.ordenes%rowtype;
  v_role text;
  v_gasto_id text;
begin
  select * into v_orden
  from public.ordenes
  where id = p_orden_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  select role into v_role
  from public.user_profiles
  where id = auth.uid()
    and empresa_id = v_orden.empresa_id
    and activo is distinct from false;

  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Solo un administrador puede registrar el pago de una comisión.';
  end if;

  if v_orden.comision_tecnica_pagada then
    raise exception 'Esta comisión ya fue pagada.';
  end if;

  if not coalesce(v_orden.comision_tecnica_activa, false)
     or coalesce(v_orden.comision_tecnica_monto, 0) <= 0
     or v_orden.tecnico_id is null then
    raise exception 'La orden no tiene una comisión técnica válida para pagar.';
  end if;

  if v_orden.venta_id is null or not exists (
    select 1 from public.ventas v
    where v.id = v_orden.venta_id
      and v.empresa_id = v_orden.empresa_id
      and v.estado = 'pagada'
  ) then
    raise exception 'La comisión solo se puede pagar después de confirmar una venta vigente.';
  end if;

  v_gasto_id := 'comision-ot-' || v_orden.id::text;

  insert into public.gastos (
    id, empresa_id, fecha, descripcion, monto, categoria, subcategoria,
    metodo, bodega_id, bodega_nombre, con_credito_fiscal
  ) values (
    v_gasto_id, v_orden.empresa_id, coalesce(p_fecha, current_date),
    'Comisión OT #' || v_orden.num || coalesce(' — ' || nullif(v_orden.trabajo, ''), ''),
    round(v_orden.comision_tecnica_monto), 'Comisiones', v_orden.tecnico,
    coalesce(nullif(trim(p_metodo), ''), 'Transferencia'),
    coalesce(v_orden.branch_id, 'general'), null, false
  ) on conflict (id) do nothing;

  update public.ordenes
  set comision_tecnica_pagada = true,
      comision_tecnica_pagada_at = coalesce(p_fecha, current_date),
      comision_tecnica_gasto_id = v_gasto_id
  where id = v_orden.id;

  return jsonb_build_object('orden_id', v_orden.id, 'gasto_id', v_gasto_id, 'monto', round(v_orden.comision_tecnica_monto));
end;
$$;

-- La firma vigente incluye p_empresa_id por el soporte de impersonación.
-- Se conserva ese comportamiento y se suma la protección contable.
create or replace function public.fn_anular_venta(
  p_venta_id text,
  p_empresa_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_impersonando boolean;
  v_estado text;
  v_bodega_id text;
  v_numero text;
  v_ajustes jsonb;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;

  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if not v_impersonando and coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Solo un administrador puede anular ventas';
  end if;

  select estado, bodega_id, numero into v_estado, v_bodega_id, v_numero
  from public.ventas where id = p_venta_id and empresa_id = v_empresa_id for update;
  if v_estado is null then raise exception 'Venta no encontrada'; end if;
  if v_estado = 'anulada' then return; end if;

  if exists (
    select 1 from public.ordenes o
    where o.empresa_id = v_empresa_id
      and o.venta_id = p_venta_id
      and coalesce(o.comision_tecnica_pagada, false)
  ) then
    raise exception 'No puedes anular esta venta porque su comisión técnica ya fue pagada. Primero regulariza el gasto de comisión.';
  end if;

  update public.ventas set estado = 'anulada' where id = p_venta_id and empresa_id = v_empresa_id;

  update public.lotes_inventario l
  set cantidad_restante = l.cantidad_restante + c.cantidad
  from public.venta_lote_consumos c
  where c.venta_id = p_venta_id and c.empresa_id = v_empresa_id and l.id = c.lote_id and l.empresa_id = v_empresa_id;

  if v_bodega_id is not null then
    select jsonb_agg(jsonb_build_object('producto_id', vi.producto_id, 'bodega_id', v_bodega_id, 'delta', vi.cantidad)) into v_ajustes
    from public.venta_items vi join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa_id
    where vi.venta_id = p_venta_id and vi.empresa_id = v_empresa_id;
    if v_ajustes is not null then
      perform public.fn_ajustar_stock(v_ajustes, p_empresa_id);
      insert into public.movimientos_inventario
        (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino, referencia, referencia_id, notas, usuario)
      values (
        gen_random_uuid()::text, v_empresa_id, to_char(now(), 'YYYY-MM-DD'), to_char(now(), 'HH24:MI'), 'anulacion_venta',
        (select jsonb_agg(jsonb_build_object('producto_id', vi.producto_id, 'cantidad', vi.cantidad)) from public.venta_items vi join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa_id where vi.venta_id = p_venta_id and vi.empresa_id = v_empresa_id),
        null, v_bodega_id, 'Anulación venta ' || coalesce(v_numero, p_venta_id), p_venta_id,
        'Reversión automática de stock y lotes FIFO por anulación', 'admin'
      );
    end if;
  end if;
end;
$$;

grant execute on function public.pagar_comision_tecnica(uuid, date, text) to authenticated;
grant execute on function public.fn_anular_venta(text, uuid) to authenticated;
