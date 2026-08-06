-- Segunda dirección de la integración: de Pixit hacia WooCommerce.
--
-- Hasta ahora el flujo era de una sola vía (venta online → descuenta en Pixit).
-- El problema que eso deja abierto es la SOBREVENTA: al vender en el mostrador,
-- la tienda no se entera y sigue ofreciendo unidades que ya no están. Con 156
-- productos publicados eso iba a pasar, y molesta más que no tener el producto
-- listado.
--
-- Decisiones de Esteban: se publica solo lo que él marque, y se mantienen
-- sincronizados el stock y el precio.

-- Credenciales de la API de WooCommerce (se generan en la tienda:
-- WooCommerce → Ajustes → Avanzado → API REST, con permiso de lectura/escritura).
alter table public.woo_conexiones
  add column if not exists site_url text,
  add column if not exists consumer_key text,
  add column if not exists consumer_secret text;

-- El interruptor por producto. Por defecto NADA se publica: que algo aparezca
-- en la tienda tiene que ser una decisión explícita.
alter table public.productos
  add column if not exists vender_online boolean not null default false,
  add column if not exists woo_product_id bigint;

create index if not exists productos_vender_online_idx
  on public.productos (empresa_id) where vender_online;

-- Cola de cambios pendientes de empujar. Se usa una cola y no una llamada
-- directa porque la tienda puede estar caída o lenta, y un fallo de red nunca
-- debe hacer fallar una venta en el POS.
create table if not exists public.woo_sync_cola (
  empresa_id uuid not null,
  producto_id text not null,
  motivo text not null,
  intentos int not null default 0,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  primary key (empresa_id, producto_id)
);

alter table public.woo_sync_cola enable row level security;
revoke all on public.woo_sync_cola from public, anon, authenticated;

-- Encola sin duplicar: si un producto cambia cinco veces antes de sincronizarse,
-- queda una sola fila pendiente y se empuja el estado final.
create or replace function public.fn_woo_encolar(p_empresa uuid, p_producto text, p_motivo text)
returns void language sql security definer set search_path = public as $$
  insert into public.woo_sync_cola (empresa_id, producto_id, motivo)
  values (p_empresa, p_producto, p_motivo)
  on conflict (empresa_id, producto_id)
  do update set motivo = excluded.motivo, creado_en = now(), intentos = 0, ultimo_error = null;
$$;

-- Cambios en la ficha del producto (nombre, precio, SKU, descripción o el
-- propio interruptor).
create or replace function public.fn_woo_trigger_producto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.vender_online is not true then return NEW; end if;
  if TG_OP = 'UPDATE'
     and NEW.nombre is not distinct from OLD.nombre
     and NEW.precio_venta is not distinct from OLD.precio_venta
     and NEW.sku is not distinct from OLD.sku
     and NEW.descripcion is not distinct from OLD.descripcion
     and NEW.vender_online is not distinct from OLD.vender_online
  then
    return NEW;
  end if;
  perform public.fn_woo_encolar(NEW.empresa_id, NEW.id, 'ficha');
  return NEW;
end; $$;

drop trigger if exists trg_woo_producto on public.productos;
create trigger trg_woo_producto
after insert or update on public.productos
for each row execute function public.fn_woo_trigger_producto();

-- Cambios de stock. El trigger va sobre producto_stock y no sobre cada punto
-- del código que vende o ajusta: así cubre TODAS las vías (POS, recepción de
-- compra, anulación, ajuste manual) sin depender de que alguien se acuerde.
create or replace function public.fn_woo_trigger_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_empresa uuid; v_bodega text;
begin
  select p.empresa_id into v_empresa
  from public.productos p
  where p.id = NEW.producto_id and p.vender_online = true;
  if v_empresa is null then return NEW; end if;

  -- Solo interesa el stock de la bodega desde la que se despacha lo online.
  select c.bodega_id into v_bodega
  from public.woo_conexiones c
  where c.empresa_id = v_empresa and c.activa = true;
  if v_bodega is null or NEW.bodega_id <> v_bodega then return NEW; end if;

  perform public.fn_woo_encolar(v_empresa, NEW.producto_id, 'stock');
  return NEW;
end; $$;

drop trigger if exists trg_woo_stock on public.producto_stock;
create trigger trg_woo_stock
after insert or update on public.producto_stock
for each row execute function public.fn_woo_trigger_stock();

-- Lo que la Edge Function necesita para empujar: los pendientes con sus datos
-- ya resueltos, para no hacer varias consultas por producto.
create or replace function public.fn_woo_pendientes(p_limite int default 20)
returns table (
  empresa_id uuid, producto_id text, sku text, nombre text,
  descripcion text, precio numeric, stock int, woo_product_id bigint,
  site_url text, consumer_key text, consumer_secret text
)
language sql security definer set search_path = public as $$
  select
    q.empresa_id, q.producto_id, p.sku, p.nombre,
    coalesce(p.descripcion, ''), p.precio_venta,
    coalesce((select ps.cantidad from public.producto_stock ps
              where ps.producto_id = p.id and ps.bodega_id = c.bodega_id), 0),
    p.woo_product_id, c.site_url, c.consumer_key, c.consumer_secret
  from public.woo_sync_cola q
  join public.productos p on p.id = q.producto_id
  join public.woo_conexiones c on c.empresa_id = q.empresa_id and c.activa = true
  where p.vender_online = true
    and c.site_url is not null and c.consumer_key is not null
    and q.intentos < 5
  order by q.creado_en
  limit p_limite;
$$;

create or replace function public.fn_woo_sync_ok(p_empresa uuid, p_producto text, p_woo_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.productos set woo_product_id = p_woo_id
  where id = p_producto and empresa_id = p_empresa;
  delete from public.woo_sync_cola where empresa_id = p_empresa and producto_id = p_producto;
end; $$;

-- Los fallos no se borran de la cola: se cuentan. Tras 5 intentos dejan de
-- reintentarse pero la fila QUEDA, con el motivo del último error, para que el
-- problema sea visible en vez de desaparecer en silencio.
create or replace function public.fn_woo_sync_error(p_empresa uuid, p_producto text, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.woo_sync_cola
  set intentos = intentos + 1, ultimo_error = left(p_error, 500)
  where empresa_id = p_empresa and producto_id = p_producto;
$$;

revoke all on function public.fn_woo_pendientes(int) from public, anon, authenticated;
revoke all on function public.fn_woo_sync_ok(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.fn_woo_sync_error(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fn_woo_encolar(uuid, text, text) from public, anon, authenticated;
