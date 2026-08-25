-- Motor de los reportes de Estadísticas → Reportes.
--
-- Un solo lugar donde se agregan las ventas para explorarlas: serie mensual,
-- matriz producto × mes y buscador de productos. Se hace en el servidor por la
-- misma razón que la migración 53: `venta_items` es varias veces más grande que
-- `ventas`, y bajar el detalle al navegador para agrupar ahí no escala.
--
-- Las tres funciones comparten el mismo criterio de costo que el resto del
-- sistema: `costo_total` de la línea si existe, y si no, cantidad × el
-- precio_compra actual del producto.

-- ── Sucursal efectiva del usuario ────────────────────────────────
-- La pantalla ya calcula un branchId, pero el servidor NO puede confiar en él:
-- si el filtro vive solo en el frontend, basta con llamar la RPC sin sucursal
-- para ver los totales de todas. Un encargado con sucursal asignada queda
-- acotado a la suya acá, pase lo que pase por parámetro.
--
-- La sucursal del usuario vive en un blob de `erp_data`: la escribe
-- `useGuardarUserConfig` en `ucfg_<uid>` y la refleja en `user_cargo_map`.
-- Se leen las dos por si una quedó desincronizada.
create or replace function public.fn_mi_branch_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ed.datos->>'branchId'
       from public.erp_data ed
      where ed.empresa_id = public.mi_empresa_id()
        and ed.clave = 'ucfg_' || auth.uid()::text),
    (select ed.datos->(auth.uid()::text)->>'branchId'
       from public.erp_data ed
      where ed.empresa_id = public.mi_empresa_id()
        and ed.clave = 'user_cargo_map')
  );
$$;

revoke all on function public.fn_mi_branch_id() from public, anon;
grant execute on function public.fn_mi_branch_id() to authenticated;

-- La visibilidad del menú no es una barrera de seguridad. Esta comprobación
-- replica el permiso efectivo de Cargos para que las RPC security definer no
-- expongan ventas, costos ni márgenes a quien llame PostgREST directamente.
create or replace function public.fn_puede_ver_estadisticas()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.mi_empresa_id();
  v_cargo text;
  v_permitido boolean;
begin
  if public.is_platform_admin() or public.mi_rol() = 'admin' then return true; end if;
  if v_empresa is null then return false; end if;

  select coalesce(
    (select datos->>'cargoId'
       from public.erp_data
      where empresa_id = v_empresa and clave = 'ucfg_' || auth.uid()::text),
    (select datos->(auth.uid()::text)->>'cargoId'
       from public.erp_data
      where empresa_id = v_empresa and clave = 'user_cargo_map')
  ) into v_cargo;
  v_cargo := coalesce(nullif(v_cargo, ''), public.mi_rol());

  select (c->'permisos'->>'estadisticas')::boolean into v_permitido
    from public.erp_data ed
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(ed.datos) = 'array' then ed.datos else '[]'::jsonb end
    ) c
   where ed.empresa_id = v_empresa and ed.clave = 'cargos' and c->>'id' = v_cargo
   limit 1;

  return coalesce(v_permitido, v_cargo = 'encargado');
end;
$$;

revoke all on function public.fn_puede_ver_estadisticas() from public, anon;
grant execute on function public.fn_puede_ver_estadisticas() to authenticated;


