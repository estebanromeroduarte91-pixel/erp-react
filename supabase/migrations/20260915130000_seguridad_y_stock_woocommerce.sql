-- WooCommerce: credenciales fuera de las tablas expuestas y aplicación de
-- stock idempotente por línea de pedido.

alter table public.woo_conexiones
  add column if not exists consumer_key_secret_id uuid,
  add column if not exists consumer_secret_secret_id uuid,
  add column if not exists webhook_secret_id uuid;

alter table public.woo_conexiones alter column secret drop not null;

-- Migra credenciales existentes a Supabase Vault. El bloque es reejecutable:
-- solo crea un secreto cuando la referencia todavía está vacía.
do $$
declare
  r record;
begin
  for r in select * from public.woo_conexiones for update
  loop
    if r.consumer_key_secret_id is null and nullif(r.consumer_key, '') is not null then
      update public.woo_conexiones
      set consumer_key_secret_id = vault.create_secret(
        r.consumer_key, 'woo_ck_' || r.empresa_id::text, 'WooCommerce consumer key'
      ) where id = r.id;
    end if;
    if r.consumer_secret_secret_id is null and nullif(r.consumer_secret, '') is not null then
      update public.woo_conexiones
      set consumer_secret_secret_id = vault.create_secret(
        r.consumer_secret, 'woo_cs_' || r.empresa_id::text, 'WooCommerce consumer secret'
      ) where id = r.id;
    end if;
    if r.webhook_secret_id is null and nullif(r.secret, '') is not null then
      update public.woo_conexiones
      set webhook_secret_id = vault.create_secret(
        r.secret, 'woo_webhook_' || r.empresa_id::text, 'WooCommerce webhook secret'
      ) where id = r.id;
    end if;
  end loop;
end $$;

-- No queda ninguna credencial reutilizable en la tabla de aplicación.
update public.woo_conexiones
set consumer_key = null, consumer_secret = null, secret = null
where consumer_key_secret_id is not null
   or consumer_secret_secret_id is not null
   or webhook_secret_id is not null;

drop policy if exists "empresa gestiona su conexion woo" on public.woo_conexiones;
revoke all on public.woo_conexiones from public, anon, authenticated;


-- Estado seguro para la interfaz: nunca devuelve tokens ni secretos.
create or replace function public.fn_woo_estado(p_empresa_id uuid default null)
returns table (site_url text, activa boolean, bodega_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  v_empresa := case
    when p_empresa_id is not null and public.is_platform_admin() then p_empresa_id
    else public.mi_empresa_id()
  end;
  if v_empresa is null then raise exception 'No autenticado'; end if;
  return query
    select c.site_url, c.activa, c.bodega_id
    from public.woo_conexiones c where c.empresa_id = v_empresa;
end;
$$;

revoke all on function public.fn_woo_estado(uuid) from public, anon;
grant execute on function public.fn_woo_estado(uuid) to authenticated;


-- Solo las Edge Functions (service_role) pueden guardar o recuperar secretos.
create or replace function public.fn_woo_guardar_conexion(
  p_empresa uuid,
  p_site_url text,
  p_consumer_key text,
  p_consumer_secret text,
  p_bodega_id text
)
returns table (id uuid, token text, webhook_secret text)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_conexion public.woo_conexiones%rowtype;
  v_ck_id uuid;
  v_cs_id uuid;
  v_wh_id uuid;
  v_webhook text;
begin
  if auth.role() <> 'service_role' then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa) then
    raise exception 'Empresa no encontrada';
  end if;

  select * into v_conexion from public.woo_conexiones
  where empresa_id = p_empresa for update;

  if found then
    delete from vault.secrets where vault.secrets.id in (
      v_conexion.consumer_key_secret_id,
      v_conexion.consumer_secret_secret_id
    );
    v_wh_id := v_conexion.webhook_secret_id;
    if v_wh_id is null then
      v_webhook := encode(gen_random_bytes(24), 'hex');
      v_wh_id := vault.create_secret(v_webhook, 'woo_webhook_' || p_empresa::text, 'WooCommerce webhook secret');
    else
      select decrypted_secret into v_webhook from vault.decrypted_secrets where vault.decrypted_secrets.id = v_wh_id;
    end if;
  else
    v_webhook := encode(gen_random_bytes(24), 'hex');
    v_wh_id := vault.create_secret(v_webhook, 'woo_webhook_' || p_empresa::text, 'WooCommerce webhook secret');
  end if;

  v_ck_id := vault.create_secret(p_consumer_key, 'woo_ck_' || p_empresa::text, 'WooCommerce consumer key');
  v_cs_id := vault.create_secret(p_consumer_secret, 'woo_cs_' || p_empresa::text, 'WooCommerce consumer secret');

  insert into public.woo_conexiones
    (empresa_id, site_url, bodega_id, activa, consumer_key_secret_id,
     consumer_secret_secret_id, webhook_secret_id, consumer_key, consumer_secret, secret)
  values
    (p_empresa, p_site_url, p_bodega_id, true, v_ck_id, v_cs_id, v_wh_id, null, null, null)
  on conflict (empresa_id) do update set
    site_url = excluded.site_url,
    bodega_id = excluded.bodega_id,
    activa = true,
    consumer_key_secret_id = excluded.consumer_key_secret_id,
    consumer_secret_secret_id = excluded.consumer_secret_secret_id,
    webhook_secret_id = excluded.webhook_secret_id,
    consumer_key = null,
    consumer_secret = null,
    secret = null
  returning public.woo_conexiones.* into v_conexion;

  return query select v_conexion.id, v_conexion.token, v_webhook;
