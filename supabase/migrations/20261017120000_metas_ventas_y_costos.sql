-- Metas comerciales + clasificación fijo/variable de los gastos.
--
-- Esta dimensión es independiente de `naturaleza`:
--   naturaleza      = dónde impacta (tienda/corporativo/fuera de operación)
--   comportamiento  = cómo cambia con la actividad (fijo/variable)
-- El costo de mercadería vendida ya se obtiene de venta_items y no se duplica
-- como gasto variable.

alter table public.gastos
  add column if not exists comportamiento text
  check (comportamiento is null or comportamiento in ('fijo', 'variable'));

comment on column public.gastos.comportamiento is
  'fijo | variable. Null = usar regla de gasto_categoria_config; sin regla se trata como fijo por prudencia.';

alter table public.gasto_categoria_config
  add column if not exists comportamiento text
  check (comportamiento is null or comportamiento in ('fijo', 'variable'));

comment on column public.gasto_categoria_config.comportamiento is
  'Comportamiento sugerido para gastos de la categoría/subcategoría: fijo o variable.';

-- Sugerencias iniciales. No pisan decisiones ya confirmadas.
update public.gasto_categoria_config
set comportamiento = case
  when lower(categoria) similar to '%(comision|comisión|delivery|logística|logistica|material|embalaje|insumo|servicio tercerizado)%'
    then 'variable'
  else 'fijo'
end,
actualizado_en = now()
where comportamiento is null;

-- También crea reglas para categorías históricas que aún no estaban en la
-- tabla. Su naturaleza se deduce igual que el formulario actual.
insert into public.gasto_categoria_config (
  empresa_id, categoria, subcategoria, naturaleza, comportamiento, origen
)
select distinct on (g.empresa_id, g.categoria)
  g.empresa_id,
  g.categoria,
  '',
  coalesce(
    g.naturaleza,
    case when g.bodega_id is null or g.bodega_id in ('', 'general') then 'corporativo' else 'tienda' end
  ),
  case
    when lower(g.categoria) similar to '%(comision|comisión|delivery|logística|logistica|material|embalaje|insumo|servicio tercerizado)%'
      then 'variable'
    else 'fijo'
  end,
  'sugerida'
from public.gastos g
where coalesce(g.categoria, '') <> ''
order by
  g.empresa_id,
  g.categoria,
  -- Si una categoría tiene registros contradictorios, se privilegia una
  -- clasificación decidida explícitamente y luego la más reciente.
  (g.naturaleza is not null) desc,
  g.fecha desc,
  g.id desc
on conflict (empresa_id, categoria, subcategoria) do update
set comportamiento = coalesce(public.gasto_categoria_config.comportamiento, excluded.comportamiento);

-- El superadministrador también debe poder confirmar la clasificación cuando
-- está viendo una empresa desde Panel Pixit.
drop policy if exists "gcc_insert" on public.gasto_categoria_config;
create policy "gcc_insert" on public.gasto_categoria_config
  for insert to authenticated
  with check (public.fn_soy_admin_de(empresa_id) or public.is_platform_admin());

drop policy if exists "gcc_update" on public.gasto_categoria_config;
create policy "gcc_update" on public.gasto_categoria_config
  for update to authenticated
  using (public.fn_soy_admin_de(empresa_id) or public.is_platform_admin())
  with check (public.fn_soy_admin_de(empresa_id) or public.is_platform_admin());

drop policy if exists "gcc_delete" on public.gasto_categoria_config;
create policy "gcc_delete" on public.gasto_categoria_config
  for delete to authenticated
  using (public.fn_soy_admin_de(empresa_id) or public.is_platform_admin());

create table if not exists public.metas_ventas_config (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  periodo date not null,
  -- 'general' = consolidado. Las sucursales usan el mismo id de erp_data/bodegas.
  branch_id text not null default 'general',
  meta_mensual numeric(16,2) not null default 0 check (meta_mensual >= 0),
  costos_fijos_presupuestados numeric(16,2)
    check (costos_fijos_presupuestados is null or costos_fijos_presupuestados >= 0),
  dias_operacion smallint[] not null default array[1,2,3,4,5,6]::smallint[],
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  primary key (empresa_id, periodo, branch_id),
  check (periodo = date_trunc('month', periodo)::date),
  check (cardinality(dias_operacion) between 1 and 7),
  check (dias_operacion <@ array[1,2,3,4,5,6,7]::smallint[])
);

comment on table public.metas_ventas_config is
  'Meta mensual, presupuesto de costos fijos y días de operación por empresa/sucursal.';

alter table public.metas_ventas_config enable row level security;
revoke all on table public.metas_ventas_config from anon;
grant select, insert, update, delete on table public.metas_ventas_config to authenticated;

drop policy if exists "mvc_select" on public.metas_ventas_config;
create policy "mvc_select" on public.metas_ventas_config
  for select to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "mvc_insert" on public.metas_ventas_config;
create policy "mvc_insert" on public.metas_ventas_config
  for insert to authenticated
  with check (public.fn_soy_admin_de(empresa_id) or public.is_platform_admin());

drop policy if exists "mvc_update" on public.metas_ventas_config;
create policy "mvc_update" on public.metas_ventas_config
  for update to authenticated
  using (public.fn_soy_admin_de(empresa_id) or public.is_platform_admin())
  with check (public.fn_soy_admin_de(empresa_id) or public.is_platform_admin());

drop policy if exists "mvc_delete" on public.metas_ventas_config;
create policy "mvc_delete" on public.metas_ventas_config
  for delete to authenticated
  using (public.fn_soy_admin_de(empresa_id) or public.is_platform_admin());
