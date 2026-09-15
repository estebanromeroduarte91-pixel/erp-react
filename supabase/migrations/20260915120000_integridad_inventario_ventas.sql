-- Integridad operacional: el servidor pasa a ser la única fuente de verdad
-- para stock, FIFO, traslados y tomas de inventario.
--
-- Se conserva la firma anterior de fn_confirmar_venta para que una versión
-- antigua del frontend pueda convivir durante un despliegue. p_ajustes_stock y
-- p_lotes se aceptan, pero deliberadamente se ignoran: nunca se vuelven a
-- aplicar valores calculados por el navegador.

-- Elimina la firma antigua sin empresa explícita: dejarla coexistiendo
-- permitiría que un cliente desactualizado siguiera usando la lógica insegura.
drop function if exists public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb);

create or replace function public.fn_confirmar_venta(
  p_venta jsonb,
  p_items jsonb,
  p_movimiento jsonb default null,
  p_ajustes_stock jsonb default null,
  p_lotes jsonb default null,
  p_orden jsonb default null,
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
  v_permitir_sin_stock boolean;
  v_bodega_id text := nullif(trim(p_venta->>'bodega_id'), '');
  v_suma_items numeric := 0;
  v_productos_mov jsonb := '[]'::jsonb;
  v_item jsonb;
  v_producto public.productos%rowtype;
  v_lote record;
  v_cantidad numeric;
  v_restante numeric;
  v_consumir numeric;
  v_stock numeric;
  v_costo_total numeric;
  v_costo_unitario numeric;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;

  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if not v_impersonando and public.mi_rol() not in ('admin', 'encargado', 'vendedor') then
    raise exception 'Tu rol no tiene permiso para confirmar ventas';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Una venta debe incluir al menos un ítem';
  end if;
  if nullif(trim(p_venta->>'id'), '') is null then raise exception 'La venta no tiene identificador'; end if;
  if coalesce((p_venta->>'total')::numeric, -1) < 0
     or coalesce((p_venta->>'total_iva')::numeric, -1) < 0 then
    raise exception 'Los totales de la venta no son válidos';
  end if;

  select coalesce((datos->>'permitirVentasSinStock')::boolean, true)
    into v_permitir_sin_stock
  from public.erp_data
  where empresa_id = v_empresa_id and clave = 'ventas_config';
  v_permitir_sin_stock := coalesce(v_permitir_sin_stock, true);

  -- Inserta primero la cabecera. Cualquier error posterior revierte también
  -- esta fila porque toda la función corre en la misma transacción.
  insert into public.ventas
    (id, empresa_id, numero, fecha, estado, cliente, metodo_pago, branch_id, branch_nombre,
     bodega_id, caja_id, ot_id, ot_num, tipo_doc, total, total_iva, fecha_creacion)
  values (
    p_venta->>'id', v_empresa_id, p_venta->>'numero', (p_venta->>'fecha')::date,
    coalesce(nullif(p_venta->>'estado', ''), 'pagada'), p_venta->>'cliente',
    p_venta->>'metodo_pago', p_venta->>'branch_id', p_venta->>'branch_nombre',
    v_bodega_id, p_venta->>'caja_id', p_venta->>'ot_id', p_venta->>'ot_num',
    p_venta->>'tipo_doc', (p_venta->>'total')::numeric, (p_venta->>'total_iva')::numeric,
    coalesce((p_venta->>'fecha_creacion')::timestamptz, now())
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_cantidad := nullif(v_item->>'cantidad', '')::numeric;
    if v_cantidad is null or v_cantidad <= 0 or v_cantidad <> trunc(v_cantidad) then
      raise exception 'La cantidad de "%" no es válida', coalesce(v_item->>'producto_nombre', 'ítem');
    end if;
    if coalesce(nullif(v_item->>'precio_iva', '')::numeric, -1) < 0
       or coalesce(nullif(v_item->>'subtotal', '')::numeric, -1) < 0
       or coalesce(nullif(v_item->>'descuento', '')::numeric, 0) not between 0 and 100 then
      raise exception 'Los valores de "%" no son válidos', coalesce(v_item->>'producto_nombre', 'ítem');
    end if;

    v_suma_items := v_suma_items + (v_item->>'subtotal')::numeric;
    v_costo_total := coalesce(nullif(v_item->>'costo_total', '')::numeric, 0);
    v_costo_unitario := coalesce(nullif(v_item->>'costo_unitario', '')::numeric, 0);

    -- Los identificadores sintéticos corresponden al trabajo de la OT o a un
    -- repuesto histórico sin producto enlazado. No administran inventario.
    if nullif(v_item->>'producto_id', '') is not null
       and v_item->>'producto_id' <> 'ot-servicio'
       and v_item->>'producto_id' not like 'rep-%' then
      select * into v_producto
      from public.productos
      where id = v_item->>'producto_id' and empresa_id = v_empresa_id;

      if not found then
        raise exception 'El producto "%" no pertenece a la empresa', coalesce(v_item->>'producto_nombre', v_item->>'producto_id');
      end if;

      if coalesce(v_producto.tipo, 'producto') <> 'servicio' then
        if v_bodega_id is null then
          raise exception 'No se puede vender inventario sin una bodega asociada a la caja';
        end if;

        insert into public.producto_stock (producto_id, bodega_id, cantidad)
        values (v_producto.id, v_bodega_id, 0)
        on conflict (producto_id, bodega_id) do nothing;

        select cantidad into v_stock
        from public.producto_stock
        where producto_id = v_producto.id and bodega_id = v_bodega_id
        for update;

        if not v_permitir_sin_stock and coalesce(v_stock, 0) < v_cantidad then
          raise exception 'Stock insuficiente: % (% disponibles, % solicitados)',
            v_producto.nombre, coalesce(v_stock, 0), v_cantidad;
        end if;

        -- Si la empresa permite vender sin stock, se conserva el faltante como
        -- cantidad negativa. Ocultarlo en cero impedía detectar y reponerlo.
        update public.producto_stock
        set cantidad = cantidad - v_cantidad
        where producto_id = v_producto.id and bodega_id = v_bodega_id;

        -- FIFO se calcula después de bloquear cada lote. El costo enviado por
        -- el navegador no participa en el resultado contable.
        v_restante := v_cantidad;
        v_costo_total := 0;
        for v_lote in
          select id, cantidad_restante, costo_unitario
          from public.lotes_inventario
          where empresa_id = v_empresa_id
            and producto_id = v_producto.id
            and bodega_id = v_bodega_id
            and cantidad_restante > 0
          order by creado_en, fecha, id
          for update
        loop
          exit when v_restante <= 0;
          v_consumir := least(v_lote.cantidad_restante, v_restante);
          update public.lotes_inventario
          set cantidad_restante = cantidad_restante - v_consumir
          where id = v_lote.id and empresa_id = v_empresa_id;

          insert into public.venta_lote_consumos (venta_id, lote_id, empresa_id, cantidad)
          values (p_venta->>'id', v_lote.id, v_empresa_id, v_consumir)
          on conflict (venta_id, lote_id)
          do update set cantidad = public.venta_lote_consumos.cantidad + excluded.cantidad;

          v_costo_total := v_costo_total + v_consumir * coalesce(v_lote.costo_unitario, 0);
          v_restante := v_restante - v_consumir;
        end loop;

        if v_restante > 0 then
          v_costo_total := v_costo_total + v_restante * coalesce(v_producto.precio_compra, 0);
        end if;
        v_costo_total := round(v_costo_total);
        v_costo_unitario := case when v_cantidad > 0 then round(v_costo_total / v_cantidad) else 0 end;

        v_productos_mov := v_productos_mov || jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto.id,
          'producto_nombre', v_producto.nombre,
          'cantidad', v_cantidad,
          'direccion', '-'
        ));
      else
        v_costo_total := 0;
        v_costo_unitario := 0;
      end if;
    end if;

    insert into public.venta_items
      (id, venta_id, empresa_id, producto_id, producto_nombre, cantidad, precio_neto, precio_iva,
       descuento, subtotal, costo_unitario, costo_total)
    values (
      v_item->>'id', p_venta->>'id', v_empresa_id, v_item->>'producto_id',
      v_item->>'producto_nombre', v_cantidad, (v_item->>'precio_neto')::numeric,
      (v_item->>'precio_iva')::numeric, coalesce((v_item->>'descuento')::numeric, 0),
      (v_item->>'subtotal')::numeric, v_costo_unitario, v_costo_total
    );
  end loop;

  if abs(v_suma_items - (p_venta->>'total')::numeric) > 1 then
    raise exception 'El total de la venta no coincide con sus ítems';
  end if;

  if p_movimiento is not null and jsonb_array_length(v_productos_mov) > 0 then
    insert into public.movimientos_inventario
      (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino,
       referencia, referencia_id, notas, usuario)
    values (
      p_movimiento->>'id', v_empresa_id, p_movimiento->>'fecha', p_movimiento->>'hora',
      'salida', v_productos_mov, coalesce(p_movimiento->>'bodega_origen', v_bodega_id), null,
      p_movimiento->>'referencia', p_venta->>'id', p_movimiento->>'notas', p_movimiento->>'usuario'
    );
  end if;

  if p_orden is not null then
    update public.ordenes
    set status = p_orden->>'status',
        venta_id = p_venta->>'id',
        numero_boleta = p_orden->>'numero_boleta',
        delivered_at = coalesce((p_orden->>'delivered_at')::timestamptz, now())
    where id = p_orden->>'id' and empresa_id = v_empresa_id;
    if not found then raise exception 'La orden vinculada no existe'; end if;
  end if;
