-- El stock ahora se descuenta cuando el cliente PAGA, no cuando el pedido se
-- marca como completado (decisión de Esteban).
--
-- El problema que esto obliga a resolver: en WooCommerce un pedido pagado pasa
-- a `processing` y más tarde a `completed`. Con el modelo anterior —una fila por
-- (pedido, estado)— esas dos transiciones eran claves distintas, así que el
-- mismo pedido se habría descontado DOS veces.
--
-- Se cambia a una máquina de estados: se guarda en qué situación quedó el stock
-- de cada pedido ('salida' = descontado, 'entrada' = devuelto) y solo se mueve
-- algo cuando esa situación cambia de verdad. Así:
--
--   processing            -> descuenta
--   completed (después)   -> no hace nada, ya estaba descontado
--   refunded              -> devuelve
--   completed (de nuevo)  -> vuelve a descontar
--
-- Cualquier orden de llegada da el mismo resultado, que es lo que importa
-- cuando los webhooks pueden llegar repetidos o desordenados.

drop table if exists public.woo_eventos;

create table public.woo_pedidos (
  empresa_id uuid not null,
  order_id text not null,
  -- 'salida' = el stock de este pedido está descontado.
  -- 'entrada' = fue devuelto al inventario.
  efecto text not null check (efecto in ('salida', 'entrada')),
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, order_id)
);

alter table public.woo_pedidos enable row level security;
revoke all on public.woo_pedidos from public, anon, authenticated;

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
  v_actual text;
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

  -- `processing` es el estado que WooCommerce pone al recibir el pago.
  -- `completed` también cuenta como "salido" para los pedidos que saltan
  -- directo ahí (productos virtuales, o cuando se completa a mano sin pasar
  -- por processing).
  if v_estado in ('processing', 'completed') then
    v_deseado := 'salida';
  elsif v_estado in ('cancelled', 'refunded', 'failed') then
    v_deseado := 'entrada';
  else
    -- pending, on-hold, draft…: el pedido aún no se pagó, no se toca nada ni se
    -- altera la situación registrada.
    return jsonb_build_object('ok', true, 'ignorado',
      'El estado "' || v_estado || '" no mueve stock');
  end if;

  select efecto into v_actual
  from public.woo_pedidos
  where empresa_id = v_empresa and order_id = p_order_id
  for update;

  if v_actual = v_deseado then
    return jsonb_build_object('ok', true, 'sin_cambios', true,
      'detalle', 'El stock de este pedido ya estaba ' ||
                 case v_deseado when 'salida' then 'descontado' else 'devuelto' end);
  end if;

  v_delta := case when v_deseado = 'salida' then -1 else 1 end;

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

    -- Con un SKU repetido no se adivina: se reporta y el stock queda intacto.
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

  -- La situación se registra aunque ningún producto haya calzado: lo que define
  -- el estado es el pedido, no cuántas líneas se pudieron emparejar. Si no se
  -- registrara, un reintento volvería a intentar el mismo movimiento.
  insert into public.woo_pedidos (empresa_id, order_id, efecto)
  values (v_empresa, p_order_id, v_deseado)
  on conflict (empresa_id, order_id)
  do update set efecto = excluded.efecto, actualizado_en = now();

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
      case when v_delta < 0 then 'Venta pagada en la tienda online' else 'Devolución de la tienda online' end,
      'WooCommerce'
    );
  end if;

  return jsonb_build_object('ok', true, 'estado', v_estado, 'efecto', v_deseado,
    'aplicados', v_aplicados, 'ignorados', v_ignorados);
end;
$$;

revoke all on function public.fn_woo_aplicar_pedido(text, text, text, jsonb) from public, anon, authenticated;
