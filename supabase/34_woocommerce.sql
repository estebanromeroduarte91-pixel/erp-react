-- Integración con WooCommerce: descuenta el stock en Pixit cuando se vende algo
-- por la tienda online, y lo devuelve si el pedido se cancela o reembolsa.
--
-- Reemplaza a la Edge Function `woo-webhook` original, que nunca pudo funcionar
-- contra este esquema: buscaba `productos.woocommerce_product_id` y escribía en
-- `productos.stock`, dos columnas que dejaron de existir cuando el stock pasó a
-- `producto_stock` (por bodega) en la migración relacional. Además estaba
-- bloqueada por `verify_jwt` —WooCommerce firma con su propia cabecera, no con
-- un token de Supabase— así que la petición moría en la puerta.
--
-- Decisiones tomadas con Esteban:
--   * El emparejamiento es por SKU (los 1.470 productos tienen SKU cargado).
--   * Lo vendido online descuenta de Los Dominicos.

create table if not exists public.woo_conexiones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  -- Identifica al taller EN LA URL del webhook. Antes la empresa venía fija en
  -- una variable de entorno, así que una sola función no podía atender a más de
  -- un cliente — incompatible con vender el software.
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  -- Secreto de firma propio de cada taller (antes era uno global).
  secret text not null default encode(gen_random_bytes(24), 'hex'),
  bodega_id text not null,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

create unique index if not exists woo_conexiones_empresa_idx on public.woo_conexiones (empresa_id);

alter table public.woo_conexiones enable row level security;

create policy "empresa gestiona su conexion woo"
on public.woo_conexiones for all to authenticated
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());

create policy "Platform Admins VIP Access" on public.woo_conexiones
for all to public
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- WooCommerce reintenta los webhooks que no recibieron respuesta. Sin esta
-- tabla, un reintento descontaría el stock una segunda vez por el mismo pedido.
create table if not exists public.woo_eventos (
  empresa_id uuid not null,
  order_id text not null,
  topic text not null,
  procesado_en timestamptz not null default now(),
  primary key (empresa_id, order_id, topic)
);

alter table public.woo_eventos enable row level security;
revoke all on public.woo_eventos from public, anon, authenticated;

-- Aplica un pedido al stock. La llama la Edge Function con service_role, ya
-- habiendo validado la firma HMAC del pedido.
create or replace function public.fn_woo_aplicar_pedido(
  p_token text,
  p_order_id text,
  p_topic text,
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
  v_delta int;
  it jsonb;
  v_sku text;
  v_cant numeric;
  v_prod_id text;
  v_prod_nombre text;
  v_coincidencias int;
  v_aplicados jsonb := '[]'::jsonb;
  v_ignorados jsonb := '[]'::jsonb;
begin
  select empresa_id, bodega_id into v_empresa, v_bodega
  from public.woo_conexiones
  where token = p_token and activa = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Conexión no encontrada o desactivada');
  end if;

  if p_topic = 'order.completed' then v_delta := -1;
  elsif p_topic in ('order.cancelled', 'order.refunded') then v_delta := 1;
  else
    return jsonb_build_object('ok', true, 'ignorado', 'El evento ' || p_topic || ' no afecta al stock');
  end if;

  insert into public.woo_eventos (empresa_id, order_id, topic)
  values (v_empresa, p_order_id, p_topic)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'repetido', true,
      'detalle', 'Este pedido ya se había aplicado; no se toca el stock de nuevo');
  end if;

  for it in select * from jsonb_array_elements(p_items)
  loop
    v_sku := lower(trim(coalesce(it->>'sku', '')));
    v_cant := coalesce(nullif(it->>'cantidad', '')::numeric, 1);

    if v_sku = '' then
      v_ignorados := v_ignorados || jsonb_build_object('nombre', it->>'nombre', 'motivo', 'el producto no tiene SKU en la tienda');
      continue;
    end if;

    select count(*) into v_coincidencias
    from public.productos
    where empresa_id = v_empresa and lower(trim(sku)) = v_sku;

    -- Con un SKU repetido no hay forma de saber a qué producto descontarle, así
    -- que NO se adivina: se reporta y se deja el stock intacto. Es preferible
    -- una diferencia visible a mover el producto equivocado en silencio.
    if v_coincidencias = 0 then
      v_ignorados := v_ignorados || jsonb_build_object('sku', v_sku, 'motivo', 'no existe ese SKU en Pixit');
      continue;
    elsif v_coincidencias > 1 then
      v_ignorados := v_ignorados || jsonb_build_object('sku', v_sku, 'motivo', 'hay más de un producto con ese SKU');
      continue;
    end if;

    select id, nombre into v_prod_id, v_prod_nombre
    from public.productos
    where empresa_id = v_empresa and lower(trim(sku)) = v_sku;

    insert into public.producto_stock (producto_id, bodega_id, cantidad)
    values (v_prod_id, v_bodega, greatest(0, (v_delta * v_cant)::int))
    on conflict (producto_id, bodega_id)
    do update set cantidad = greatest(0, public.producto_stock.cantidad + (v_delta * v_cant)::int);

    v_aplicados := v_aplicados || jsonb_build_object(
      'producto_id', v_prod_id, 'producto_nombre', v_prod_nombre,
      'sku', v_sku, 'cantidad', v_delta * v_cant);
  end loop;

  -- Queda en el mismo historial que el resto del inventario, para que una venta
  -- online se vea junto a las demás en Inventario › Movimientos.
  if jsonb_array_length(v_aplicados) > 0 then
    insert into public.movimientos_inventario
      (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino, referencia, referencia_id, notas, usuario)
    values (
      gen_random_uuid()::text, v_empresa,
      to_char(now(), 'YYYY-MM-DD'), to_char(now(), 'HH24:MI'),
      case when v_delta < 0 then 'salida' else 'entrada' end,
      v_aplicados,
      case when v_delta < 0 then v_bodega else null end,
      case when v_delta > 0 then v_bodega else null end,
      'WooCommerce #' || p_order_id, p_order_id,
      case when v_delta < 0 then 'Venta en la tienda online' else 'Devolución de la tienda online' end,
      'WooCommerce'
    );
  end if;

  return jsonb_build_object('ok', true, 'aplicados', v_aplicados, 'ignorados', v_ignorados);
end;
$$;

revoke all on function public.fn_woo_aplicar_pedido(text, text, text, jsonb) from public, anon, authenticated;

-- Conexión inicial para Steve Docs, descontando de Los Dominicos.
insert into public.woo_conexiones (empresa_id, bodega_id)
values ('f347f086-d2ba-40b0-ab70-95a7c02c8781', 'mpob69xchr46h')
on conflict (empresa_id) do nothing;
