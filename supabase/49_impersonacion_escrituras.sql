-- Continúa el arreglo de las migraciones 47 y 48 (que cubrieron las
-- LECTURAS del Panel Pixit) hacia las ESCRITURAS.
--
-- El problema era el inverso al de las lecturas: estas funciones nunca
-- mostraron datos de otra empresa, siempre escribieron en la empresa REAL de
-- quien llama. Pero como la impersonación no restringe a qué pantallas se
-- puede navegar, un platform admin que confirmara una venta, recibiera una
-- orden de compra o ajustara stock mientras impersonaba a un cliente estaba,
-- sin ningún aviso, escribiendo esa operación en SU PROPIA empresa real.
--
-- Decisión de Esteban: en vez de bloquear las escrituras durante la
-- impersonación, que las opere de verdad sobre la empresa del cliente — "es
-- más profesional si yo puedo hacerlo a la empresa de mi cliente
-- directamente". Se extiende entonces el mismo patrón ya usado en las
-- migraciones 47 y 48: `p_empresa_id` opcional, honrado únicamente si quien
-- llama es `is_platform_admin()`. Para cualquier otro usuario se ignora
-- igual que antes.
--
-- Los chequeos de rol (`mi_rol() not in (...)`) se omiten SOLO en la rama de
-- impersonación: si un platform admin no está impersonando, sigue
-- necesitando su propio rol en su propia empresa, sin cambios. `is_platform_admin()`
-- ya es la prueba de confianza elevada cuando sí está impersonando.
--
-- Se DROPEA cada función antes de recrearla: agregar un parámetro cambia la
-- identidad de la función en Postgres (nombre + tipos de argumentos), así
-- que un CREATE OR REPLACE simple habría dejado la firma vieja coexistiendo
-- y seguiría siendo llamable, sin el arreglo.

-- ── fn_ajustar_stock: la pieza común, todas las demás la llaman ───

drop function if exists public.fn_ajustar_stock(jsonb);

create or replace function public.fn_ajustar_stock(ajustes jsonb, p_empresa_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  a jsonb;
  v_empresa_id uuid;
begin
  if p_empresa_id is not null and public.is_platform_admin() then
    v_empresa_id := p_empresa_id;
  else
    v_empresa_id := public.mi_empresa_id();
  end if;

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

revoke all on function public.fn_ajustar_stock(jsonb, uuid) from public, anon, authenticated;

-- ── fn_confirmar_venta ─────────────────────────────────────────────

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
  v_faltantes text;
  x jsonb;
  v_lote_id text;
  v_antes numeric;
  v_despues numeric;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;

  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if not v_impersonando and public.mi_rol() not in ('admin', 'encargado', 'vendedor') then
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
  if p_ajustes_stock is not null then perform public.fn_ajustar_stock(p_ajustes_stock, p_empresa_id); end if;

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

grant execute on function public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid) to authenticated;

-- ── fn_recibir_oc ────────────────────────────────────────────────

drop function if exists public.fn_recibir_oc(text, jsonb, jsonb, jsonb, jsonb);

