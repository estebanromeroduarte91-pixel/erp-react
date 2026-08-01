-- Fase 3, punto 4: confirmar una venta del POS pasa de ser 5 escrituras de
-- red independientes y seguidas (venta, movimiento, ajuste de stock, lotes
-- FIFO, entrega de OT) a UNA sola transacción atómica del servidor. Si la
-- conexión se corta a mitad de camino, ya no queda nada aplicado a medias —
-- o se guarda todo, o no se guarda nada.
--
-- Requiere fn_ajustar_stock (delta atómico sobre producto_stock) y
-- mi_empresa_id() ya existentes.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

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
begin
  if v_empresa_id is null then
    raise exception 'No autenticado';
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
  select
    i->>'id', p_venta->>'id', v_empresa_id, i->>'producto_id', i->>'producto_nombre',
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

  if p_ajustes_stock is not null then
    perform public.fn_ajustar_stock(p_ajustes_stock);
  end if;

  if p_lotes is not null then
    update public.lotes_inventario l
    set cantidad_restante = (x->>'cantidad_restante')::numeric
    from jsonb_array_elements(p_lotes) x
    where l.id = x->>'id' and l.empresa_id = v_empresa_id;
  end if;

  if p_orden is not null then
    update public.ordenes
    set status = p_orden->>'status',
        venta_id = p_orden->>'venta_id',
        numero_boleta = p_orden->>'numero_boleta',
        delivered_at = coalesce((p_orden->>'delivered_at')::timestamptz, now())
    where id = p_orden->>'id' and empresa_id = v_empresa_id;
  end if;
end;
$$;

grant execute on function public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
