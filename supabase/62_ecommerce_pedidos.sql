-- Bandeja operativa de pedidos ecommerce.
-- WooCommerce sigue siendo la fuente comercial; Pixit guarda una copia útil
-- para preparar y despachar sin duplicar la venta ni el movimiento de stock.

create table if not exists public.ecommerce_pedidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  canal text not null default 'woocommerce',
  pedido_externo_id text not null,
  numero text not null,
  estado_origen text not null default 'pending',
  estado_gestion text not null default 'nuevo'
    check (estado_gestion in ('nuevo', 'preparando', 'listo', 'despachado', 'entregado', 'cancelado')),
  moneda text not null default 'CLP',
  total numeric not null default 0,
  metodo_pago text,
  metodo_pago_titulo text,
  cliente_nombre text,
  cliente_email text,
  cliente_telefono text,
  facturacion jsonb not null default '{}'::jsonb,
  envio jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  nota_cliente text,
  pagado_en timestamptz,
  creado_en_origen timestamptz,
  actualizado_en_origen timestamptz,
  recibido_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  stock_resultado jsonb,
  unique (empresa_id, canal, pedido_externo_id)
);

create index if not exists ecommerce_pedidos_empresa_fecha_idx
  on public.ecommerce_pedidos (empresa_id, creado_en_origen desc nulls last, recibido_en desc);
create index if not exists ecommerce_pedidos_empresa_estado_idx
  on public.ecommerce_pedidos (empresa_id, estado_gestion);

alter table public.ecommerce_pedidos enable row level security;

drop policy if exists "empresa lee sus pedidos ecommerce" on public.ecommerce_pedidos;
create policy "empresa lee sus pedidos ecommerce"
on public.ecommerce_pedidos for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "empresa gestiona sus pedidos ecommerce" on public.ecommerce_pedidos;
create policy "empresa gestiona sus pedidos ecommerce"
on public.ecommerce_pedidos for update to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin())
with check (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

grant select, update on public.ecommerce_pedidos to authenticated;

