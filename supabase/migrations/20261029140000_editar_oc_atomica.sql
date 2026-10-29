begin;

-- Corrige la OC y su inventario en una única transacción.
create or replace function public.fn_editar_oc(
  p_oc_id text, p_original jsonb, p_cambios jsonb,
  p_empresa_id uuid default null
) returns void
language plpgsql security definer set search_path = public
as $f$
declare
  emp uuid;
  oc public.ocs%rowtype;
  anterior jsonb;
  nuevo jsonb;
  v_items jsonb := '[]';
  ajustes jsonb := '[]';
  recs jsonb;
  bodegas jsonb;
  k text;
  fila record;
  lote record;
  ajuste record;
  recibidas numeric;
  deseadas numeric;
  inicial numeric;
  usadas numeric;
  consumidas numeric;
  quitar numeric;
  agregar numeric;
  restante numeric;
  delta numeric;
  destino text;
  producto text;
  nombre text;
  mover boolean;
  completa boolean;
  disponible numeric;
  v_total numeric := 0;
  total_rec numeric := 0;
  total_ord numeric := 0;
  v_estado text;
  audit_id text := 'oc-edicion-' || gen_random_uuid()::text;
  hoy text := to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD');
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  emp := case when p_empresa_id is not null and public.is_platform_admin()
              then p_empresa_id else public.mi_empresa_id() end;
  if emp is null or (
    not coalesce(public.is_platform_admin(), false)
    and coalesce(public.mi_rol(), '') not in ('admin', 'encargado')
  ) then raise exception 'Tu rol no tiene permiso para editar compras'; end if;

  select * into oc from public.ocs
  where empresa_id = emp and id = p_oc_id for update;
  if not found then raise exception 'OC no encontrada'; end if;
  if oc.estado = 'cancelada' then raise exception 'No se puede editar una OC cancelada'; end if;

  -- Misma normalización de campos opcionales que hidratarOC en el cliente.
  anterior := to_jsonb(oc) || jsonb_build_object(
    'items',coalesce(oc.items,'[]'::jsonb),
    'recepciones',coalesce(oc.recepciones,'[]'::jsonb),
    'proveedor_id',coalesce(oc.proveedor_id,''),
    'proveedor_nombre',coalesce(oc.proveedor_nombre,''),
    'fecha',coalesce(oc.fecha,''),'total',coalesce(oc.total,0),
    'estado',coalesce(oc.estado,'borrador'));
  -- Evita guardar sobre una recepción u otra edición concurrente.
  foreach k in array array['items','recepciones','estado','total','fecha',
    'fecha_entrega','proveedor_id','proveedor_nombre','bodega_id','bodega_nombre',
    'notas','folio_factura','metodo_pago','fecha_confirmacion'] loop
    if (anterior->k) is distinct from coalesce(p_original->k, 'null'::jsonb) then
      raise exception 'La OC cambió mientras la editabas. Cierra y vuelve a abrirla.';
    end if;
  end loop;

  if p_cambios is null or jsonb_typeof(p_cambios->'items') is distinct from 'array'
     or jsonb_array_length(p_cambios->'items') = 0 then
    raise exception 'Agrega al menos un producto';
  end if;
  if nullif(p_cambios->>'fecha', '') is null then raise exception 'Ingresa una fecha'; end if;
  perform (p_cambios->>'fecha')::date;
  if p_cambios ? 'metodo_pago' and p_cambios->>'metodo_pago' not in ('banco','caja','credito') then
    raise exception 'Método de pago inválido';
  end if;

  select datos::jsonb into bodegas from public.erp_data
  where empresa_id = emp and clave = 'bodegas';
  if jsonb_typeof(bodegas) = 'string' then bodegas := (bodegas #>> '{}')::jsonb; end if;
  bodegas := coalesce(bodegas, '[]'::jsonb);

  for nuevo in select value from jsonb_array_elements(p_cambios->'items') loop
    if nullif(nuevo->>'id','') is null or nullif(trim(nuevo->>'producto_nombre'),'') is null
       or coalesce((nuevo->>'cantidad')::numeric,0) <= 0
       or (nuevo->>'cantidad')::numeric <> trunc((nuevo->>'cantidad')::numeric)
       or coalesce((nuevo->>'precio_neto')::numeric,-1) < 0
       or coalesce((nuevo->>'precio_iva')::numeric,-1) < 0 then
      raise exception 'Revisa producto, cantidad entera positiva y costos de cada línea';
    end if;
    select value into anterior from jsonb_array_elements(oc.items)
    where value->>'id' = nuevo->>'id';
    if nuevo is distinct from anterior then
      if not exists (select 1 from public.productos
                     where empresa_id = emp and id = nuevo->>'producto_id') then
        raise exception 'El producto % no está enlazado al catálogo de esta empresa', nuevo->>'producto_nombre';
      end if;
    end if;
    if nullif(nuevo->>'bodega_id','') is not null and not exists (
      select 1 from jsonb_array_elements(bodegas) b where b->>'id' = nuevo->>'bodega_id'
    ) then raise exception 'Bodega inválida para %', nuevo->>'producto_nombre'; end if;
    nuevo := nuevo || jsonb_build_object('subtotal',
      (nuevo->>'cantidad')::numeric * (nuevo->>'precio_iva')::numeric);
    v_total := v_total + (nuevo->>'subtotal')::numeric;
    v_items := v_items || jsonb_build_array(nuevo);
  end loop;
  if (select count(distinct e->>'id') from jsonb_array_elements(v_items) e) <> jsonb_array_length(v_items) then
    raise exception 'Hay identificadores de línea repetidos';
  end if;

  -- Las capas usadas incluyen mercadería vendida, trasladada o consumida.
  perform id from public.lotes_inventario
  where empresa_id = emp and oc_id = p_oc_id order by id for update;
  recs := coalesce(oc.recepciones, '[]'::jsonb);
  completa := oc.estado in ('recibida','confirmada') and not exists (
    select 1 from jsonb_array_elements(oc.items) it
    where (select coalesce(sum((ri->>'cantidad')::numeric),0)
      from jsonb_array_elements(recs) r,
           jsonb_array_elements(r->'items') ri
      where ri->>'prod_item_id' = it->>'id') < (it->>'cantidad')::numeric
  );

  for fila in
    select coalesce(a.e->>'id', n.e->>'id') as id, a.e as viejo, n.e as nuevo
    from jsonb_array_elements(oc.items) a(e)
    full join jsonb_array_elements(v_items) n(e) on a.e->>'id' = n.e->>'id'
  loop
    anterior := fila.viejo; nuevo := fila.nuevo;
    if anterior is not distinct from nuevo then continue; end if;
    select coalesce(sum((ri->>'cantidad')::numeric),0) into recibidas
    from jsonb_array_elements(coalesce(oc.recepciones,'[]')) r,
         jsonb_array_elements(r->'items') ri
    where ri->>'prod_item_id' = fila.id;
    deseadas := case
      when nuevo is null then 0
      when completa then recibidas + (nuevo->>'cantidad')::numeric
                                      - coalesce((anterior->>'cantidad')::numeric,0)
      else least(recibidas, (nuevo->>'cantidad')::numeric) end;
    producto := nuevo->>'producto_id';
    nombre := coalesce(nuevo->>'producto_nombre', anterior->>'producto_nombre');
    mover := nuevo is null or (anterior is not null and (
      producto is distinct from anterior->>'producto_id'
      or coalesce(nuevo->>'bodega_id','') <> coalesce(anterior->>'bodega_id','')
    ));
    select coalesce(sum(cantidad_inicial),0),
           coalesce(sum(cantidad_inicial - cantidad_restante),0)
    into inicial, usadas from public.lotes_inventario
    where empresa_id = emp and oc_id = p_oc_id and oc_item_id = fila.id;
    if inicial <> recibidas then
      raise exception 'La recepción de % no coincide con sus lotes. Requiere revisar el inventario antes de corregirla.', nombre;
    end if;
    if deseadas < usadas or (mover and usadas > 0) then
      raise exception 'No puedes retirar o cambiar %: ya se utilizaron % unidades de esta línea.', nombre, usadas;
    end if;

    destino := nullif(nuevo->>'bodega_id','');
    if destino is null then
      select bodega_id into destino from public.lotes_inventario
      where empresa_id = emp and oc_id = p_oc_id and oc_item_id = fila.id
      order by creado_en, id limit 1;
    end if;
    destino := coalesce(destino, nullif(p_cambios->>'bodega_id',''));
    if deseadas > 0 and not exists (
      select 1 from jsonb_array_elements(bodegas) b where b->>'id' = destino
    ) then raise exception 'Selecciona una bodega para %', nombre; end if;
    quitar := greatest(0, recibidas - deseadas);
    agregar := case when mover then deseadas else greatest(0,deseadas-recibidas) end;

    for lote in select * from public.lotes_inventario
      where empresa_id = emp and oc_id = p_oc_id and oc_item_id = fila.id
      order by creado_en desc, id for update
    loop
      consumidas := lote.cantidad_inicial - lote.cantidad_restante;
      if mover then restante := 0;
      else
        restante := lote.cantidad_restante - least(lote.cantidad_restante, quitar);
        quitar := greatest(0, quitar - lote.cantidad_restante);
        if agregar > 0 and lote.bodega_id = destino then
          restante := restante + agregar; agregar := 0;
        end if;
      end if;
      delta := restante - lote.cantidad_restante;
      if delta <> 0 then
        ajustes := ajustes || jsonb_build_array(jsonb_build_object(
          'producto_id', lote.producto_id, 'bodega_id', lote.bodega_id,
          'delta', delta, 'item_id', fila.id,
          'nombre', coalesce(anterior->>'producto_nombre', nombre)));
      end if;
      update public.lotes_inventario
      set cantidad_inicial = consumidas + restante, cantidad_restante = restante,
          costo_unitario = case when nuevo is not null and not mover
            then (nuevo->>'precio_neto')::numeric else lote.costo_unitario end
      where id = lote.id and empresa_id = emp;
    end loop;
    if agregar > 0 then
      insert into public.lotes_inventario
        (id, empresa_id, producto_id, bodega_id, cantidad_inicial,
         cantidad_restante, costo_unitario, origen, oc_id, oc_item_id, fecha, creado_en)
      values (gen_random_uuid()::text, emp, producto, destino, agregar, agregar,
              (nuevo->>'precio_neto')::numeric, 'oc', p_oc_id, fila.id, hoy, now());
      ajustes := ajustes || jsonb_build_array(jsonb_build_object(
        'producto_id', producto, 'bodega_id', destino, 'delta', agregar,
        'item_id', fila.id, 'nombre', nombre));
    end if;
  end loop;

  for ajuste in
    select e->>'producto_id' as producto, e->>'bodega_id' as bodega,
           sum((e->>'delta')::numeric) as delta
    from jsonb_array_elements(ajustes) e group by 1,2 order by 1,2
  loop
    insert into public.producto_stock(producto_id,bodega_id,cantidad)
    values (ajuste.producto,ajuste.bodega,0) on conflict do nothing;
    select cantidad into disponible from public.producto_stock
    where producto_id = ajuste.producto and bodega_id = ajuste.bodega for update;
    if disponible + ajuste.delta < 0 then
      raise exception 'Stock insuficiente para corregir la recepción. No se guardó ningún cambio.';
    end if;
    update public.producto_stock set cantidad = cantidad + ajuste.delta
    where producto_id = ajuste.producto and bodega_id = ajuste.bodega;
  end loop;

  -- Recepciones de corrección: conservan la historia de las recepciones originales.
  for nuevo in select value from jsonb_array_elements(ajustes) loop
    recs := recs || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text, 'fecha', hoy,
      'bodega_id', nuevo->>'bodega_id',
      'bodega_nombre', coalesce((select b->>'nombre' from jsonb_array_elements(bodegas) b
        where b->>'id' = nuevo->>'bodega_id'), ''),
      'notas', 'Corrección de OC: ' || audit_id,
      'items', jsonb_build_array(jsonb_build_object('prod_item_id', nuevo->>'item_id',
        'producto_id', nuevo->>'producto_id', 'producto_nombre', nuevo->>'nombre',
        'cantidad', (nuevo->>'delta')::numeric))));
  end loop;
  for nuevo in select value from jsonb_array_elements(ajustes) loop
    insert into public.movimientos_inventario
      (id,empresa_id,fecha,hora,tipo,productos,bodega_origen,bodega_destino,
       referencia,referencia_id,notas,usuario)
    values (gen_random_uuid()::text,emp,hoy,
      to_char(now() at time zone 'America/Santiago','HH24:MI'),'ajuste',
      jsonb_build_array(jsonb_build_object('producto_id',nuevo->>'producto_id',
        'producto_nombre',nuevo->>'nombre','cantidad',abs((nuevo->>'delta')::numeric),
        'direccion',case when (nuevo->>'delta')::numeric < 0 then '-' else '+' end)),
      case when (nuevo->>'delta')::numeric < 0 then nuevo->>'bodega_id' end,
      case when (nuevo->>'delta')::numeric > 0 then nuevo->>'bodega_id' end,
      'Edición ' || oc.numero,p_oc_id,'Corrección de recepción: ' || audit_id,auth.uid()::text);
  end loop;
  for nuevo in select value from jsonb_array_elements(v_items) loop
    select coalesce(sum((ri->>'cantidad')::numeric),0) into recibidas
    from jsonb_array_elements(recs) r, jsonb_array_elements(r->'items') ri
    where ri->>'prod_item_id' = nuevo->>'id';
    total_ord := total_ord + (nuevo->>'cantidad')::numeric;
    total_rec := total_rec + least(recibidas,(nuevo->>'cantidad')::numeric);
  end loop;
  v_estado := case when oc.estado = 'confirmada' then 'confirmada'
    when total_rec = 0 then 'borrador' when total_rec >= total_ord then 'recibida' else 'parcial' end;
  update public.ocs set items = v_items, total = v_total, recepciones = recs, estado = v_estado,
    proveedor_id = p_cambios->>'proveedor_id', proveedor_nombre = p_cambios->>'proveedor_nombre',
    fecha = p_cambios->>'fecha', fecha_entrega = p_cambios->>'fecha_entrega',
    bodega_id = p_cambios->>'bodega_id', bodega_nombre = p_cambios->>'bodega_nombre',
    notas = p_cambios->>'notas',
    folio_factura = case when p_cambios ? 'folio_factura' then p_cambios->>'folio_factura' else oc.folio_factura end,
    metodo_pago = case when p_cambios ? 'metodo_pago' then p_cambios->>'metodo_pago' else oc.metodo_pago end
  where id = p_oc_id and empresa_id = emp;
  -- La actualización anterior activa el asiento contable existente, dentro de la transacción.
  insert into public.erp_data(empresa_id,clave,datos,actualizado_en)
  values (emp,audit_id,jsonb_build_object('antes',to_jsonb(oc),
    'despues',(select to_jsonb(o) from public.ocs o where o.id=p_oc_id and o.empresa_id=emp),
    'usuario',auth.uid(),'fecha',now()),now());
end;
$f$;
revoke all on function public.fn_editar_oc(text,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.fn_editar_oc(text,jsonb,jsonb,uuid) to authenticated;
commit;
