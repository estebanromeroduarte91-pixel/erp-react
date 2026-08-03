-- Las ventas confirmadas hasta ahora actualizan lotes_inventario con el estado
-- final, pero no guardan qué lote consumió cada venta. Eso impedía deshacer
-- FIFO de forma exacta al anular. Desde esta migración cada consumo queda
-- registrado y fn_anular_venta lo devuelve al lote original.
--
-- Alcance: las ventas emitidas ANTES de aplicar esta migración no tienen ese
-- historial y seguirán devolviendo sólo el stock agregado al anularse.

create table if not exists public.venta_lote_consumos (
  venta_id text not null,
  lote_id text not null,
  empresa_id uuid not null,
  cantidad numeric not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  primary key (venta_id, lote_id)
);

create index if not exists venta_lote_consumos_empresa_venta_idx
  on public.venta_lote_consumos (empresa_id, venta_id);

alter table public.venta_lote_consumos enable row level security;
revoke all on public.venta_lote_consumos from public, anon, authenticated;

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
  x jsonb;
  v_lote_id text;
  v_antes numeric;
  v_despues numeric;
begin
  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;
  if public.mi_rol() not in ('admin', 'encargado', 'vendedor') then
    raise exception 'Tu rol no tiene permiso para confirmar ventas';
  end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Una venta debe incluir al menos un ítem';
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
    for x in select * from jsonb_array_elements(p_lotes)
    loop
      v_lote_id := x->>'id';
      v_despues := (x->>'cantidad_restante')::numeric;
      select cantidad_restante into v_antes
        from public.lotes_inventario
        where id = v_lote_id and empresa_id = v_empresa_id
        for update;
      if v_antes is null then
        raise exception 'Lote no encontrado';
      end if;
      if v_despues < 0 or v_despues > v_antes then
        raise exception 'Ajuste de lote inválido';
      end if;
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
  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if public.mi_rol() <> 'admin' then raise exception 'Solo un administrador puede anular ventas'; end if;

  select estado, bodega_id, numero into v_estado, v_bodega_id, v_numero
  from public.ventas where id = p_venta_id and empresa_id = v_empresa_id for update;
  if v_estado is null then raise exception 'Venta no encontrada'; end if;
  if v_estado = 'anulada' then return; end if;

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
      perform public.fn_ajustar_stock(v_ajustes);
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

grant execute on function public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.fn_anular_venta(text) to authenticated;
