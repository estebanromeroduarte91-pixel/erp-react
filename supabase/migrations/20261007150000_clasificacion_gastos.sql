-- Sprint 1 · Parte 4 — Clasificación gerencial de gastos.
--
-- Hallazgo con datos reales: `gastos.bodega_id = 'general'` ya significa
-- "gasto corporativo/compartido". Agregar una columna `ambito` crearía una
-- segunda fuente de verdad que podría contradecir a la primera, así que NO se
-- agrega. Lo que de verdad falta es la NATURALEZA del gasto, porque no todo lo
-- que está en `gastos` es resultado operativo de una tienda:
--   tienda       arriendo, sueldos del local, luz, delivery, comisiones...
--   corporativo  marketing, contador, software, administración central
--   financiero   cuotas de crédito y gastos bancarios (no son operación)
--   inversion    compra de equipos (activo, no gasto del mes)
--
-- Esta migración NO modifica ningún gasto ni ningún monto histórico.

create table if not exists public.gasto_categoria_config (
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  categoria      text not null,
  subcategoria   text not null default '',
  naturaleza     text not null check (naturaleza in ('tienda','corporativo','financiero','inversion')),
  origen         text not null default 'sugerida' check (origen in ('sugerida','confirmada')),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  primary key (empresa_id, categoria, subcategoria)
);

alter table public.gasto_categoria_config enable row level security;

revoke all on table public.gasto_categoria_config from anon;
grant select, insert, update, delete on table public.gasto_categoria_config to authenticated;

drop policy if exists "gcc_select" on public.gasto_categoria_config;
create policy "gcc_select" on public.gasto_categoria_config
  for select to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "gcc_insert" on public.gasto_categoria_config;
create policy "gcc_insert" on public.gasto_categoria_config
  for insert to authenticated
  with check (public.fn_soy_admin_de(empresa_id));

drop policy if exists "gcc_update" on public.gasto_categoria_config;
create policy "gcc_update" on public.gasto_categoria_config
  for update to authenticated
  using (public.fn_soy_admin_de(empresa_id))
  with check (public.fn_soy_admin_de(empresa_id));

drop policy if exists "gcc_delete" on public.gasto_categoria_config;
create policy "gcc_delete" on public.gasto_categoria_config
  for delete to authenticated
  using (public.fn_soy_admin_de(empresa_id));

-- Sugerencias iniciales según el nombre de la categoría. Son un punto de
-- partida editable (origen = 'sugerida'); lo que no reconoce queda sin
-- clasificar a propósito, para que aparezca en el diagnóstico.
insert into public.gasto_categoria_config (empresa_id, categoria, subcategoria, naturaleza, origen)
select distinct g.empresa_id, g.categoria, '',
  case
    when lower(g.categoria) in (
      'sueldos','comisiones','pago sábados','arriendo','luz','agua','gastos comunes',
      'aseo y administrativo','deliverys','internet y telefonía','servicios tercerizados',
      'materiales','limpieza','mantenimiento','alimentación','logística','rrhh','servicios'
    ) then 'tienda'
    when lower(g.categoria) in (
      'publicidad y marketing','administrativo','membresias y software','cotizaciones'
    ) then 'corporativo'
    when lower(g.categoria) in ('gastos banco') then 'financiero'
    when lower(g.categoria) in ('compra equipo') then 'inversion'
  end,
  'sugerida'
from public.gastos g
where g.categoria is not null
  and lower(g.categoria) in (
    'sueldos','comisiones','pago sábados','arriendo','luz','agua','gastos comunes',
    'aseo y administrativo','deliverys','internet y telefonía','servicios tercerizados',
    'materiales','limpieza','mantenimiento','alimentación','logística','rrhh','servicios',
    'publicidad y marketing','administrativo','membresias y software','cotizaciones',
    'gastos banco','compra equipo'
  )
on conflict (empresa_id, categoria, subcategoria) do nothing;