end;
$$;

revoke all on function public.fn_woo_guardar_conexion(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_woo_guardar_conexion(uuid, text, text, text, text)
  to service_role;


create or replace function public.fn_woo_obtener_conexion(p_empresa uuid)
returns table (
  site_url text, consumer_key text, consumer_secret text,
  bodega_id text, activa boolean
)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'No autorizado'; end if;
  return query
    select c.site_url, ck.decrypted_secret, cs.decrypted_secret, c.bodega_id, c.activa
    from public.woo_conexiones c
    left join vault.decrypted_secrets ck on ck.id = c.consumer_key_secret_id
    left join vault.decrypted_secrets cs on cs.id = c.consumer_secret_secret_id
    where c.empresa_id = p_empresa;
end;
$$;

revoke all on function public.fn_woo_obtener_conexion(uuid) from public, anon, authenticated;
grant execute on function public.fn_woo_obtener_conexion(uuid) to service_role;


create or replace function public.fn_woo_obtener_webhook(p_token text)
returns table (empresa_id uuid, webhook_secret text)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'No autorizado'; end if;
  return query
    select c.empresa_id, wh.decrypted_secret
    from public.woo_conexiones c
    join vault.decrypted_secrets wh on wh.id = c.webhook_secret_id
    where c.token = p_token and c.activa = true;
end;
$$;

revoke all on function public.fn_woo_obtener_webhook(text) from public, anon, authenticated;
grant execute on function public.fn_woo_obtener_webhook(text) to service_role;


-- La cola de salida también obtiene las credenciales desde Vault, únicamente
-- dentro de esta función cerrada a service_role.
create or replace function public.fn_woo_pendientes(p_limite int default 20)
returns table (
  empresa_id uuid, producto_id text, sku text, nombre text,
  descripcion text, precio numeric, stock int, woo_product_id bigint,
  site_url text, consumer_key text, consumer_secret text
)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'No autorizado'; end if;
  return query
    select
      q.empresa_id, q.producto_id, p.sku, p.nombre,
      coalesce(p.descripcion, ''), p.precio_venta,
      coalesce((select ps.cantidad from public.producto_stock ps
                where ps.producto_id = p.id and ps.bodega_id = c.bodega_id), 0)::int,
      p.woo_product_id, c.site_url, ck.decrypted_secret, cs.decrypted_secret
    from public.woo_sync_cola q
    join public.productos p on p.id = q.producto_id and p.empresa_id = q.empresa_id
    join public.woo_conexiones c on c.empresa_id = q.empresa_id and c.activa = true
    join vault.decrypted_secrets ck on ck.id = c.consumer_key_secret_id
    join vault.decrypted_secrets cs on cs.id = c.consumer_secret_secret_id
    where p.vender_online = true and c.site_url is not null and q.intentos < 5
    order by q.creado_en
    limit greatest(1, least(coalesce(p_limite, 20), 100));
end;
$$;

revoke all on function public.fn_woo_pendientes(int) from public, anon, authenticated;
grant execute on function public.fn_woo_pendientes(int) to service_role;


-- Estado por línea: permite reintentar un SKU que antes no estaba asociado y
-- revertir exactamente lo que realmente se descontó.
create table if not exists public.woo_pedido_lineas (
  empresa_id uuid not null references public.empresas(id),
  order_id text not null,
  linea_id text not null,
  sku text,
  producto_id text,
  cantidad numeric not null default 0 check (cantidad >= 0),
  aplicada boolean not null default false,
  motivo text,
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, order_id, linea_id)
);

