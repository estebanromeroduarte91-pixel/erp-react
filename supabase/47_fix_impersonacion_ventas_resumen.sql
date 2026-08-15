-- BUG DE SEGURIDAD: fn_ventas_resumen() ignoraba la impersonación del Panel
-- Pixit y mostraba los datos de la empresa REAL de quien llamaba, no de la
-- empresa impersonada.
--
-- La impersonación en Pixit es enteramente del lado del navegador: cambia qué
-- `empresa_id` mandan las consultas DIRECTAS a las tablas (que sí respetan el
-- id impersonado gracias a las policies VIP de is_platform_admin(), migración
-- 28). Pero esta función no recibía ningún empresa_id del cliente: resolvía
-- sola con `mi_empresa_id()`, que depende de `auth.uid()` — es decir, de quién
-- inició sesión de verdad, no de a quién se está impersonando.
--
-- Consecuencia real: un platform admin impersonando "terramovil" veía en la
-- pestaña Ventas (histórico, período, métodos de pago) los datos de SU PROPIA
-- empresa, no los de terramovil. Detectado porque el histórico mostraba
-- ventas que en realidad eran de Steve Docs.
--
-- Importante lo que esto NO es: un usuario real de terramovil, con su propia
-- sesión, nunca vio esto — para él `mi_empresa_id()` siempre resolvió bien.
-- Esto solo afectaba la vista de un platform admin impersonando.
--
-- Arreglo: la función acepta `p_empresa_id`, y SOLO lo usa si quien llama es
-- platform admin (`is_platform_admin()`). Para cualquier otro caller se
-- ignora completamente y se sigue resolviendo con `mi_empresa_id()` — así una
-- llamada directa al RPC saltándose la UI, con un empresa_id inventado, jamás
-- puede pedir los datos de otra empresa.
--
-- Se DROPEA la versión de 3 argumentos antes de crear la de 4: en Postgres un
-- parámetro nuevo cambia la identidad de la función (nombre + tipos de los
-- argumentos), así que un simple CREATE OR REPLACE habría dejado las dos
-- versiones coexistiendo — la vieja seguía siendo llamable y seguía rota.

drop function if exists public.fn_ventas_resumen(date, date, text);

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

  return jsonb_build_object(
    'historico', v_historico,
    'periodo', v_periodo,
    'metodos', v_metodos
  );
end;
$$;

grant execute on function public.fn_ventas_resumen(date, date, text, uuid) to authenticated;
