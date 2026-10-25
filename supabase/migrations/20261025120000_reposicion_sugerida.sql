-- Reposición sugerida por sucursal. SOLO LECTURA: no crea compras ni traslados.
--
-- Por producto y sucursal:
--   venta diaria   = unidades vendidas en la tienda (ventas pagadas, incluye
--                    repuestos cobrados desde una OT) en p_dias_historia ÷ días
--   punto reorden  = venta diaria × p_dias_reorden   (entrega 1 día + colchón 3)
--   objetivo       = venta diaria × p_dias_objetivo  (30 días)
--   ya viene       = OC en borrador/parcial de los últimos 30 días, menos lo recibido
--   sugerido       = si stock + ya viene ≤ punto de reorden: objetivo − stock − ya viene
-- El stock_min manual del producto actúa como piso de ambos umbrales.
-- Bajo pedido: no se mantiene en stock lo que se vende poco (menos de
-- p_min_ventas ventas distintas) ni lo caro (precio_compra ≥ p_costo_bajo_pedido),
-- aunque rote: en un servicio técnico esas piezas se compran cuando entra la
-- reparación y llegan al día siguiente. El stock_min manual manda sobre ambas.
-- Los cálculos multiplican antes de dividir: 4 ÷ 60 × 30 en decimal daba
-- 2,0000…01 y el redondeo hacia arriba sugería 3 en vez de 2.
-- Antes de comprar se busca otra sucursal con excedente (stock sobre su propio
-- objetivo) y se sugiere trasladar; el resto se sugiere comprar al último
-- proveedor del producto.

-- La firma cambia (nuevo p_min_ventas): sin el drop quedarían dos versiones y
-- la llamada sin argumentos sería ambigua.
drop function if exists public.fn_reposicion_sugerida(int, int, int, uuid);
drop function if exists public.fn_reposicion_sugerida(int, int, int, int, uuid);

