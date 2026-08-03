-- Configura el bloqueo de ventas sin stock dentro de la misma transacción que
-- registra la venta. La clave ausente conserva el comportamiento histórico:
-- permitir la venta.

create or replace function public.fn_confirmar_venta(
  p_venta jsonb,
  p_items jsonb,
  p_movimiento jsonb default null,
  p_ajustes_stock jsonb default null,
  p_lotes jsonb default null,
  p_orden jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid := public.mi_empresa_id();
  v_permitir_sin_stock boolean;
  v_faltantes text;
  x jsonb;
  v_lote_id text;
  v_antes numeric;
  v_despues numeric;
begin
  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if public.mi_rol() not in ('admin', 'encargado', 'vendedor') then
    raise exception 'Tu rol no tiene permiso para confirmar ventas';
  end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Una venta debe incluir al menos un ítem';
  end if;

  select coalesce((datos->>'permitirVentasSinStock')::boolean, true)
    into v_permitir_sin_stock
  from public.erp_data
  where empresa_id = v_empresa_id and clave = 'ventas_config';
  v_permitir_sin_stock := coalesce(v_permitir_sin_stock, true);

  if not v_permitir_sin_stock and p_ajustes_stock is not null then
    -- Serializa ventas concurrentes de los mismos productos antes de validar.
    perform 1
    from public.producto_stock ps
    join (
      select a->>'producto_id' producto_id, a->>'bodega_id' bodega_id
      from jsonb_array_elements(p_ajustes_stock) a
      group by 1, 2
    ) req on req.producto_id = ps.producto_id and req.bodega_id = ps.bodega_id
    join public.productos p on p.id = ps.producto_id and p.empresa_id = v_empresa_id
    for update of ps;

    select string_agg(format('%s (%s disponibles, %s solicitados)', p.nombre, coalesce(ps.cantidad, 0), req.cantidad), ', ')
      into v_faltantes
    from (
      select a->>'producto_id' producto_id, a->>'bodega_id' bodega_id,
             sum(abs((a->>'delta')::numeric)) cantidad
      from jsonb_array_elements(p_ajustes_stock) a
      where (a->>'delta')::numeric < 0
      group by 1, 2
    ) req
    join public.productos p on p.id = req.producto_id and p.empresa_id = v_empresa_id
    left join public.producto_stock ps on ps.producto_id = req.producto_id and ps.bodega_id = req.bodega_id
    where coalesce(ps.cantidad, 0) < req.cantidad;

    if v_faltantes is not null then
      raise exception 'Stock insuficiente: %', v_faltantes;
    end if;
  end if;

  insert into public.ventas
    (id, empresa_id, numero, fecha, estado, cliente, metodo_pago, branch_id, branch_nombre,
     bodega_id, caja_id, ot_id, ot_num, tipo_doc, total, total_iva, fecha_creacion)
  values (
    p_venta->>'id', v_empresa_id, p_venta->>'numero', (p_venta->>'fecha')::date, p_venta->>'estado',
    p_venta->>'cliente', p_venta->>'metodo_pago', p_venta->>'branch_id', p_venta->>'branch_nombre',
    p_venta->>'bodega_id', p_venta->>'caja_id', p_venta->>'ot_id', p_venta->>'ot_num', p_venta->>'tipo_doc',
    (p_venta->>'total')::numeric, (p_venta->>'total_iva')::numeric,
    coalesce((p_venta->>'fecha_creacion')::timestamptz, now())
  );

  insert into public.venta_items
    (id, venta_id, empresa_id, producto_id, producto_nombre, cantidad, precio_neto, precio_iva,
     descuento, subtotal, costo_unitario, costo_total)
  select i->>'id', p_venta->>'id', v_empresa_id, i->>'producto_id', i->>'producto_nombre',
    (i->>'cantidad')::numeric, (i->>'precio_neto')::numeric, (i->>'precio_iva')::numeric,
    coalesce((i->>'descuento')::numeric, 0), (i->>'subtotal')::numeric,
    nullif(i->>'costo_unitario', '')::numeric, nullif(i->>'costo_total', '')::numeric
  from jsonb_array_elements(p_items) i;

  if p_movimiento is not null then
    insert into public.movimientos_inventario
      (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino, referencia, referencia_id, notas, usuario)
    values (
      p_movimiento->>'id', v_empresa_id, p_movimiento->>'fecha', p_movimiento->>'hora', p_movimiento->>'tipo',
      coalesce(p_movimiento->'productos', '[]'::jsonb), p_movimiento->>'bodega_origen', p_movimiento->>'bodega_destino',
      p_movimiento->>'referencia', p_movimiento->>'referencia_id', p_movimiento->>'notas', p_movimiento->>'usuario'
    );
  end if;
  if p_ajustes_stock is not null then perform public.fn_ajustar_stock(p_ajustes_stock); end if;

  if p_lotes is not null then
    for x in select * from jsonb_array_elements(p_lotes)
    loop
      v_lote_id := x->>'id';
      v_despues := (x->>'cantidad_restante')::numeric;
      select cantidad_restante into v_antes from public.lotes_inventario
        where id = v_lote_id and empresa_id = v_empresa_id for update;
      if v_antes is null then raise exception 'Lote no encontrado'; end if;
      if v_despues < 0 or v_despues > v_antes then raise exception 'Ajuste de lote inválido'; end if;
      update public.lotes_inventario set cantidad_restante = v_despues
        where id = v_lote_id and empresa_id = v_empresa_id;
      if v_antes > v_despues then
        insert into public.venta_lote_consumos (venta_id, lote_id, empresa_id, cantidad)
        values (p_venta->>'id', v_lote_id, v_empresa_id, v_antes - v_despues);
      end if;
    end loop;
  end if;

  if p_orden is not null then
    update public.ordenes
    set status = p_orden->>'status', venta_id = p_orden->>'venta_id',
        numero_boleta = p_orden->>'numero_boleta',
        delivered_at = coalesce((p_orden->>'delivered_at')::timestamptz, now())
    where id = p_orden->>'id' and empresa_id = v_empresa_id;
  end if;
end;
$$;

grant execute on function public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