-- ── Diagnóstico de calidad de la clasificación ──────────────────
create or replace function public.fn_gastos_calidad(
  p_desde date default null,
  p_hasta date default null,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión activa';
  end if;
  if p_empresa_id is not null
     and p_empresa_id is distinct from public.mi_empresa_id()
     and not public.is_platform_admin() then
    raise exception 'No puedes operar sobre otra empresa';
  end if;
  v_empresa := coalesce(p_empresa_id, public.mi_empresa_id());
  if v_empresa is null then
    raise exception 'La empresa no está operativa';
  end if;
  if not public.fn_puede_ver_estadisticas() then
    raise exception 'No tienes permiso para ver estadísticas';
  end if;

  with base as (
    select g.id, g.fecha, g.descripcion, g.categoria, g.subcategoria, g.monto,
           g.bodega_id, g.bodega_nombre,
           coalesce(
             (select c.naturaleza from public.gasto_categoria_config c
               where c.empresa_id = v_empresa and c.categoria = g.categoria
                 and c.subcategoria = coalesce(g.subcategoria, '')),
             (select c.naturaleza from public.gasto_categoria_config c
               where c.empresa_id = v_empresa and c.categoria = g.categoria
                 and c.subcategoria = '')
           ) as naturaleza,
           case
             when g.bodega_id is null or g.bodega_id = '' then 'sin_sucursal'
             when g.bodega_id = 'general' then 'corporativo'
             else 'tienda'
           end as ambito
      from public.gastos g
     where g.empresa_id = v_empresa
       and (p_desde is null or g.fecha >= p_desde)
       and (p_hasta is null or g.fecha <= p_hasta)
  ),
  marcadas as (
    select b.*,
      case
        when b.ambito = 'sin_sucursal' then 'sin_sucursal'
        when b.naturaleza is null then 'sin_clasificar'
        when b.naturaleza = 'tienda' and b.ambito = 'corporativo' then 'tienda_en_general'
        when b.naturaleza = 'corporativo' and b.ambito = 'tienda' then 'corporativo_en_sucursal'
        when b.naturaleza in ('financiero','inversion') then 'fuera_de_operacion'
      end as problema
    from base b
  )
  select jsonb_build_object(
    'total', (select jsonb_build_object('cantidad', count(*), 'monto', coalesce(sum(monto), 0)) from base),
    'por_naturaleza', (
      select coalesce(jsonb_object_agg(n, jsonb_build_object('cantidad', c, 'monto', m)), '{}'::jsonb)
      from (select coalesce(naturaleza, 'sin_clasificar') n, count(*) c, sum(monto) m from base group by 1) t
    ),
    'problemas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'codigo', p.problema, 'cantidad', p.cantidad, 'monto', p.monto, 'ejemplos', p.ejemplos
             ) order by p.monto desc), '[]'::jsonb)
      from (
        select m.problema, count(*) as cantidad, sum(m.monto) as monto,
               (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', x.id, 'fecha', x.fecha, 'descripcion', x.descripcion,
                         'categoria', x.categoria, 'subcategoria', x.subcategoria,
                         'monto', x.monto, 'sucursal', coalesce(x.bodega_nombre, x.bodega_id)
                       ) order by x.monto desc), '[]'::jsonb)
                  from (select * from marcadas y where y.problema = m.problema
                         order by y.monto desc limit 25) x) as ejemplos
          from marcadas m
         where m.problema is not null
         group by m.problema
      ) p
    )
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.fn_gastos_calidad(date, date, uuid) from public, anon;
grant execute on function public.fn_gastos_calidad(date, date, uuid) to authenticated;

comment on function public.fn_gastos_calidad(date, date, uuid) is
  'Diagnóstico de la clasificación de gastos (sin sucursal, sin clasificar, tienda en general, fuera de operación). Marcador: gasto_categoria_config.';
