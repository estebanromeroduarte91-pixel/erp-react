-- Desempeño por sucursal para Estadísticas → Reportes BI.
-- Se separa de fn_ventas_resumen para no depender de versiones antiguas de
-- esa función que aún no devolvían el arreglo `sucursales`.
create or replace function public.fn_reporte_sucursales(
  p_desde date default null,
  p_hasta date default null,
  p_branch_id text default null,
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'branch_id', branch_id,
    'total_iva', total_iva,
    'total_neto', total_neto,
    'transacciones', transacciones,
    'costo', costo,
    'margen_bruto', total_neto - costo
  ) order by total_neto desc), '[]'::jsonb)
  into v_filas
  from (
    select
      v.branch_id,
      sum(v.total_iva) as total_iva,
      sum(v.total) as total_neto,
      count(*) as transacciones,
      coalesce(sum(c.costo), 0) as costo
    from public.ventas v
    left join lateral (
      select sum(coalesce(vi.costo_total, vi.cantidad * coalesce(p.precio_compra, 0))) as costo
      from public.venta_items vi
      left join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa
      where vi.venta_id = v.id and vi.empresa_id = v_empresa
    ) c on true
    where v.empresa_id = v_empresa
      and v.estado = 'pagada'
      and (p_desde is null or v.fecha >= p_desde)
      and (p_hasta is null or v.fecha <= p_hasta)
      and (v_branch is null or v.branch_id = v_branch)
    group by v.branch_id
  ) s;

  return jsonb_build_object('filas', v_filas);
end;
$$;

revoke all on function public.fn_reporte_sucursales(date, date, text, uuid) from public, anon;
grant execute on function public.fn_reporte_sucursales(date, date, text, uuid) to authenticated;