create or replace function public.fn_reposicion_sugerida(
  p_dias_historia int default 60,
  p_dias_objetivo int default 30,
  p_dias_reorden  int default 4,
  p_min_ventas    int default 3,
  p_costo_bajo_pedido numeric default 70000,
  p_empresa_id    uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_imp     boolean;
  v_hoy     date;
  v_res     jsonb;
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
  if not v_imp and coalesce(public.mi_rol(), '') not in ('admin', 'encargado') then
    raise exception 'Solo administradores y encargados ven la reposición' using errcode = '42501';
  end if;
  if p_dias_historia not between 7 and 365
     or p_dias_objetivo not between 1 and 180
     or p_dias_reorden not between 0 and 60
     or p_min_ventas not between 1 and 50
     or p_costo_bajo_pedido is null or p_costo_bajo_pedido <= 0 then
    raise exception 'Parámetros de reposición fuera de rango';
  end if;
  v_hoy := (now() at time zone 'America/Santiago')::date;

  with
  suc as (
    select b->>'id' as id, coalesce(b->>'nombre', b->>'name') as nombre
      from public.erp_data d
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(d.datos) = 'array' then d.datos
             when jsonb_typeof(d.datos) = 'string' then (d.datos #>> '{}')::jsonb
             else '[]'::jsonb end
      ) b
     where d.empresa_id = v_empresa and d.clave = 'bodegas' and b->>'id' is not null
  ),
  prod as (
    select p.id, p.nombre, p.sku, p.categoria,
           coalesce(p.stock_min, 0) as stock_min,
           coalesce(p.precio_compra, 0) as precio_compra
      from public.productos p
     where p.empresa_id = v_empresa and p.tipo is distinct from 'servicio'
  ),
  vendido as (
    select vi.producto_id,
           coalesce(nullif(v.bodega_id, ''), nullif(v.branch_id, '')) as bodega_id,
           coalesce(sum(vi.cantidad) filter (where v.fecha > v_hoy - p_dias_historia), 0) as u_hist,
           coalesce(sum(vi.cantidad) filter (where v.fecha > v_hoy - 90), 0) as u_90,
           count(distinct v.id) filter (where v.fecha > v_hoy - p_dias_historia) as n_hist
      from public.ventas v
      join public.venta_items vi on vi.venta_id = v.id and vi.empresa_id = v_empresa
      join prod on prod.id = vi.producto_id
     where v.empresa_id = v_empresa
       and v.estado = 'pagada'
       and v.fecha > v_hoy - greatest(p_dias_historia, 90)
     group by 1, 2
  ),
  oc_items as (
    select o.numero, o.proveedor_id, o.proveedor_nombre, o.estado,
           nullif(left(o.fecha::text, 10), '')::date as fecha,
           it, o.recepciones, o.bodega_id as oc_bodega
      from public.ocs o
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end
      ) it
     where o.empresa_id = v_empresa
  ),
  viene as (
    select oi.it->>'producto_id' as producto_id,
           coalesce(nullif(oi.it->>'bodega_id', ''), oi.oc_bodega) as bodega_id,
           sum(greatest(0, coalesce((oi.it->>'cantidad')::numeric, 0) - coalesce(rec.recibido, 0))) as cantidad,
           jsonb_agg(distinct oi.numero) as ocs
      from oc_items oi
      left join lateral (
        select sum(coalesce((ri->>'cantidad')::numeric, 0)) as recibido
          from jsonb_array_elements(
                 case when jsonb_typeof(oi.recepciones) = 'array' then oi.recepciones else '[]'::jsonb end
               ) r
          cross join lateral jsonb_array_elements(
                 case when jsonb_typeof(r->'items') = 'array' then r->'items' else '[]'::jsonb end
               ) ri
         where ri->>'prod_item_id' = oi.it->>'id'
      ) rec on true
     where oi.estado in ('borrador', 'parcial')
       and oi.fecha >= v_hoy - 30
     group by 1, 2
  ),
  ultimo_prov as (
    select distinct on (oi.it->>'producto_id')
           oi.it->>'producto_id' as producto_id, oi.proveedor_id, oi.proveedor_nombre
      from oc_items oi
     where oi.estado <> 'cancelada' and coalesce(oi.proveedor_nombre, '') <> ''
     order by oi.it->>'producto_id', oi.fecha desc nulls last
  ),
  base as (
    select s.id as bodega_id, s.nombre as bodega_nombre, p.id as producto_id,
           p.nombre, p.sku, p.categoria, p.stock_min, p.precio_compra,
           coalesce(st.cantidad, 0) as stock,
           coalesce(vd.u_hist, 0) as u_hist,
           coalesce(vd.u_90, 0) as u_90,
           coalesce(vd.n_hist, 0) as n_hist,
           coalesce(vi.cantidad, 0) as ya_viene,
           vi.ocs,
           coalesce(vd.u_hist, 0)::numeric / p_dias_historia as diaria
      from suc s
      cross join prod p
      left join public.producto_stock st on st.producto_id = p.id and st.bodega_id = s.id
      left join vendido vd on vd.producto_id = p.id and vd.bodega_id = s.id
      left join viene vi on vi.producto_id = p.id and vi.bodega_id = s.id
  ),
  calc as (
    select b.*,
           b.precio_compra >= p_costo_bajo_pedido as caro,
           b.n_hist >= p_min_ventas and b.precio_compra < p_costo_bajo_pedido as frecuente,
           case when b.n_hist >= p_min_ventas and b.precio_compra < p_costo_bajo_pedido
                then greatest(ceil(b.u_hist::numeric * p_dias_reorden / p_dias_historia), b.stock_min)
                else b.stock_min end as punto_reorden,
           case when b.n_hist >= p_min_ventas and b.precio_compra < p_costo_bajo_pedido
                then greatest(ceil(b.u_hist::numeric * p_dias_objetivo / p_dias_historia), b.stock_min)
                else b.stock_min end as objetivo
      from base b
  ),
  necesidad as (
    select c.*,
           case when (c.frecuente or c.stock_min > 0)
                 and c.stock + c.ya_viene <= c.punto_reorden
                then greatest(0, c.objetivo - greatest(c.stock, 0) - c.ya_viene)
                else 0 end as sugerido,
           case when c.u_hist > 0 then round(c.stock::numeric * p_dias_historia / c.u_hist, 1) end as cobertura,
           greatest(0, c.stock - c.objetivo) as excedente
      from calc c
  ),
  donante as (
    select distinct on (producto_id) producto_id, bodega_id as donante_id,
           bodega_nombre as donante_nombre, excedente
      from necesidad
     where excedente > 0
     order by producto_id, excedente desc, bodega_id
  ),
  asignado as (
    select n.*, d.donante_id, d.donante_nombre, coalesce(d.excedente, 0) as excedente_donante,
           sum(case when d.donante_id is not null then n.sugerido else 0 end)
             over (partition by n.producto_id order by n.cobertura nulls first, n.bodega_id) as acumulado
      from necesidad n
      left join donante d on d.producto_id = n.producto_id and d.donante_id <> n.bodega_id
  ),
  final as (
    select a.*,
           case when a.sugerido > 0 and a.donante_id is not null
                then greatest(0, least(a.sugerido, a.excedente_donante - (a.acumulado - a.sugerido)))
                else 0 end as traslado
      from asignado a
  ),
  filas as (
    select f.*,
           f.sugerido - f.traslado as compra,
           case when f.stock_min > 0 then null
                when f.caro then 'caro'
                when f.n_hist < p_min_ventas then 'poca_rotacion' end as motivo_bajo_pedido,
           up.proveedor_id, up.proveedor_nombre,
           case
             when f.stock < 0 then 'stock_negativo'
             when f.sugerido > 0 and f.stock <= 0 then 'agotado'
             when f.sugerido > 0 then 'reponer'
             when f.stock <= 0 and f.ya_viene > 0 then 'en_camino'
             when f.stock <= 0 and f.u_hist > 0 and not f.frecuente then 'bajo_pedido'
             when f.u_90 = 0 and f.stock > 0 then 'sin_movimiento'
             when f.cobertura > 90 then 'exceso'
             else 'ok'
           end as estado
      from final f
      left join ultimo_prov up on up.producto_id = f.producto_id
  )
  select jsonb_build_object(
    'parametros', jsonb_build_object(
      'hoy', v_hoy, 'dias_historia', p_dias_historia,
      'dias_objetivo', p_dias_objetivo, 'dias_reorden', p_dias_reorden, 'min_ventas', p_min_ventas,
      'costo_bajo_pedido', p_costo_bajo_pedido),
    'sucursales', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre)), '[]'::jsonb) from suc),
    'resumen', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'bodega_id', r.bodega_id, 'nombre', r.bodega_nombre,
               'agotado', r.agotado, 'reponer', r.reponer, 'en_camino', r.en_camino, 'stock_negativo', r.negativo,
               'bajo_pedido', r.bajo_pedido,
               'exceso', r.exceso, 'sin_movimiento', r.sin_mov,
               'unidades_a_comprar', r.u_compra, 'unidades_a_trasladar', r.u_traslado,
               'monto_compra_estimado', round(r.monto_compra),
               'monto_inmovilizado', round(r.inmovilizado))), '[]'::jsonb)
        from (
          select bodega_id, bodega_nombre,
                 count(*) filter (where estado = 'agotado') as agotado,
                 count(*) filter (where estado = 'reponer') as reponer,
                 count(*) filter (where estado = 'en_camino') as en_camino,
                 count(*) filter (where estado = 'bajo_pedido') as bajo_pedido,
                 count(*) filter (where estado = 'stock_negativo') as negativo,
                 count(*) filter (where estado = 'exceso') as exceso,
                 count(*) filter (where estado = 'sin_movimiento') as sin_mov,
                 coalesce(sum(compra), 0) as u_compra,
                 coalesce(sum(traslado), 0) as u_traslado,
                 coalesce(sum(compra * precio_compra), 0) as monto_compra,
                 coalesce(sum(stock * precio_compra) filter (where estado = 'sin_movimiento'), 0) as inmovilizado
            from filas group by bodega_id, bodega_nombre
        ) r
    ),
    'filas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'bodega_id', f.bodega_id, 'bodega_nombre', f.bodega_nombre,
               'producto_id', f.producto_id, 'nombre', f.nombre, 'sku', f.sku, 'categoria', f.categoria,
               'estado', f.estado,
               'stock', f.stock, 'ya_viene', f.ya_viene, 'ocs_pendientes', f.ocs,
               'vendidas_periodo', f.u_hist, 'ventas_distintas', f.n_hist, 'venta_diaria', round(f.diaria, 2),
               'cobertura_dias', f.cobertura,
               'punto_reorden', f.punto_reorden, 'objetivo', f.objetivo, 'stock_min_manual', f.stock_min,
               'sugerido', f.sugerido,
               'costo_unitario', f.precio_compra,
               'costo_registrado', f.precio_compra > 0,
               'motivo_bajo_pedido', f.motivo_bajo_pedido,
               'trasladar', f.traslado,
               'trasladar_desde', case when f.traslado > 0 then jsonb_build_object('id', f.donante_id, 'nombre', f.donante_nombre) end,
               'comprar', f.compra,
               'costo_compra_estimado', round(f.compra * f.precio_compra),
               'proveedor', case when f.proveedor_nombre is not null then jsonb_build_object('id', f.proveedor_id, 'nombre', f.proveedor_nombre) end
             ) order by
               case f.estado when 'stock_negativo' then 0 when 'agotado' then 1 when 'reponer' then 2
                             when 'en_camino' then 3 when 'bajo_pedido' then 4 when 'exceso' then 5
                             when 'sin_movimiento' then 6 else 7 end,
               f.cobertura nulls first, f.venta_diaria desc, f.nombre), '[]'::jsonb)
        from (select *, diaria as venta_diaria from filas) f
       where f.estado <> 'ok'
    )
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.fn_reposicion_sugerida(int, int, int, int, numeric, uuid) from public, anon;
grant execute on function public.fn_reposicion_sugerida(int, int, int, int, numeric, uuid) to authenticated;

comment on function public.fn_reposicion_sugerida(int, int, int, int, numeric, uuid) is
  'Reposición sugerida por sucursal (solo lectura): demanda real, punto de reorden, objetivo de cobertura, OC en camino, traslado desde sucursal con excedente y compra al último proveedor. Marcador: trasladar_desde.';