alter table public.woo_pedido_lineas enable row level security;
revoke all on public.woo_pedido_lineas from public, anon, authenticated;


create or replace function public.fn_woo_aplicar_pedido(
  p_token text,
  p_order_id text,
  p_estado text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_bodega text;
  v_estado text := lower(trim(coalesce(p_estado, '')));
  v_deseado text;
  v_item jsonb;
  v_ordinal bigint;
  v_linea_id text;
  v_sku text;
  v_cantidad numeric;
  v_producto_id text;
  v_producto_nombre text;
  v_coincidencias int;
  v_anterior public.woo_pedido_lineas%rowtype;
  v_delta numeric;
  v_aplicados jsonb := '[]'::jsonb;
  v_ignorados jsonb := '[]'::jsonb;
  v_vistos text[] := array[]::text[];
  v_quitada record;
begin
  select c.empresa_id, c.bodega_id into v_empresa, v_bodega
  from public.woo_conexiones c where c.token = p_token and c.activa = true;
  if not found then return jsonb_build_object('ok', false, 'error', 'Conexión no encontrada o desactivada'); end if;

  if v_estado in ('processing', 'completed') then v_deseado := 'salida';
  elsif v_estado in ('cancelled', 'refunded', 'failed') then v_deseado := 'entrada';
  else return jsonb_build_object('ok', true, 'ignorado', 'El estado "' || v_estado || '" no mueve stock');
  end if;

  if jsonb_typeof(p_items) <> 'array' then raise exception 'Los ítems del pedido no son válidos'; end if;

  -- Serializa todos los webhooks del mismo pedido, incluso antes de que exista
  -- una fila en woo_pedidos.
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text || ':' || p_order_id, 0));

  if v_deseado = 'entrada' then
    for v_quitada in
      select l.*, p.nombre producto_nombre
      from public.woo_pedido_lineas l
      join public.productos p on p.id = l.producto_id and p.empresa_id = l.empresa_id
      where l.empresa_id = v_empresa and l.order_id = p_order_id and l.aplicada
      order by l.linea_id for update of l
    loop
      insert into public.producto_stock(producto_id, bodega_id, cantidad)
      values (v_quitada.producto_id, v_bodega, v_quitada.cantidad)
      on conflict (producto_id, bodega_id)
      do update set cantidad = public.producto_stock.cantidad + excluded.cantidad;
      update public.woo_pedido_lineas set aplicada = false, motivo = null, actualizado_en = now()
      where empresa_id = v_empresa and order_id = p_order_id and linea_id = v_quitada.linea_id;
      v_aplicados := v_aplicados || jsonb_build_array(jsonb_build_object(
        'producto_id', v_quitada.producto_id, 'producto_nombre', v_quitada.producto_nombre,
        'sku', v_quitada.sku, 'cantidad', v_quitada.cantidad, 'direccion', '+'
      ));
    end loop;
  else
    for v_item, v_ordinal in
      select value, ordinality from jsonb_array_elements(p_items) with ordinality
    loop
      v_sku := lower(trim(coalesce(v_item->>'sku', '')));
      v_linea_id := coalesce(nullif(v_item->>'id', ''), coalesce(nullif(v_item->>'producto_woo_id', ''), v_sku, 'linea') || ':' || v_ordinal::text);
      v_vistos := array_append(v_vistos, v_linea_id);
      v_cantidad := coalesce(nullif(v_item->>'cantidad', '')::numeric, 1);
      if v_cantidad <= 0 or v_cantidad <> trunc(v_cantidad) then
        raise exception 'Cantidad inválida en la línea %', v_linea_id;
      end if;

      select * into v_anterior from public.woo_pedido_lineas
      where empresa_id = v_empresa and order_id = p_order_id and linea_id = v_linea_id
      for update;

      if v_sku = '' then
        if v_anterior.aplicada and v_anterior.producto_id is not null then
          insert into public.producto_stock(producto_id, bodega_id, cantidad)
          values (v_anterior.producto_id, v_bodega, v_anterior.cantidad)
          on conflict (producto_id, bodega_id)
          do update set cantidad = public.producto_stock.cantidad + excluded.cantidad;
          v_aplicados := v_aplicados || jsonb_build_array(jsonb_build_object(
            'producto_id', v_anterior.producto_id, 'producto_nombre', 'Producto restaurado',
            'sku', v_anterior.sku, 'cantidad', v_anterior.cantidad, 'direccion', '+'
          ));
        end if;
        insert into public.woo_pedido_lineas(empresa_id, order_id, linea_id, sku, cantidad, aplicada, motivo)
        values (v_empresa, p_order_id, v_linea_id, null, v_cantidad, false, 'el producto no tiene SKU en la tienda')
        on conflict (empresa_id, order_id, linea_id) do update
          set sku = null, producto_id = null, cantidad = excluded.cantidad,
              aplicada = false, motivo = excluded.motivo, actualizado_en = now();
        v_ignorados := v_ignorados || jsonb_build_array(jsonb_build_object('nombre', v_item->>'nombre', 'motivo', 'el producto no tiene SKU en la tienda'));
        continue;
      end if;

      select count(*), min(p.id), min(p.nombre)
        into v_coincidencias, v_producto_id, v_producto_nombre
      from public.productos p where p.empresa_id = v_empresa and lower(trim(p.sku)) = v_sku;

      if v_coincidencias <> 1 then
        if v_anterior.aplicada and v_anterior.producto_id is not null then
          insert into public.producto_stock(producto_id, bodega_id, cantidad)
          values (v_anterior.producto_id, v_bodega, v_anterior.cantidad)
          on conflict (producto_id, bodega_id)
          do update set cantidad = public.producto_stock.cantidad + excluded.cantidad;
          v_aplicados := v_aplicados || jsonb_build_array(jsonb_build_object(
            'producto_id', v_anterior.producto_id, 'producto_nombre', 'Producto restaurado',
            'sku', v_anterior.sku, 'cantidad', v_anterior.cantidad, 'direccion', '+'
          ));
        end if;
        insert into public.woo_pedido_lineas(empresa_id, order_id, linea_id, sku, cantidad, aplicada, motivo)
        values (v_empresa, p_order_id, v_linea_id, v_sku, v_cantidad, false,
          case when v_coincidencias = 0 then 'no existe ese SKU en Pixit' else 'hay más de un producto con ese SKU' end)
        on conflict (empresa_id, order_id, linea_id) do update
          set sku = excluded.sku, producto_id = null, cantidad = excluded.cantidad,
              aplicada = false, motivo = excluded.motivo, actualizado_en = now();
        v_ignorados := v_ignorados || jsonb_build_array(jsonb_build_object(
          'sku', v_sku, 'motivo', case when v_coincidencias = 0 then 'no existe ese SKU en Pixit' else 'hay más de un producto con ese SKU' end));
        continue;
      end if;

      -- Si una línea pagada cambió de producto, devuelve primero el producto
      -- anterior. Si solo cambió cantidad, aplica únicamente la diferencia.
      if v_anterior.aplicada and v_anterior.producto_id is distinct from v_producto_id then
        insert into public.producto_stock(producto_id, bodega_id, cantidad)
        values (v_anterior.producto_id, v_bodega, v_anterior.cantidad)
        on conflict (producto_id, bodega_id)
        do update set cantidad = public.producto_stock.cantidad + excluded.cantidad;
        v_aplicados := v_aplicados || jsonb_build_array(jsonb_build_object(
          'producto_id', v_anterior.producto_id, 'producto_nombre', 'Producto restaurado',
          'sku', v_anterior.sku, 'cantidad', v_anterior.cantidad, 'direccion', '+'
        ));
        v_delta := v_cantidad;
      elsif v_anterior.aplicada then
        v_delta := v_cantidad - v_anterior.cantidad;
      else
        v_delta := v_cantidad;
      end if;

      insert into public.producto_stock(producto_id, bodega_id, cantidad)
      values (v_producto_id, v_bodega, -v_delta)
      on conflict (producto_id, bodega_id)
      do update set cantidad = public.producto_stock.cantidad - v_delta;

      insert into public.woo_pedido_lineas
        (empresa_id, order_id, linea_id, sku, producto_id, cantidad, aplicada, motivo)
      values (v_empresa, p_order_id, v_linea_id, v_sku, v_producto_id, v_cantidad, true, null)
      on conflict (empresa_id, order_id, linea_id) do update set
        sku = excluded.sku, producto_id = excluded.producto_id, cantidad = excluded.cantidad,
        aplicada = true, motivo = null, actualizado_en = now();

      if v_delta <> 0 then
        v_aplicados := v_aplicados || jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto_id, 'producto_nombre', v_producto_nombre,
          'sku', v_sku, 'cantidad', abs(v_delta),
          'direccion', case when v_delta > 0 then '-' else '+' end
        ));
      end if;
    end loop;

    -- Una línea eliminada de un pedido ya pagado devuelve solo lo que Pixit
    -- había descontado para ella.
    for v_quitada in
      select l.*, p.nombre producto_nombre
      from public.woo_pedido_lineas l
      join public.productos p on p.id = l.producto_id and p.empresa_id = l.empresa_id
      where l.empresa_id = v_empresa and l.order_id = p_order_id and l.aplicada
        and not (l.linea_id = any(v_vistos))
      order by l.linea_id for update of l
    loop
      insert into public.producto_stock(producto_id, bodega_id, cantidad)
      values (v_quitada.producto_id, v_bodega, v_quitada.cantidad)
      on conflict (producto_id, bodega_id)
      do update set cantidad = public.producto_stock.cantidad + excluded.cantidad;
      update public.woo_pedido_lineas
      set aplicada = false, motivo = 'línea eliminada del pedido', actualizado_en = now()
      where empresa_id = v_empresa and order_id = p_order_id and linea_id = v_quitada.linea_id;
      v_aplicados := v_aplicados || jsonb_build_array(jsonb_build_object(
        'producto_id', v_quitada.producto_id, 'producto_nombre', v_quitada.producto_nombre,
        'sku', v_quitada.sku, 'cantidad', v_quitada.cantidad, 'direccion', '+'
      ));
    end loop;
  end if;

  insert into public.woo_pedidos(empresa_id, order_id, efecto)
  values (v_empresa, p_order_id, v_deseado)
  on conflict (empresa_id, order_id) do update
    set efecto = excluded.efecto, actualizado_en = now();

  if jsonb_array_length(v_aplicados) > 0 then
    insert into public.movimientos_inventario
      (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino,
       referencia, referencia_id, notas, usuario)
    values (
      gen_random_uuid()::text, v_empresa, to_char(now(), 'YYYY-MM-DD'), to_char(now(), 'HH24:MI'),
      case
        when exists (select 1 from jsonb_array_elements(v_aplicados) e where e->>'direccion' = '+')
         and exists (select 1 from jsonb_array_elements(v_aplicados) e where e->>'direccion' = '-') then 'ajuste'
        when exists (select 1 from jsonb_array_elements(v_aplicados) e where e->>'direccion' = '+') then 'entrada'
        else 'salida'
      end,
      v_aplicados,
      case when v_deseado = 'salida' then v_bodega else null end,
      case when v_deseado = 'entrada' then v_bodega else null end,
      'WooCommerce #' || p_order_id, p_order_id,
      case when v_deseado = 'salida' then 'Venta pagada en la tienda online' else 'Devolución de la tienda online' end,
      'WooCommerce'
    );
  end if;

  return jsonb_build_object('ok', true, 'estado', v_estado, 'efecto', v_deseado,
    'aplicados', v_aplicados, 'ignorados', v_ignorados);
end;
$$;

revoke all on function public.fn_woo_aplicar_pedido(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_woo_aplicar_pedido(text, text, text, jsonb)
  to service_role;
