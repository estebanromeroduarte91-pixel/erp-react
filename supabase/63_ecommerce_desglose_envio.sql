-- Separa el importe pagado por productos del costo de despacho informado por
-- WooCommerce. Los pedidos existentes parten con todo el total en productos;
-- al volver a sincronizar WooCommerce quedan actualizados con su desglose real.

alter table public.ecommerce_pedidos
  add column if not exists subtotal_productos numeric not null default 0,
  add column if not exists costo_envio numeric not null default 0;

update public.ecommerce_pedidos
set subtotal_productos = total
where subtotal_productos = 0
  and total <> 0;