end;
$$;

revoke all on function public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid)
  from public, anon;
grant execute on function public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid)
  to authenticated;


-- Traslado completo y atómico. Inserta las filas ausentes, bloquea origen y
-- destino en un orden determinista, valida y recién entonces mueve todo.
create or replace function public.fn_registrar_traslado(
  p_origen_id text,
  p_destino_id text,
  p_lineas jsonb,
  p_movimiento jsonb,
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
  v_linea record;
  v_stock numeric;
  v_productos jsonb := '[]'::jsonb;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if not v_impersonando and public.mi_rol() not in ('admin', 'encargado') then
    raise exception 'Tu rol no tiene permiso para trasladar inventario';
  end if;
  if nullif(trim(p_origen_id), '') is null or nullif(trim(p_destino_id), '') is null
     or p_origen_id = p_destino_id then
    raise exception 'El origen y destino del traslado no son válidos';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El traslado no tiene productos';
  end if;

  -- Crear primero ambas existencias evita que una fila faltante escape al lock.
  insert into public.producto_stock (producto_id, bodega_id, cantidad)
  select p.id, b.id, 0
  from (
    select distinct value->>'producto_id' id
    from jsonb_array_elements(p_lineas)
  ) req
  join public.productos p on p.id = req.id and p.empresa_id = v_empresa_id
  cross join (values (p_origen_id), (p_destino_id)) b(id)
  on conflict (producto_id, bodega_id) do nothing;

  perform 1
  from public.producto_stock ps
  join public.productos p on p.id = ps.producto_id and p.empresa_id = v_empresa_id
  join (
    select distinct value->>'producto_id' id
    from jsonb_array_elements(p_lineas)
  ) req on req.id = ps.producto_id
  where ps.bodega_id in (p_origen_id, p_destino_id)
  order by ps.producto_id, ps.bodega_id
  for update of ps;

  for v_linea in
    select p.id producto_id, p.nombre,
           sum((x.value->>'cantidad')::numeric) cantidad
    from jsonb_array_elements(p_lineas) x(value)
    join public.productos p on p.id = x.value->>'producto_id' and p.empresa_id = v_empresa_id
    group by p.id, p.nombre
    order by p.id
  loop
    if v_linea.cantidad <= 0 or v_linea.cantidad <> trunc(v_linea.cantidad) then
      raise exception 'La cantidad de "%" no es válida', v_linea.nombre;
    end if;
    select cantidad into v_stock
    from public.producto_stock
    where producto_id = v_linea.producto_id and bodega_id = p_origen_id;
    if coalesce(v_stock, 0) < v_linea.cantidad then
      raise exception 'Stock insuficiente: % (% disponibles, % solicitados)',
        v_linea.nombre, coalesce(v_stock, 0), v_linea.cantidad;
    end if;

    update public.producto_stock set cantidad = cantidad - v_linea.cantidad
      where producto_id = v_linea.producto_id and bodega_id = p_origen_id;
    update public.producto_stock set cantidad = cantidad + v_linea.cantidad
      where producto_id = v_linea.producto_id and bodega_id = p_destino_id;

    v_productos := v_productos || jsonb_build_array(jsonb_build_object(
      'producto_id', v_linea.producto_id,
      'producto_nombre', v_linea.nombre,
      'cantidad', v_linea.cantidad
    ));
  end loop;

  if jsonb_array_length(v_productos) <> (
    select count(distinct value->>'producto_id') from jsonb_array_elements(p_lineas)
  ) then
    raise exception 'Uno o más productos no pertenecen a la empresa';
  end if;

  insert into public.movimientos_inventario
    (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino,
     referencia, referencia_id, notas, usuario)
  values (
    p_movimiento->>'id', v_empresa_id, p_movimiento->>'fecha', p_movimiento->>'hora',
    'traslado', v_productos, p_movimiento->>'bodega_origen', p_movimiento->>'bodega_destino',
    p_movimiento->>'referencia', p_movimiento->>'referencia_id',
    p_movimiento->>'notas', p_movimiento->>'usuario'
  );
end;
$$;

revoke all on function public.fn_registrar_traslado(text, text, jsonb, jsonb, uuid)
  from public, anon;
grant execute on function public.fn_registrar_traslado(text, text, jsonb, jsonb, uuid)
  to authenticated;


-- Una toma de inventario se guarda junto con todos sus ajustes y capas FIFO.
-- Si falla un solo producto, no queda un conteo parcialmente aplicado.
create or replace function public.fn_registrar_conteo(
  p_conteo jsonb,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_impersonando boolean;
  v_bodega_id text := nullif(trim(p_conteo->>'bodega_id'), '');
  v_item jsonb;
  v_producto public.productos%rowtype;
  v_lote record;
  v_actual numeric;
  v_contado numeric;
  v_reducir numeric;
  v_consumir numeric;
  v_suma_lotes numeric;
  v_items_guardados jsonb := '[]'::jsonb;
  v_conteo_guardado jsonb;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if not v_impersonando and public.mi_rol() not in ('admin', 'encargado') then
    raise exception 'Tu rol no tiene permiso para registrar conteos';
  end if;
  if v_bodega_id is null then raise exception 'Selecciona una bodega'; end if;
  if jsonb_typeof(p_conteo->'items') <> 'array' or jsonb_array_length(p_conteo->'items') = 0 then
    raise exception 'El conteo no tiene productos';
  end if;

  -- Filas faltantes primero y lock determinista para que venta/conteo nunca se
  -- pisen mediante un SET ejecutado fuera de una transacción.
  insert into public.producto_stock (producto_id, bodega_id, cantidad)
  select distinct p.id, v_bodega_id, 0
  from jsonb_array_elements(p_conteo->'items') x(value)
  join public.productos p on p.id = x.value->>'producto_id' and p.empresa_id = v_empresa_id
  on conflict (producto_id, bodega_id) do nothing;

  perform 1
  from public.producto_stock ps
  join public.productos p on p.id = ps.producto_id and p.empresa_id = v_empresa_id
  join jsonb_array_elements(p_conteo->'items') x(value) on x.value->>'producto_id' = ps.producto_id
  where ps.bodega_id = v_bodega_id
  order by ps.producto_id
  for update of ps;

  for v_item in select value from jsonb_array_elements(p_conteo->'items')
  loop
    select * into v_producto from public.productos
    where id = v_item->>'producto_id' and empresa_id = v_empresa_id;
    if not found then raise exception 'Un producto del conteo no pertenece a la empresa'; end if;
    if coalesce(v_producto.tipo, 'producto') = 'servicio' then
      raise exception 'El servicio "%" no administra stock', v_producto.nombre;
    end if;

    v_contado := nullif(v_item->>'contado', '')::numeric;
    if v_contado is null or v_contado < 0 or v_contado <> trunc(v_contado) then
      raise exception 'El conteo de "%" no es válido', v_producto.nombre;
    end if;
    select cantidad into v_actual from public.producto_stock
      where producto_id = v_producto.id and bodega_id = v_bodega_id;

    select coalesce(sum(cantidad_restante), 0) into v_suma_lotes
    from public.lotes_inventario
    where empresa_id = v_empresa_id and producto_id = v_producto.id
      and bodega_id = v_bodega_id and cantidad_restante > 0;

    if v_suma_lotes > v_contado then
      v_reducir := v_suma_lotes - v_contado;
      for v_lote in
        select id, cantidad_restante from public.lotes_inventario
        where empresa_id = v_empresa_id and producto_id = v_producto.id
          and bodega_id = v_bodega_id and cantidad_restante > 0
        order by creado_en, fecha, id for update
      loop
        exit when v_reducir <= 0;
        v_consumir := least(v_lote.cantidad_restante, v_reducir);
        update public.lotes_inventario set cantidad_restante = cantidad_restante - v_consumir
          where id = v_lote.id and empresa_id = v_empresa_id;
        v_reducir := v_reducir - v_consumir;
      end loop;
    elsif v_suma_lotes < v_contado then
      insert into public.lotes_inventario
        (id, empresa_id, producto_id, bodega_id, cantidad_inicial, cantidad_restante,
         costo_unitario, origen, fecha, creado_en)
      values (
        gen_random_uuid()::text, v_empresa_id, v_producto.id, v_bodega_id,
        v_contado - v_suma_lotes, v_contado - v_suma_lotes,
        coalesce(v_producto.precio_compra, 0), 'apertura',
        coalesce(p_conteo->>'fecha', to_char(current_date, 'YYYY-MM-DD')), now()
      );
    end if;

    update public.producto_stock set cantidad = v_contado
    where producto_id = v_producto.id and bodega_id = v_bodega_id;

    v_items_guardados := v_items_guardados || jsonb_build_array(
      (v_item - 'sistema' - 'diferencia') || jsonb_build_object(
        'producto_nombre', v_producto.nombre,
        'sistema', coalesce(v_actual, 0),
        'diferencia', v_contado - coalesce(v_actual, 0)
      )
    );
  end loop;

  v_conteo_guardado := (p_conteo - 'items') || jsonb_build_object('items', v_items_guardados);
  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  values (v_empresa_id, 'conteos_inventario', jsonb_build_array(v_conteo_guardado), now())
  on conflict (empresa_id, clave)
  do update set
    datos = jsonb_build_array(v_conteo_guardado) ||
            case when jsonb_typeof(public.erp_data.datos) = 'array'
                 then public.erp_data.datos else '[]'::jsonb end,
    actualizado_en = now();

  return v_conteo_guardado;
end;
$$;

revoke all on function public.fn_registrar_conteo(jsonb, uuid) from public, anon;
grant execute on function public.fn_registrar_conteo(jsonb, uuid) to authenticated;
