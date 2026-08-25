-- Rentabilidad completa por producto para Estadísticas → Reportes BI.
-- Depende de las funciones de seguridad creadas en 54_reportes_ventas.sql.
create or replace function public.fn_reporte_rentabilidad(
  p_desde date default null,
  p_hasta date default null,
  p_branch_id text default null,
  p_limite int default 500,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid;
  v_imp boolean;
  v_branch text;
  v_desde date := coalesce(p_desde, (date_trunc('month', current_date) - interval '11 months')::date);
  v_hasta date := coalesce(p_hasta, current_date);
  v_filas jsonb;
begin
  v_imp := p_empresa_id is not null and public.is_platform_admin();
  v_empresa := case when v_imp then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa is null then raise exception 'No autenticado'; end if;
  if not v_imp and not public.fn_puede_ver_estadisticas() then
    raise exception 'Sin permiso para ver estadísticas' using errcode = '42501';
  end if;

  if v_imp or public.mi_rol() = 'admin' then
    v_branch := p_branch_id;
  else
    v_branch := coalesce(public.fn_mi_branch_id(), p_branch_id);
  end if;

  with productos_rentabilidad as (
    select
      coalesce(vi.producto_id, 'sn:' || coalesce(nullif(btrim(vi.producto_nombre), ''), 'Sin nombre')) as producto_id,
      coalesce(p.nombre, nullif(btrim(vi.producto_nombre), ''), 'Sin nombre') as nombre,
      coalesce(p.sku, '') as sku,
      sum(coalesce(vi.cantidad, 0)) as unidades,
      sum(coalesce(vi.subtotal, 0)) as neto,
      sum(coalesce(vi.costo_total, vi.cantidad * coalesce(p.precio_compra, 0), 0)) as costo
    from public.venta_items vi
    join public.ventas v on v.id = vi.venta_id and v.empresa_id = v_empresa
    left join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa
    where vi.empresa_id = v_empresa
      and v.estado = 'pagada'
      and v.fecha between v_desde and v_hasta
      and (v_branch is null or v.branch_id = v_branch)
    group by 1, 2, 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'producto_id', producto_id,
    'nombre', nombre,
    'sku', sku,
    'unidades', unidades,
    'neto', neto,
    'costo', costo,
    'margen', neto - costo
  ) order by (neto - costo) desc, nombre), '[]'::jsonb)
  into v_filas
  from (
    select * from productos_rentabilidad
    order by (neto - costo) desc, nombre
    limit greatest(1, least(coalesce(p_limite, 500), 2000))
  ) r;

  return jsonb_build_object('filas', v_filas);
end;
$$;

revoke all on function public.fn_reporte_rentabilidad(date, date, text, int, uuid) from public, anon;
grant execute on function public.fn_reporte_rentabilidad(date, date, text, int, uuid) to authenticated;
