-- Solo lectura: movimientos de la última corrección de stock de esta OC.
with ultima_edicion as (
  select a.empresa_id, a.clave, a.actualizado_en,
         e.nombre as empresa, o.id as oc_id, o.numero
  from public.ocs o
  join public.empresas e on e.id = o.empresa_id
  join public.erp_data a
    on a.empresa_id = o.empresa_id
   and a.clave like 'oc-edicion-%'
   and a.datos::jsonb->'antes'->>'id' = o.id
  where lower(trim(e.nombre)) = 'steve docs'
    and o.numero = 'OC-00134'
    and exists (
      select 1 from public.movimientos_inventario m
      where m.empresa_id = o.empresa_id
        and m.referencia_id = o.id
        and m.notas = 'Corrección de recepción: ' || a.clave
    )
  order by a.actualizado_en desc, a.clave desc
  limit 1
), bodegas as (
  select b->>'id' as id,
         coalesce(b->>'nombre', b->>'name', b->>'id') as nombre
  from ultima_edicion a
  join public.erp_data d
    on d.empresa_id = a.empresa_id and d.clave = 'bodegas'
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(d.datos::jsonb) = 'string'
      then (d.datos::jsonb #>> '{}')::jsonb
      else d.datos::jsonb end
  ) b
)
select
  a.empresa,
  a.numero as orden_compra,
  a.actualizado_en as fecha_edicion,
  p->>'producto_id' as producto_id,
  p->>'producto_nombre' as producto,
  coalesce(b.nombre, m.bodega_origen, m.bodega_destino) as bodega,
  case when p->>'direccion' = '-'
    then -abs((p->>'cantidad')::numeric)
    else abs((p->>'cantidad')::numeric)
  end as variacion_registrada,
  s.cantidad as stock_actual_en_bodega
from ultima_edicion a
join public.movimientos_inventario m
  on m.empresa_id = a.empresa_id
 and m.referencia_id = a.oc_id
 and m.notas = 'Corrección de recepción: ' || a.clave
cross join lateral jsonb_array_elements(m.productos) p
left join bodegas b
  on b.id = coalesce(m.bodega_origen, m.bodega_destino)
left join public.producto_stock s
  on s.producto_id = p->>'producto_id'
 and s.bodega_id = coalesce(m.bodega_origen, m.bodega_destino)
order by producto, variacion_registrada;