create or replace function public.fn_recibir_oc(
  p_oc_id text,
  p_recepciones jsonb,
  p_lotes jsonb default null,
  p_movimientos jsonb default null,
  p_ajustes_stock jsonb default null,
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
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;

  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;

  if not v_impersonando and public.mi_rol() not in ('admin', 'encargado') then
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
    perform public.fn_ajustar_stock(p_ajustes_stock, p_empresa_id);
  end if;
end;
$$;

grant execute on function public.fn_recibir_oc(text, jsonb, jsonb, jsonb, jsonb, uuid) to authenticated;

-- ── fn_anular_venta ──────────────────────────────────────────────

drop function if exists public.fn_anular_venta(text);

create or replace function public.fn_anular_venta(p_venta_id text, p_empresa_id uuid default null)
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
  if not v_impersonando and public.mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede anular ventas';
  end if;

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

grant execute on function public.fn_anular_venta(text, uuid) to authenticated;

-- ── fn_fijar_stock_manual ────────────────────────────────────────

drop function if exists public.fn_fijar_stock_manual(jsonb);

create or replace function public.fn_fijar_stock_manual(ajustes jsonb, p_empresa_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_impersonando boolean := p_empresa_id is not null and public.is_platform_admin();
begin
  if not v_impersonando and public.mi_empresa_id() is null then
    raise exception 'No autenticado';
  end if;

  -- Mismos roles que recibir una orden de compra: ajustar stock a mano es
  -- una tarea de administración de inventario, no de mostrador.
  if not v_impersonando and public.mi_rol() not in ('admin', 'encargado') then
    raise exception 'Tu rol no tiene permiso para ajustar stock manualmente';
  end if;

  -- La validación de empresa por producto y la atomicidad del delta siguen
  -- viviendo en `fn_ajustar_stock`: acá solo se agrega quién puede llamarla.
  perform public.fn_ajustar_stock(ajustes, p_empresa_id);
end;
$$;

revoke all on function public.fn_fijar_stock_manual(jsonb, uuid) from public, anon;
grant execute on function public.fn_fijar_stock_manual(jsonb, uuid) to authenticated;

-- ── siguiente_folio ──────────────────────────────────────────────

drop function if exists public.siguiente_folio(text);

create or replace function public.siguiente_folio(p_tipo text, p_empresa_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_valor integer;
begin
  if p_empresa_id is not null and public.is_platform_admin() then
    v_empresa_id := p_empresa_id;
  else
    v_empresa_id := public.mi_empresa_id();
  end if;

  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;

  insert into public.folios_counters (empresa_id, tipo, valor, actualizado_en)
  values (v_empresa_id, p_tipo, 1, now())
  on conflict (empresa_id, tipo)
  do update set valor = folios_counters.valor + 1, actualizado_en = now()
  returning valor into v_valor;

  return v_valor;
end;
$$;

grant execute on function public.siguiente_folio(text, uuid) to authenticated;

-- ── guardar_smtp_config ──────────────────────────────────────────
-- Distinto a los demás: esta SÍ es una capacidad nueva (antes ni siquiera
-- resolvía mal — simplemente no existía forma de pedirle otra empresa). Con
-- la decisión ya tomada de operar de verdad sobre la empresa del cliente, se
-- extiende igual: un platform admin puede configurar el SMTP del cliente
-- directamente, con su consentimiento fuera del sistema.

drop function if exists public.guardar_smtp_config(jsonb);

create or replace function public.guardar_smtp_config(p_datos jsonb, p_empresa_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_impersonando boolean;
  v_anterior jsonb := '{}'::jsonb;
  v_nuevo jsonb := coalesce(p_datos, '{}'::jsonb) - 'hasPassword';
  v_mode text;
  v_password text;
  v_secret_id uuid;
  v_port integer;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;

  if v_empresa is null then
    raise exception 'Usuario sin empresa activa';
  end if;
  if not v_impersonando and public.mi_rol() is distinct from 'admin' then
    raise exception 'Solo un administrador puede configurar el correo';
  end if;

  select datos into v_anterior
  from public.erp_data
  where empresa_id = v_empresa and clave = 'tp_smtp_config';
  v_anterior := coalesce(v_anterior, '{}'::jsonb);

  -- El campo vacío conserva la clave anterior. Una clave nueva se mueve a
  -- Supabase Vault y `erp_data` solo guarda el UUID de referencia.
  v_password := coalesce(v_nuevo->>'password', '');
  if length(v_password) > 1024 then
    raise exception 'La contraseña SMTP es demasiado larga';
  end if;
  v_nuevo := v_nuevo - 'password';
  if coalesce(v_anterior->>'password_secret_id', '') <> '' then
    v_secret_id := (v_anterior->>'password_secret_id')::uuid;
  end if;
  if v_password <> '' then
    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        v_password,
        'smtp_' || v_empresa::text,
        'Credencial SMTP cifrada de la empresa ' || v_empresa::text
      );
    else
      perform vault.update_secret(v_secret_id, v_password);
    end if;
  end if;
  if v_secret_id is not null then
    v_nuevo := jsonb_set(v_nuevo, '{password_secret_id}', to_jsonb(v_secret_id::text), true);
  end if;

  v_mode := coalesce(v_nuevo->>'mode', 'pixit');
  if v_mode not in ('pixit', 'smtp') then
    raise exception 'Modo de correo no válido';
  end if;

  if coalesce(p_datos->>'from_email', '') <> ''
     and trim(p_datos->>'from_email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'El correo remitente no es válido';
  end if;
  if coalesce(p_datos->>'reply_to', '') <> ''
     and trim(p_datos->>'reply_to') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'El correo para respuestas no es válido';
  end if;

  v_port := nullif(p_datos->>'port', '')::integer;
  if v_mode = 'smtp' then
    if trim(coalesce(p_datos->>'host', '')) = ''
       or trim(coalesce(p_datos->>'from_email', '')) = ''
       or v_secret_id is null
       or v_port is null
       or v_port not in (465, 587, 2525) then
      raise exception 'La configuración SMTP está incompleta';
    end if;
  end if;

  -- Lista blanca de campos: evita guardar propiedades arbitrarias enviadas
  -- mediante una llamada RPC manipulada desde el navegador.
  v_nuevo := jsonb_strip_nulls(jsonb_build_object(
    'mode', v_mode,
    'host', nullif(left(trim(coalesce(p_datos->>'host', '')), 253), ''),
    'port', v_port,
    'secure', case when p_datos ? 'secure' then (p_datos->>'secure')::boolean else null end,
    'user', nullif(left(trim(coalesce(p_datos->>'user', '')), 254), ''),
    'from_name', nullif(left(trim(coalesce(p_datos->>'from_name', '')), 200), ''),
    'from_email', nullif(left(trim(coalesce(p_datos->>'from_email', '')), 254), ''),
    'reply_to', nullif(left(trim(coalesce(p_datos->>'reply_to', '')), 254), ''),
    'password_secret_id', v_secret_id::text
  ));

  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  values (v_empresa, 'tp_smtp_config', v_nuevo, now())
  on conflict (empresa_id, clave) do update
    set datos = excluded.datos,
        actualizado_en = excluded.actualizado_en;
end;
$$;

revoke all on function public.guardar_smtp_config(jsonb, uuid) from public, anon, service_role;
grant execute on function public.guardar_smtp_config(jsonb, uuid) to authenticated;
