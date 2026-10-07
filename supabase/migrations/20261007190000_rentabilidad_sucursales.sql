-- Sprint 2 · Parte 5a — Fuente única de rentabilidad por sucursal.
--
-- Cascada por sucursal:
--   ventas netas − costo = margen bruto
--   − gastos de tienda               = resultado de cuatro paredes (evalúa al encargado)
--   − corporativo asignado           = resultado completo (decide sobre la tienda)
-- El corporativo se reparte en proporción a las ventas netas del periodo; si no
-- hubo ventas queda como "no asignado". Financiero e inversión no restan a
-- ninguna tienda: se informan aparte. Ventas y costo usan exactamente el mismo
-- criterio que fn_reporte_sucursales, que NO se modifica.
--
-- Naturaleza del gasto: la del gasto, si no la de su persona/categoría
-- (gasto_categoria_config), si no se deduce de la sucursal — igual que el
-- formulario (src/lib/naturalezaGasto.ts).

create or replace function public.fn_rentabilidad_sucursales(
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
  v_empresa     uuid;
  v_imp         boolean;
  v_restringido boolean;
  v_branch      text;
  v_res         jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión activa';
  end if;
  v_imp := p_empresa_id is not null and public.is_platform_admin();
  if p_empresa_id is not null and not v_imp
     and p_empresa_id is distinct from public.mi_empresa_id() then
    raise exception 'No puedes operar sobre otra empresa';
  end if;
  v_empresa := case when v_imp then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa is null then
    raise exception 'La empresa no está operativa';
  end if;
  if not v_imp and not public.fn_puede_ver_estadisticas() then
    raise exception 'Sin permiso para ver estadísticas' using errcode = '42501';
  end if;

  -- Quien no es administrador ve solo su sucursal (mismo criterio que
  -- fn_reporte_sucursales: sin sucursal asignada, ve todo).
  v_restringido := not (v_imp or public.mi_rol() = 'admin' or public.is_platform_admin());
  if v_restringido then
    v_branch := public.fn_mi_branch_id();
    if v_branch is null then v_restringido := false; end if;
  end if;

  with
  suc as (
    select b->>'id' as id, coalesce(b->>'nombre', b->>'name') as nombre
      from public.erp_data d
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(d.datos) = 'array' then d.datos
             when jsonb_typeof(d.datos) = 'string' then (d.datos #>> '{}')::jsonb
             else '[]'::jsonb end
      ) b
     where d.empresa_id = v_empresa and d.clave = 'bodegas'
  ),
  ventas_det as (
    select nullif(v.branch_id, '') as branch_id, v.total as neto,
           c.costo, c.costo_est, c.lineas_est
      from public.ventas v
      left join lateral (
        select coalesce(sum(coalesce(vi.costo_total, vi.cantidad * coalesce(p.precio_compra, 0))), 0) as costo,
               coalesce(sum(vi.cantidad * coalesce(p.precio_compra, 0))
                 filter (where vi.costo_total is null and p.tipo is distinct from 'servicio'), 0) as costo_est,
               count(*) filter (where vi.costo_total is null and p.tipo is distinct from 'servicio') as lineas_est
          from public.venta_items vi
          left join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa
         where vi.venta_id = v.id and vi.empresa_id = v_empresa
      ) c on true
     where v.empresa_id = v_empresa
       and v.estado = 'pagada'
       and (p_desde is null or v.fecha >= p_desde)
       and (p_hasta is null or v.fecha <= p_hasta)
  ),
  ventas_suc as (
    select branch_id, sum(neto) as neto, count(*) as trx, sum(costo) as costo,
           sum(costo_est) as costo_est, sum(lineas_est) as lineas_est
      from ventas_det
     group by branch_id
  ),
  gastos_det as (
    select
      case when g.con_credito_fiscal then coalesce(g.monto_neto, g.monto) else g.monto end as monto,
      case when g.bodega_id is null or g.bodega_id in ('', 'general') then null else g.bodega_id end as branch_id,
      coalesce(
        g.naturaleza,
        (select c.naturaleza from public.gasto_categoria_config c
          where c.empresa_id = v_empresa and c.categoria = g.categoria
            and c.subcategoria = coalesce(g.subcategoria, '') and c.subcategoria <> ''),
        (select c.naturaleza from public.gasto_categoria_config c
          where c.empresa_id = v_empresa and c.categoria = g.categoria and c.subcategoria = ''),
        case when g.bodega_id is null or g.bodega_id in ('', 'general') then 'corporativo' else 'tienda' end
      ) as naturaleza
      from public.gastos g
     where g.empresa_id = v_empresa
       and (p_desde is null or g.fecha >= p_desde)
       and (p_hasta is null or g.fecha <= p_hasta)
  ),
  gastos_tienda as (
    select branch_id, sum(monto) as monto
      from gastos_det where naturaleza = 'tienda'
     group by branch_id
  ),
  pool as (
    select coalesce(sum(monto), 0) as corporativo from gastos_det where naturaleza = 'corporativo'
  ),
  fuera as (
    select coalesce(sum(monto) filter (where naturaleza = 'financiero'), 0) as financiero,
           coalesce(sum(monto) filter (where naturaleza = 'inversion'), 0) as inversion
      from gastos_det
  ),
  ids as (
    select id from suc where id is not null
    union select branch_id from ventas_suc where branch_id is not null
    union select branch_id from gastos_tienda where branch_id is not null
  ),
  base_reparto as (
    select coalesce(sum(neto), 0) as total from ventas_suc where branch_id is not null
  ),
  calc as (
    select i.id as branch_id,
           coalesce((select s.nombre from suc s where s.id = i.id limit 1), i.id) as nombre,
           coalesce(vs.neto, 0) as ventas_netas,
           coalesce(vs.trx, 0) as transacciones,
           coalesce(vs.costo, 0) as costo,
           coalesce(vs.costo_est, 0) as costo_estimado,
           coalesce(vs.lineas_est, 0) as lineas_costo_estimado,
           coalesce(gt.monto, 0) as gastos_tienda,
           case when br.total > 0 then coalesce(vs.neto, 0) / br.total else 0 end as participacion,
           case when br.total > 0 then p.corporativo * coalesce(vs.neto, 0) / br.total else 0 end as corporativo_asignado
      from ids i
      left join ventas_suc vs on vs.branch_id = i.id
      left join gastos_tienda gt on gt.branch_id = i.id
      cross join base_reparto br
      cross join pool p
  ),
  na as (
    select coalesce((select neto  from ventas_suc where branch_id is null), 0) as ventas_netas,
           coalesce((select costo from ventas_suc where branch_id is null), 0) as costo,
           coalesce((select monto from gastos_tienda where branch_id is null), 0) as gastos_tienda,
           case when (select total from base_reparto) > 0 then 0
                else (select corporativo from pool) end as corporativo
  ),
  cons as (
    select coalesce((select sum(neto)  from ventas_suc), 0) as ventas_netas,
           coalesce((select sum(costo) from ventas_suc), 0) as costo,
           coalesce((select sum(monto) from gastos_tienda), 0) as gastos_tienda,
           (select corporativo from pool) as corporativo
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
    'restringido', v_restringido,
    'sucursales', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'branch_id', c.branch_id,
               'nombre', c.nombre,
               'ventas_netas', round(c.ventas_netas),
               'transacciones', c.transacciones,
               'costo', round(c.costo),
               'costo_estimado', round(c.costo_estimado),
               'lineas_costo_estimado', c.lineas_costo_estimado,
               'margen_bruto', round(c.ventas_netas - c.costo),
               'gastos_tienda', round(c.gastos_tienda),
               'resultado_cuatro_paredes', round(c.ventas_netas - c.costo - c.gastos_tienda),
               'participacion_ventas', round(c.participacion * 100, 1),
               'corporativo_asignado', round(c.corporativo_asignado),
               'resultado_completo', round(c.ventas_netas - c.costo - c.gastos_tienda - c.corporativo_asignado)
             ) order by c.ventas_netas desc), '[]'::jsonb)
        from calc c
       where not v_restringido or c.branch_id = v_branch
    ),
    'no_asignado', case when v_restringido then null else (
      select jsonb_build_object(
               'ventas_netas', round(na.ventas_netas),
               'costo', round(na.costo),
               'margen_bruto', round(na.ventas_netas - na.costo),
               'gastos_tienda', round(na.gastos_tienda),
               'corporativo', round(na.corporativo),
               'resultado', round(na.ventas_netas - na.costo - na.gastos_tienda - na.corporativo))
        from na) end,
    'corporativo_total', case when v_restringido then null else (select round(corporativo) from pool) end,
    'fuera_de_operacion', case when v_restringido then null else (
      select jsonb_build_object('financiero', round(financiero), 'inversion', round(inversion)) from fuera) end,
    'consolidado', case when v_restringido then null else (
      select jsonb_build_object(
               'ventas_netas', round(ventas_netas),
               'costo', round(costo),
               'margen_bruto', round(ventas_netas - costo),
               'gastos_tienda', round(gastos_tienda),
               'corporativo', round(corporativo),
               'resultado_operacional', round(ventas_netas - costo - gastos_tienda - corporativo))
        from cons) end,
    'cuadratura', case when v_restringido then null else (
      select jsonb_build_object(
               'consolidado', round(cons.ventas_netas - cons.costo - cons.gastos_tienda - cons.corporativo),
               'sucursales_mas_no_asignado',
                 coalesce((select sum(round(c.ventas_netas - c.costo - c.gastos_tienda - c.corporativo_asignado)) from calc c), 0)
                 + round(na.ventas_netas - na.costo - na.gastos_tienda - na.corporativo),
               'diferencia_redondeo',
                 round(cons.ventas_netas - cons.costo - cons.gastos_tienda - cons.corporativo)
                 - coalesce((select sum(round(c.ventas_netas - c.costo - c.gastos_tienda - c.corporativo_asignado)) from calc c), 0)
                 - round(na.ventas_netas - na.costo - na.gastos_tienda - na.corporativo))
        from cons, na) end,
    'calidad', jsonb_build_object(
      'lineas_costo_estimado', coalesce((select sum(lineas_est) from ventas_suc), 0),
      'monto_costo_estimado', round(coalesce((select sum(costo_est) from ventas_suc), 0)),
      'sin_comision_medios_pago', true)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.fn_rentabilidad_sucursales(date, date, uuid) from public, anon;
grant execute on function public.fn_rentabilidad_sucursales(date, date, uuid) to authenticated;

comment on function public.fn_rentabilidad_sucursales(date, date, uuid) is
  'Rentabilidad por sucursal: margen bruto, gastos de tienda, cuatro paredes, corporativo asignado por ventas y resultado completo, con cuadratura. Marcador: resultado_cuatro_paredes.';
