-- Auditoría 2026-09-25:
-- 1. Hace efectivo el vencimiento de trial/suscripción en RLS y RPCs.
-- 2. Evita borrar productos que todavía conservan inventario.
-- 3. Aísla la sincronización manual de WooCommerce por empresa.

create or replace function public.mi_empresa_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select up.empresa_id
  from public.user_profiles up
  join public.empresas e on e.id = up.empresa_id
  where up.id = auth.uid()
    and up.activo is distinct from false
    and e.plan_estado is distinct from 'suspendida'
    and e.plan_estado is distinct from 'inactiva'
    and not (
      e.plan_estado = 'trial'
      and e.trial_termina is not null
      and e.trial_termina < now()
    )
    and not (
      e.plan_estado = 'activo'
      and e.suscripcion_termina is not null
      and e.suscripcion_termina < now()
    )
$$;

comment on function public.mi_empresa_id() is
  'Empresa operativa del usuario autenticado. Devuelve null para perfiles desactivados, empresas suspendidas/inactivas y planes vencidos.';

-- `erp_data` conserva una policy histórica para el dueño que no pasa por
-- mi_empresa_id(). Esta policy restrictiva evita que ese bypass mantenga la
-- operación abierta después del vencimiento, sin impedir que platform admin
-- siga administrando o dando soporte.
drop policy if exists "empresa_operativa" on public.erp_data;
create policy "empresa_operativa"
on public.erp_data
as restrictive
for all
to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin())
with check (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

create index if not exists idx_user_profiles_empresa_id
  on public.user_profiles (empresa_id);

create or replace function public.fn_proteger_producto_con_inventario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.producto_stock ps
    where ps.producto_id = old.id
      and ps.cantidad <> 0
  ) then
    raise exception using
      errcode = '23503',
      message = 'No se puede eliminar un producto con stock. Déjalo en cero o traslada sus unidades antes de eliminarlo.';
  end if;

  if exists (
    select 1
    from public.lotes_inventario li
    where li.empresa_id = old.empresa_id
      and li.producto_id = old.id
      and li.cantidad_restante <> 0
  ) then
    raise exception using
      errcode = '23503',
      message = 'No se puede eliminar un producto con lotes pendientes. Regulariza el inventario antes de eliminarlo.';
  end if;

  -- Las filas sin saldo ya no aportan inventario y se limpian para no dejar
  -- referencias huérfanas cuando la eliminación sí es válida.
  delete from public.producto_stock
  where producto_id = old.id and cantidad = 0;

  delete from public.lotes_inventario
  where empresa_id = old.empresa_id
    and producto_id = old.id
    and cantidad_restante = 0;

  return old;
end;
$$;

drop trigger if exists trg_proteger_producto_con_inventario on public.productos;
create trigger trg_proteger_producto_con_inventario
before delete on public.productos
for each row
execute function public.fn_proteger_producto_con_inventario();

drop function if exists public.fn_woo_pendientes(integer);

create function public.fn_woo_pendientes(
  p_limite integer default 20,
  p_empresa uuid default null
)
returns table (
  empresa_id uuid,
  producto_id text,
  sku text,
  nombre text,
  descripcion text,
  precio numeric,
  stock integer,
  woo_product_id bigint,
  site_url text,
  consumer_key text,
  consumer_secret text
)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'No autorizado';
  end if;

  return query
    select
      q.empresa_id,
      q.producto_id,
      p.sku,
      p.nombre,
      coalesce(p.descripcion, ''),
      p.precio_venta,
      coalesce((
        select ps.cantidad
        from public.producto_stock ps
        where ps.producto_id = p.id
          and ps.bodega_id = c.bodega_id
      ), 0)::integer,
      p.woo_product_id,
      c.site_url,
      ck.decrypted_secret,
      cs.decrypted_secret
    from public.woo_sync_cola q
    join public.productos p
      on p.id = q.producto_id and p.empresa_id = q.empresa_id
    join public.woo_conexiones c
      on c.empresa_id = q.empresa_id and c.activa = true
    join public.empresas e
      on e.id = q.empresa_id
    join vault.decrypted_secrets ck
      on ck.id = c.consumer_key_secret_id
    join vault.decrypted_secrets cs
      on cs.id = c.consumer_secret_secret_id
    where p.vender_online = true
      and c.site_url is not null
      and q.intentos < 5
      and (p_empresa is null or q.empresa_id = p_empresa)
      and e.plan_estado is distinct from 'suspendida'
      and e.plan_estado is distinct from 'inactiva'
      and not (
        e.plan_estado = 'trial'
        and e.trial_termina is not null
        and e.trial_termina < now()
      )
      and not (
        e.plan_estado = 'activo'
        and e.suscripcion_termina is not null
        and e.suscripcion_termina < now()
      )
    order by q.creado_en
    limit greatest(1, least(coalesce(p_limite, 20), 100));
end;
$$;

revoke all on function public.fn_woo_pendientes(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_woo_pendientes(integer, uuid)
  to service_role;
