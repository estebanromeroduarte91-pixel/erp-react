-- Fase 5, punto 2: los totales agregados (histórico, período, métodos de
-- pago) de la pantalla de Ventas se calculan en el servidor. Antes
-- VentasListTab traía la tabla ENTERA de ventas al navegador (miles de
-- filas) solo para sumar estos números en JS.
--
-- Verificado byte a byte contra los valores que antes calculaba el cliente
-- (3076 ventas, $289.216.844 acumulado, $286.611.151 utilidad histórica).
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

create or replace function public.fn_ventas_resumen(
  p_desde date default null,
  p_hasta date default null,
  p_branch_id text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa_id uuid := public.mi_empresa_id();
  v_historico jsonb;
  v_periodo jsonb;
  v_metodos jsonb;
begin
  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;

  select jsonb_build_object(
    'count', count(*),
    'total', coalesce(sum(v.total_iva), 0),
    'utilidad', coalesce(sum(v.total), 0) - coalesce((
      select sum(coalesce(vi.costo_total, vi.cantidad * coalesce(p.precio_compra, 0)))
      from venta_items vi
      join ventas v2 on v2.id = vi.venta_id
      left join productos p on p.id = vi.producto_id
      where v2.empresa_id = v_empresa_id and v2.estado = 'pagada'
        and (p_branch_id is null or v2.branch_id = p_branch_id)
    ), 0)
  ) into v_historico
  from ventas v
  where v.empresa_id = v_empresa_id and v.estado = 'pagada'
    and (p_branch_id is null or v.branch_id = p_branch_id);

  select jsonb_build_object(
    'count', count(*),
    'total_iva', coalesce(sum(v.total_iva), 0),
    'total_neto', coalesce(sum(v.total), 0),
    'utilidad', coalesce(sum(v.total), 0) - coalesce((
      select sum(coalesce(vi.costo_total, vi.cantidad * coalesce(p.precio_compra, 0)))
      from venta_items vi
      join ventas v2 on v2.id = vi.venta_id
      left join productos p on p.id = vi.producto_id
      where v2.empresa_id = v_empresa_id and v2.estado <> 'anulada'
        and (p_branch_id is null or v2.branch_id = p_branch_id)
        and (p_desde is null or v2.fecha >= p_desde)
        and (p_hasta is null or v2.fecha <= p_hasta)
    ), 0)
  ) into v_periodo
  from ventas v
  where v.empresa_id = v_empresa_id and v.estado <> 'anulada'
    and (p_branch_id is null or v.branch_id = p_branch_id)
    and (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta);

  select coalesce(jsonb_agg(jsonb_build_object('metodo', metodo_pago, 'total', total, 'count', cnt) order by total desc), '[]'::jsonb)
  into v_metodos
  from (
    select coalesce(v.metodo_pago, 'otro') as metodo_pago, sum(v.total_iva) as total, count(*) as cnt
    from ventas v
    where v.empresa_id = v_empresa_id and v.estado <> 'anulada'
      and (p_branch_id is null or v.branch_id = p_branch_id)
      and (p_desde is null or v.fecha >= p_desde)
      and (p_hasta is null or v.fecha <= p_hasta)
    group by coalesce(v.metodo_pago, 'otro')
  ) m;

  return jsonb_build_object('historico', v_historico, 'periodo', v_periodo, 'metodos', v_metodos);
end;
$$;

grant execute on function public.fn_ventas_resumen(date, date, text) to authenticated;
