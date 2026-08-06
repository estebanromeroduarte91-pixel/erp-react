-- Corrige la migración 34: WooCommerce NO emite un evento `order.completed`.
-- Sus webhooks son order.created / order.updated / order.deleted / restored, y
-- el estado real del pedido (processing, completed, cancelled, refunded) viaja
-- DENTRO del contenido, no en el nombre del evento.
--
-- Dos consecuencias del diseño anterior:
--   1. La condición `topic = 'order.completed'` no se habría cumplido nunca.
--   2. La protección anti-duplicados usaba el nombre del evento como clave. Como
--      todos los cambios de estado llegan igual (`order.updated`), un pedido que
--      se completa y más tarde se reembolsa habría quedado bloqueado en el
--      segundo paso: se descontaba el stock y nunca se devolvía.
--
-- Ahora la clave es (empresa, pedido, ESTADO): cada transición se aplica una
-- sola vez, pero un mismo pedido puede pasar por completed y luego por refunded.

drop table if exists public.woo_eventos;

create table public.woo_eventos (
  empresa_id uuid not null,
  order_id text not null,
  estado text not null,
  procesado_en timestamptz not null default now(),
  primary key (empresa_id, order_id, estado)
);

alter table public.woo_eventos enable row level security;
revoke all on public.woo_eventos from public, anon, authenticated;

drop function if exists public.fn_woo_aplicar_pedido(text, text, text, jsonb);

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
  v_delta int;
  v_estado text := lower(trim(coalesce(p_estado, '')));
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

  -- `completed` es cuando el pedido se despachó de verdad. `processing` (pagado
  -- pero sin despachar) NO descuenta: si descontara ahí y el pedido se cancelara
  -- antes de salir, el stock quedaría mal por partida doble.
  if v_estado = 'completed' then v_delta := -1;
  elsif v_estado in ('cancelled', 'refunded') then v_delta := 1;
  else
    return jsonb_build_object('ok', true, 'ignorado',
      'El estado "' || v_estado || '" no afecta al stock');
  end if;

  insert into public.woo_eventos (empresa_id, order_id, estado)
  values (v_empresa, p_order_id, v_estado)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'repetido', true,
      'detalle', 'Este pedido ya se había aplicado en ese estado; no se toca el stock de nuevo');
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
    -- que NO se adivina: se reporta y se deja el stock intacto.
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

  return jsonb_build_object('ok', true, 'estado', v_estado,
    'aplicados', v_aplicados, 'ignorados', v_ignorados);
end;
$$;

revoke all on function public.fn_woo_aplicar_pedido(text, text, text, jsonb) from public, anon, authenticated;