-- ── Serie mensual ────────────────────────────────────────────────
-- Devuelve las TRES métricas por serie (unidades, neto, margen) en una sola
-- llamada: cambiar de métrica en la pantalla no debe volver a consultar.
create or replace function public.fn_reporte_serie(
  p_desde date default null,
  p_hasta date default null,
  p_agrupacion text default 'producto',      -- 'producto' | 'categoria'
  p_producto_ids text[] default null,
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
  v_desde date;
  v_hasta date;
  v_primera date;
  v_meses jsonb;
  v_series jsonb;
  v_tot jsonb;
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

  -- El cliente puede pedir "todo el histórico" mandando una fecha muy antigua.
  -- Se acota a la primera venta real: sin esto, generate_series armaría cientos
  -- de meses vacíos que nadie va a mirar y que solo hacen lenta la consulta.
  select min(fecha) into v_primera
    from public.ventas where empresa_id = v_empresa and estado = 'pagada';
  v_desde := greatest(
    coalesce(p_desde, (date_trunc('month', current_date) - interval '11 months')::date),
    coalesce(v_primera, '1900-01-01'::date));
  v_hasta := coalesce(p_hasta, current_date);
  if v_desde > v_hasta then v_desde := v_hasta; end if;

  if p_agrupacion not in ('producto','categoria') then
    raise exception 'Agrupación inválida: %', p_agrupacion;
  end if;

  with meses as (
    select generate_series(date_trunc('month', v_desde),
                           date_trunc('month', v_hasta), interval '1 month')::date as mes
  ),
  lineas as (
    select date_trunc('month', v.fecha)::date as mes,
           case when p_agrupacion = 'categoria'
                then coalesce(nullif(btrim(p.categoria), ''), 'Sin categoría')
                else coalesce(vi.producto_id, 'sn:' || coalesce(nullif(btrim(vi.producto_nombre), ''), 'Sin nombre')) end as clave,
           case when p_agrupacion = 'categoria'
                then coalesce(nullif(btrim(p.categoria), ''), 'Sin categoría')
                else coalesce(p.nombre, nullif(btrim(vi.producto_nombre), ''), 'Sin nombre') end as nombre,
           vi.cantidad as u,
           vi.subtotal as neto,
           coalesce(vi.costo_total, vi.cantidad * coalesce(p.precio_compra, 0)) as costo
      from public.venta_items vi
      join public.ventas v on v.id = vi.venta_id and v.empresa_id = v_empresa
      left join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa
     where vi.empresa_id = v_empresa
       and v.estado = 'pagada'
       and v.fecha between v_desde and v_hasta
       and (v_branch is null or v.branch_id = v_branch)
       and (p_producto_ids is null or coalesce(vi.producto_id, 'sn:' || coalesce(nullif(btrim(vi.producto_nombre), ''), 'Sin nombre')) = any(p_producto_ids))
  ),
  claves as (
    select clave, max(nombre) as nombre, sum(u) as tot_u
      from lineas group by clave
  ),
  celdas as (
    select c.clave, m.mes,
           coalesce(sum(l.u), 0) as u,
           coalesce(sum(l.neto), 0) as neto,
           coalesce(sum(l.neto) - sum(l.costo), 0) as margen
      from claves c
      cross join meses m
      left join lineas l on l.clave = c.clave and l.mes = m.mes
     group by c.clave, m.mes
  )
  select
    (select jsonb_agg(to_char(mes,'YYYY-MM-DD') order by mes) from meses),
    coalesce((
      select jsonb_agg(t.s order by t.tot_u desc, t.nombre)
        from (
          select jsonb_build_object(
                   'clave', c.clave,
                   'nombre', c.nombre,
                   'total_u', c.tot_u,
                   'unidades', (select jsonb_agg(x.u      order by x.mes) from celdas x where x.clave = c.clave),
                   'neto',     (select jsonb_agg(x.neto   order by x.mes) from celdas x where x.clave = c.clave),
                   'margen',   (select jsonb_agg(x.margen order by x.mes) from celdas x where x.clave = c.clave)
                 ) as s,
                 c.tot_u, c.nombre
            from claves c
        ) t
    ), '[]'::jsonb),
    (select jsonb_build_object(
              'unidades', coalesce(sum(u), 0),
              'neto',     coalesce(sum(neto), 0),
              'margen',   coalesce(sum(neto) - sum(costo), 0))
       from lineas)
  into v_meses, v_series, v_tot;

  return jsonb_build_object(
    'meses', coalesce(v_meses, '[]'::jsonb),
    'series', v_series,
    'totales', coalesce(v_tot, jsonb_build_object('unidades',0,'neto',0,'margen',0))
  );
end;
$$;

revoke all on function public.fn_reporte_serie(date, date, text, text[], text, uuid) from public, anon;
grant execute on function public.fn_reporte_serie(date, date, text, text[], text, uuid) to authenticated;


-- ── Matriz producto × mes ────────────────────────────────────────
-- Todo lo vendido en el período, sin depender de qué se haya seleccionado.
-- Paginada por producto: con ~1.470 productos no se devuelve la tabla entera.
create or replace function public.fn_reporte_matriz(
  p_desde date default null,
  p_hasta date default null,
  p_branch_id text default null,
  p_limite int default 8,
  p_offset int default 0,
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
  v_desde date;
  v_hasta date;
  v_primera date;
  v_meses jsonb;
  v_filas jsonb;
  v_totmes jsonb;
  v_n int;
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

  -- El cliente puede pedir "todo el histórico" mandando una fecha muy antigua.
  -- Se acota a la primera venta real: sin esto, generate_series armaría cientos
  -- de meses vacíos que nadie va a mirar y que solo hacen lenta la consulta.
  select min(fecha) into v_primera
    from public.ventas where empresa_id = v_empresa and estado = 'pagada';
  v_desde := greatest(
    coalesce(p_desde, (date_trunc('month', current_date) - interval '11 months')::date),
    coalesce(v_primera, '1900-01-01'::date));
  v_hasta := coalesce(p_hasta, current_date);
  if v_desde > v_hasta then v_desde := v_hasta; end if;

  with meses as (
    select generate_series(date_trunc('month', v_desde),
                           date_trunc('month', v_hasta), interval '1 month')::date as mes
  ),
  lineas as (
    select date_trunc('month', v.fecha)::date as mes,
           -- `venta_items.producto_id` viene NULO en las líneas que no apuntan
           -- al catálogo (servicios y reparaciones escritas a mano). Agrupar por
           -- esa columna las juntaba TODAS en una sola fila, y como `x = null`
           -- nunca es cierto, el desglose mensual salía en cero mientras el
           -- total decía 1.313. Se agrupa por una clave que nunca es nula.
           coalesce(vi.producto_id, 'sn:' || coalesce(nullif(btrim(vi.producto_nombre), ''), 'Sin nombre')) as clave,
           coalesce(p.nombre, nullif(btrim(vi.producto_nombre), ''), 'Sin nombre') as nombre,
           coalesce(p.sku, '') as sku,
           vi.cantidad as u
      from public.venta_items vi
      join public.ventas v on v.id = vi.venta_id and v.empresa_id = v_empresa
      left join public.productos p on p.id = vi.producto_id and p.empresa_id = v_empresa
     where vi.empresa_id = v_empresa
       and v.estado = 'pagada'
       and v.fecha between v_desde and v_hasta
       and (v_branch is null or v.branch_id = v_branch)
  ),
  prods as (
    select clave, max(nombre) as nombre, max(sku) as sku, sum(u) as tot
      from lineas group by clave
  ),
  pagina as (
    select * from prods order by tot desc, nombre limit greatest(p_limite,1) offset greatest(p_offset,0)
  )
  select
    (select jsonb_agg(to_char(mes,'YYYY-MM-DD') order by mes) from meses),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'producto_id', g.clave,
               'nombre', g.nombre,
               'sku', g.sku,
               'total', g.tot,
               'meses', (select jsonb_agg(coalesce(c.u,0) order by m.mes)
                           from meses m
                           left join (select mes, sum(u) as u from lineas
                                       where clave = g.clave group by mes) c
                             on c.mes = m.mes)
             ) order by g.tot desc, g.nombre)
        from pagina g
    ), '[]'::jsonb),
    (select jsonb_agg(coalesce(t.u,0) order by m.mes)
       from meses m
       left join (select mes, sum(u) as u from lineas group by mes) t on t.mes = m.mes),
    (select count(*) from prods)
  into v_meses, v_filas, v_totmes, v_n;

  return jsonb_build_object(
    'meses', coalesce(v_meses, '[]'::jsonb),
    'filas', v_filas,
    'total_por_mes', coalesce(v_totmes, '[]'::jsonb),
    'productos_total', coalesce(v_n, 0)
  );
