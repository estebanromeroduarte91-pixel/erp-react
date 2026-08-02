-- Punto #2 del audit: las RPC de ventas/compras confiaban en el cliente más
-- de lo debido. Esta migración cierra 2 huecos distintos encontrados al
-- revisar el código real:
--
-- 1) fn_ajustar_stock tenía EXECUTE otorgado a `anon` y `PUBLIC` (verificado
--    contra la base real), sin SECURITY DEFINER y sin ninguna validación de
--    empresa_id — cualquier persona en internet, sin sesión, podía llamarla
--    directo por REST y modificar el stock de cualquier empresa. Además
--    `producto_stock` no tiene columna empresa_id, así que ni con sesión
--    autenticada había forma de acotar el ajuste a la propia empresa.
--    Se cierra: se revoca el acceso público/anon/authenticated (solo la
--    llaman internamente fn_confirmar_venta / fn_recibir_oc, que son
--    SECURITY DEFINER — no necesitan grant explícito para llamarla), se
--    vuelve SECURITY DEFINER, y se valida que cada producto_id pertenezca
--    a la empresa de quien llama (vía productos.empresa_id, que sí existe).
--
-- 2) fn_confirmar_venta / fn_recibir_oc solo exigían `authenticated` — un
--    técnico (sin permiso de ventas/compras en la UI) podía llamarlas
--    directo por API. Se agrega un chequeo contra user_profiles.role, que
--    ya es una columna real protegida por trigger (solo un admin puede
--    cambiar el rol de otro usuario, ver 14_bloqueo_escalacion_rol.sql).
--
-- NOTA: no cubre bodega_id (no tiene tabla propia, es configuración libre
-- por empresa) — pero al quedar producto_id acotado a la propia empresa,
-- ya no hay forma de que una empresa toque el stock de otra.

create or replace function public.mi_rol()
returns text
language sql
security definer
stable
as $function$
  select role from public.user_profiles where id = auth.uid();
$function$;

-- 1) fn_ajustar_stock: SECURITY DEFINER + validación de empresa + sin acceso público
create or replace function public.fn_ajustar_stock(ajustes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  a jsonb;
  v_empresa_id uuid := public.mi_empresa_id();
begin
  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;

  for a in select * from jsonb_array_elements(ajustes)
  loop
    if not exists (
      select 1 from public.productos
      where id = a->>'producto_id' and empresa_id = v_empresa_id
    ) then
      raise exception 'Producto % no pertenece a tu empresa', a->>'producto_id';
    end if;

    insert into public.producto_stock (producto_id, bodega_id, cantidad)
    values (a->>'producto_id', a->>'bodega_id', greatest(0, (a->>'delta')::int))
    on conflict (producto_id, bodega_id)
    do update set cantidad = greatest(0, public.producto_stock.cantidad + (a->>'delta')::int);
  end loop;
end;
$function$;

revoke all on function public.fn_ajustar_stock(jsonb) from public, anon, authenticated;

-- 2) fn_confirmar_venta: exige rol con permiso de ventas
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

  if public.mi_rol() not in ('admin', 'encargado', 'vendedor') then
    raise exception 'Tu rol no tiene permiso para confirmar ventas';
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

-- 3) fn_recibir_oc: exige rol con permiso de compras
create or replace function public.fn_recibir_oc(
  p_oc_id text,
  p_recepciones jsonb,
  p_lotes jsonb default null,
  p_movimientos jsonb default null,
  p_ajustes_stock jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid := public.mi_empresa_id();
  v_items jsonb;
  v_estado_actual text;
  v_recepciones_nuevas jsonb;
  v_total_ord numeric := 0;
  v_total_rec numeric := 0;
  it jsonb;
  v_rec_item numeric;
  v_nuevo_estado text;
  v_hoy text := to_char(now(), 'YYYY-MM-DD');
begin
  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;

  if public.mi_rol() not in ('admin', 'encargado') then
    raise exception 'Tu rol no tiene permiso para recibir órdenes de compra';
  end if;

  select items, estado, recepciones into v_items, v_estado_actual, v_recepciones_nuevas
  from public.ocs where id = p_oc_id and empresa_id = v_empresa_id
  for update;

  if v_items is null then
    raise exception 'OC no encontrada';
  end if;

  v_recepciones_nuevas := coalesce(v_recepciones_nuevas, '[]'::jsonb) || p_recepciones;

  if v_estado_actual in ('cancelada', 'confirmada') then
    v_nuevo_estado := v_estado_actual;
  elsif jsonb_array_length(v_items) = 0 then
    v_nuevo_estado := 'borrador';
  else
    for it in select * from jsonb_array_elements(v_items)
    loop
      select coalesce(sum((ri->>'cantidad')::numeric), 0) into v_rec_item
      from jsonb_array_elements(v_recepciones_nuevas) r, jsonb_array_elements(r->'items') ri
      where ri->>'prod_item_id' = it->>'id';

      v_total_ord := v_total_ord + (it->>'cantidad')::numeric;
      v_total_rec := v_total_rec + least(v_rec_item, (it->>'cantidad')::numeric);
    end loop;

    if v_total_rec = 0 then v_nuevo_estado := 'borrador';
    elsif v_total_rec >= v_total_ord then v_nuevo_estado := 'recibida';
    else v_nuevo_estado := 'parcial';
    end if;
  end if;

  update public.ocs
  set recepciones = v_recepciones_nuevas,
      estado = v_nuevo_estado,
      fecha_primera_recepcion = coalesce(fecha_primera_recepcion, v_hoy),
      fecha_recepcion = case when v_nuevo_estado = 'recibida' then v_hoy else fecha_recepcion end
  where id = p_oc_id and empresa_id = v_empresa_id;

  if p_lotes is not null then
    insert into public.lotes_inventario
      (id, empresa_id, producto_id, bodega_id, cantidad_inicial, cantidad_restante, costo_unitario, origen, oc_id, oc_item_id, fecha, creado_en)
    select
      l->>'id', v_empresa_id, l->>'producto_id', l->>'bodega_id',
      (l->>'cantidad_inicial')::numeric, (l->>'cantidad_restante')::numeric, (l->>'costo_unitario')::numeric,
      coalesce(l->>'origen', 'oc'), l->>'oc_id', l->>'oc_item_id', l->>'fecha',
      coalesce((l->>'creado_en')::timestamptz, now())
    from jsonb_array_elements(p_lotes) l;
  end if;

  if p_movimientos is not null then
    insert into public.movimientos_inventario
      (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino, referencia, referencia_id, notas, usuario)
    select
      m->>'id', v_empresa_id, m->>'fecha', m->>'hora', m->>'tipo',
      coalesce(m->'productos', '[]'::jsonb), m->>'bodega_origen', m->>'bodega_destino',
      m->>'referencia', m->>'referencia_id', m->>'notas', m->>'usuario'
    from jsonb_array_elements(p_movimientos) m;
  end if;

  if p_ajustes_stock is not null then
    perform public.fn_ajustar_stock(p_ajustes_stock);
  end if;
end;
$$;

grant execute on function public.fn_recibir_oc(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
