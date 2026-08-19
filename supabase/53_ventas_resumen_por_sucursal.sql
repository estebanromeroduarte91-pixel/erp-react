-- Ventas → Resumen necesita las mismas tarjetas por sucursal que el Dashboard.
--
-- El Dashboard puede armarlas en el navegador porque ya trae todas las ventas
-- en memoria. Resumen NO: esa pantalla se rediseñó justamente para no bajar la
-- tabla entera (RPC de agregados + listado paginado con range). Bajar todas las
-- ventas solo para agrupar por sucursal desharía eso, así que el desglose se
-- calcula en el servidor y viaja dentro del mismo jsonb que ya devuelve.
--
-- Misma firma que la migración 47 — `create or replace` sin `drop`, así no se
-- pierde el grant ni quedan dos versiones conviviendo (la trampa de Postgres
-- documentada en la 49: agregar un parámetro sí habría cambiado la identidad).
--
-- El nombre de la sucursal NO se devuelve: `ventas.branch_nombre` está vacío en
-- buena parte de los datos reales (confirmado en Terra Movil, 2026-08-18). El
-- id se resuelve contra `bodegas` en el cliente, igual que hace el Dashboard.

create or replace function public.fn_ventas_resumen(
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
  v_empresa_id uuid;
  v_historico jsonb;
  v_periodo jsonb;
  v_metodos jsonb;
  v_sucursales jsonb;
begin
  if p_empresa_id is not null and public.is_platform_admin() then
    v_empresa_id := p_empresa_id;
  else
    v_empresa_id := public.mi_empresa_id();
  end if;

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
      where v2.empresa_id = v_empresa_id and v2.estado = 'pagada'
        and (p_branch_id is null or v2.branch_id = p_branch_id)
        and (p_desde is null or v2.fecha >= p_desde)
        and (p_hasta is null or v2.fecha <= p_hasta)
    ), 0)
  ) into v_periodo
  from ventas v
  where v.empresa_id = v_empresa_id and v.estado = 'pagada'
    and (p_branch_id is null or v.branch_id = p_branch_id)
    and (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta);

  select coalesce(
    jsonb_agg(
      jsonb_build_object('metodo', metodo_pago, 'total', total, 'count', cnt)
      order by total desc
    ),
    '[]'::jsonb
  )
  into v_metodos
  from (
    select coalesce(v.metodo_pago, 'otro') as metodo_pago,
           sum(v.total_iva) as total,
           count(*) as cnt
    from ventas v
    where v.empresa_id = v_empresa_id and v.estado = 'pagada'
      and (p_branch_id is null or v.branch_id = p_branch_id)
      and (p_desde is null or v.fecha >= p_desde)
      and (p_hasta is null or v.fecha <= p_hasta)
    group by coalesce(v.metodo_pago, 'otro')
  ) m;

  -- Desglose por sucursal del período. El costo se suma por sucursal con el
  -- mismo criterio del resto de la función: `costo_total` de la línea si
  -- existe, y si no, cantidad × precio_compra actual del producto.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'branch_id', branch_id,
        'total_iva', total_iva,
        'total_neto', total_neto,
        'count', cnt,
        'utilidad', total_neto - costo
      )
      order by total_iva desc
    ),
    '[]'::jsonb
  )
  into v_sucursales
  from (
    select v.branch_id as branch_id,
           sum(v.total_iva) as total_iva,
           sum(v.total)     as total_neto,
           count(*)         as cnt,
           coalesce(sum(c.costo), 0) as costo
    from ventas v
    left join lateral (
      select sum(coalesce(vi.costo_total, vi.cantidad * coalesce(p.precio_compra, 0))) as costo
      from venta_items vi
      left join productos p on p.id = vi.producto_id
      where vi.venta_id = v.id
    ) c on true
    where v.empresa_id = v_empresa_id and v.estado = 'pagada'
      -- Respetar p_branch_id igual que el resto de la función: un encargado o
      -- vendedor con sucursal asignada NO puede ver los totales de las otras
      -- (la pantalla de Ventas ya se endureció por esto mismo).
      and (p_branch_id is null or v.branch_id = p_branch_id)
      and (p_desde is null or v.fecha >= p_desde)
      and (p_hasta is null or v.fecha <= p_hasta)
    group by v.branch_id
  ) s;

  return jsonb_build_object(
    'historico', v_historico,
    'periodo', v_periodo,
    'metodos', v_metodos,
    'sucursales', v_sucursales
  );
end;
$$;

grant execute on function public.fn_ventas_resumen(date, date, text, uuid) to authenticated;