end;
$$;

revoke all on function public.fn_reporte_matriz(date, date, text, int, int, uuid) from public, anon;
grant execute on function public.fn_reporte_matriz(date, date, text, int, int, uuid) to authenticated;


-- ── Buscador de productos del reporte ────────────────────────────
-- Alimenta el selector. Devuelve las unidades del período para que elegir no
-- sea a ciegas. Nunca devuelve el catálogo completo: siempre acotado.
create or replace function public.fn_reporte_buscar_productos(
  p_q text default null,
  p_categoria text default null,
  p_desde date default null,
  p_hasta date default null,
  p_branch_id text default null,
  p_limite int default 40,
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
  v_desde date;
  v_hasta date;
  v_primera date;
  v_out jsonb;
  v_n int;
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

  -- El cliente puede pedir "todo el histórico" mandando una fecha muy antigua.
  -- Se acota a la primera venta real: sin esto, generate_series armaría cientos
  -- de meses vacíos que nadie va a mirar y que solo hacen lenta la consulta.
  select min(fecha) into v_primera
    from public.ventas where empresa_id = v_empresa and estado = 'pagada';
  v_desde := greatest(
    coalesce(p_desde, (date_trunc('month', current_date) - interval '11 months')::date),
    coalesce(v_primera, '1900-01-01'::date));
  v_hasta := coalesce(p_hasta, current_date);
  if v_desde > v_hasta then v_desde := v_hasta; end if;

  with vendidos as (
    select vi.producto_id, sum(vi.cantidad) as u
      from public.venta_items vi
      join public.ventas v on v.id = vi.venta_id and v.empresa_id = v_empresa
     where vi.empresa_id = v_empresa
       and v.estado = 'pagada'
       and v.fecha between v_desde and v_hasta
       and (v_branch is null or v.branch_id = v_branch)
     group by vi.producto_id
  ),
  filtrados as (
    select p.id, p.nombre, coalesce(p.sku,'') as sku,
           coalesce(nullif(btrim(p.categoria),''), 'Sin categoría') as categoria,
           coalesce(vd.u, 0) as unidades
      from public.productos p
      left join vendidos vd on vd.producto_id = p.id
     where p.empresa_id = v_empresa
       and (p_categoria is null or p_categoria = ''
            or coalesce(nullif(btrim(p.categoria),''), 'Sin categoría') = p_categoria)
       and (p_q is null or btrim(p_q) = ''
            or p.nombre ilike '%'||btrim(p_q)||'%'
            or coalesce(p.sku,'') ilike '%'||btrim(p_q)||'%')
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'nombre', f.nombre, 'sku', f.sku,
               'categoria', f.categoria, 'unidades', f.unidades))
        from (select * from filtrados order by unidades desc, nombre limit greatest(p_limite,1)) f
    ), '[]'::jsonb),
    (select count(*) from filtrados)
  into v_out, v_n;

  return jsonb_build_object('productos', v_out, 'coinciden', coalesce(v_n,0));
end;
$$;

revoke all on function public.fn_reporte_buscar_productos(text, text, date, date, text, int, uuid) from public, anon;
grant execute on function public.fn_reporte_buscar_productos(text, text, date, date, text, int, uuid) to authenticated;


-- Índices que sostienen estas tres consultas.
create index if not exists ventas_empresa_fecha_estado_idx
  on public.ventas (empresa_id, fecha) where estado = 'pagada';
create index if not exists venta_items_empresa_producto_idx
  on public.venta_items (empresa_id, producto_id);
