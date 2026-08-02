-- Punto #5 del audit: anular una venta solo cambiaba `estado='anulada'` desde
-- el cliente (ver comentario viejo en useAnularVenta, queries.ts) — el stock
-- vendido nunca volvía al inventario disponible. Se reemplaza por una RPC
-- que además de cambiar el estado, devuelve la cantidad vendida de cada
-- línea a `producto_stock` (misma bodega de la venta) y deja un movimiento
-- de auditoría.
--
-- LÍMITE CONOCIDO: no revierte `lotes_inventario` (consumo FIFO por costo).
-- No existe en el esquema actual un registro de "qué lote se consumió por
-- cada item de esta venta" — fn_confirmar_venta recibe de lotes ya el
-- estado final calculado por el cliente, no un log de consumo por venta.
-- Reconstruir eso a ciegas sería adivinar, así que se deja fuera: el total
-- de stock disponible queda correcto, el costeo FIFO por lote no se
-- recalcula automáticamente al anular.
--
-- Solo admin puede anular (la UI ya lo exigía así, VentasListTab.tsx — antes
-- la RPC no lo validaba, solo la UI se lo ocultaba a los demás roles).

create or replace function public.fn_anular_venta(p_venta_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid := public.mi_empresa_id();
  v_estado text;
  v_bodega_id text;
  v_numero text;
  v_ajustes jsonb;
begin
  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;

  if public.mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede anular ventas';
  end if;

  select estado, bodega_id, numero into v_estado, v_bodega_id, v_numero
  from public.ventas
  where id = p_venta_id and empresa_id = v_empresa_id
  for update;

  if v_estado is null then
    raise exception 'Venta no encontrada';
  end if;

  if v_estado = 'anulada' then
    return; -- idempotente: ya estaba anulada
  end if;

  update public.ventas set estado = 'anulada' where id = p_venta_id and empresa_id = v_empresa_id;

  -- Solo se devuelven al stock los items que corresponden a un producto real
  -- de esta empresa (las líneas de servicio, que no tienen producto_id en
  -- `productos`, nunca movieron stock al vender — no hay nada que revertir).
  if v_bodega_id is not null then
    select jsonb_agg(jsonb_build_object('producto_id', vi.producto_id, 'bodega_id', v_bodega_id, 'delta', vi.cantidad))
    into v_ajustes
    from public.venta_items vi
    join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa_id
    where vi.venta_id = p_venta_id and vi.empresa_id = v_empresa_id;

    if v_ajustes is not null then
      perform public.fn_ajustar_stock(v_ajustes);

      insert into public.movimientos_inventario
        (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino, referencia, referencia_id, notas, usuario)
      values (
        gen_random_uuid()::text, v_empresa_id, to_char(now(), 'YYYY-MM-DD'), to_char(now(), 'HH24:MI'),
        'anulacion_venta',
        (select jsonb_agg(jsonb_build_object('producto_id', vi.producto_id, 'cantidad', vi.cantidad))
         from public.venta_items vi
         join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa_id
         where vi.venta_id = p_venta_id and vi.empresa_id = v_empresa_id),
        null, v_bodega_id, 'Anulación venta ' || coalesce(v_numero, p_venta_id), p_venta_id,
        'Reversión automática de stock por anulación', 'admin'
      );
    end if;
  end if;
end;
$$;

grant execute on function public.fn_anular_venta(text) to authenticated;
