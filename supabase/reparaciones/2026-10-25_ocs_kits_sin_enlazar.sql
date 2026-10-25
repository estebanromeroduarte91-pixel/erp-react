-- Reparación única (no es migración): OC creadas desde Kits con líneas sin
-- producto_id. Se recibieron pero no sumaron stock, lote ni movimiento.
-- Steve Docs: 22 OC, 255 líneas (15-07 al 23-10-2026). Causa corregida en
-- 98747a7 (KitsTab) y 1386621 (ComprasPage).
--
-- · Enlaza TODAS las líneas a su producto (único por nombre exacto).
-- · Suma stock + lote + movimiento SOLO a las recibidas desde 2026-09-26:
--   antes de esa fecha el stock pudo reescribirse sin rastro (guardar producto
--   pisaba el stock hasta el 25-09), así que sumar podría duplicar. Esas se
--   corrigen con conteo físico.
-- · v_aplicar = false (por defecto) solo simula y no cambia nada.
-- · Idempotente: una vez enlazadas, las líneas dejan de ser candidatas.
do $$
declare
  v_aplicar      boolean := false;   -- ← cambiar a true para aplicar
  v_emp          uuid := 'f347f086-d2ba-40b0-ab70-95a7c02c8781';
  v_desde_seguro date := '2026-09-26';
  v_hora         text := to_char(now() at time zone 'America/Santiago', 'HH24:MI');
  v_total        int;
  v_ambiguas     int;
  v_resumen      jsonb;
begin
  create temp table _fix on commit drop as
  select o.id as oc_id, o.numero,
         nullif(left(o.fecha_primera_recepcion::text, 10), '')::date as recibida,
         it->>'id' as item_id,
         it->>'producto_nombre' as nombre,
         coalesce((it->>'precio_neto')::numeric, 0) as costo,
         rec.bodega_id,
         rec.recibido,
         cand.producto_id,
         cand.candidatos
    from public.ocs o
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
    cross join lateral (
      select min(r->>'bodega_id') as bodega_id, sum((ri->>'cantidad')::numeric) as recibido
        from jsonb_array_elements(coalesce(o.recepciones, '[]'::jsonb)) r
        cross join lateral jsonb_array_elements(coalesce(r->'items', '[]'::jsonb)) ri
       where ri->>'prod_item_id' = it->>'id'
    ) rec
    cross join lateral (
      select min(p.id) as producto_id, count(*) as candidatos
        from public.productos p
       where p.empresa_id = v_emp
         and p.tipo is distinct from 'servicio'
         and lower(regexp_replace(trim(p.nombre), '\s+', ' ', 'g'))
           = lower(regexp_replace(trim(it->>'producto_nombre'), '\s+', ' ', 'g'))
    ) cand
   where o.empresa_id = v_emp
     and nullif(it->>'producto_id', '') is null
     and coalesce(rec.recibido, 0) > 0;

  select count(*), count(*) filter (where candidatos <> 1)
    into v_total, v_ambiguas
    from _fix;

  if v_total = 0 then
    raise exception 'RESULTADO: no hay líneas pendientes. Probablemente ya se aplicó.';
  end if;
  if v_ambiguas > 0 then
    raise exception 'RESULTADO: % líneas no tienen un único producto con ese nombre. No se cambió nada.', v_ambiguas;
  end if;

  select jsonb_build_object(
           'lineas_a_enlazar', count(*),
           'ordenes', count(distinct numero),
           'lineas_que_suman_stock', count(*) filter (where recibida >= v_desde_seguro),
           'unidades_que_suman', coalesce(sum(recibido) filter (where recibida >= v_desde_seguro), 0),
           'ordenes_que_suman', (select jsonb_agg(distinct numero) from _fix where recibida >= v_desde_seguro),
           'lineas_solo_enlazar_y_contar', count(*) filter (where recibida < v_desde_seguro or recibida is null))
    into v_resumen
    from _fix;

  if not v_aplicar then
    raise exception 'RESULTADO (simulación, no se cambió nada): %', jsonb_pretty(v_resumen);
  end if;

  -- 1) Enlazar el producto en las líneas de la OC y en sus recepciones.
  update public.ocs o
     set items = (
           select jsonb_agg(
                    case when f.item_id is not null
                         then jsonb_set(e.it, '{producto_id}', to_jsonb(f.producto_id))
                         else e.it end
                    order by e.ord)
             from jsonb_array_elements(o.items) with ordinality as e(it, ord)
             left join _fix f on f.oc_id = o.id and f.item_id = e.it->>'id'),
         recepciones = (
           select jsonb_agg(
                    jsonb_set(e.r, '{items}', coalesce((
                      select jsonb_agg(
                               case when f.item_id is not null
                                    then jsonb_set(e2.ri, '{producto_id}', to_jsonb(f.producto_id))
                                    else e2.ri end
                               order by e2.ord2)
                        from jsonb_array_elements(coalesce(e.r->'items', '[]'::jsonb)) with ordinality as e2(ri, ord2)
                        left join _fix f on f.oc_id = o.id and f.item_id = e2.ri->>'prod_item_id'), '[]'::jsonb))
                    order by e.ord)
             from jsonb_array_elements(o.recepciones) with ordinality as e(r, ord))
   where o.empresa_id = v_emp
     and o.id in (select oc_id from _fix);

  -- 2) Stock: solo lo recibido desde la fecha segura.
  insert into public.producto_stock (producto_id, bodega_id, cantidad)
  select producto_id, bodega_id, sum(recibido)
    from _fix
   where recibida >= v_desde_seguro
   group by producto_id, bodega_id
  on conflict (producto_id, bodega_id)
  do update set cantidad = public.producto_stock.cantidad + excluded.cantidad;

  -- 3) Lote FIFO con el costo de la OC. Lo que queda no puede superar el
  --    stock actual (si la pieza ya se vendió, el lote nace consumido).
  insert into public.lotes_inventario
    (id, empresa_id, producto_id, bodega_id, cantidad_inicial, cantidad_restante,
     costo_unitario, origen, oc_id, oc_item_id, fecha, creado_en)
  select 'fix-' || f.oc_id || '-' || f.item_id, v_emp, f.producto_id, f.bodega_id,
         f.recibido,
         least(f.recibido, greatest(coalesce(ps.cantidad, 0), 0)),
         f.costo, 'oc', f.oc_id, f.item_id, f.recibida::text, f.recibida::timestamptz
    from _fix f
    left join public.producto_stock ps on ps.producto_id = f.producto_id and ps.bodega_id = f.bodega_id
   where f.recibida >= v_desde_seguro;

  -- 4) Movimiento de entrada por OC y tienda, con la fecha real de recepción.
  insert into public.movimientos_inventario
    (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino,
     referencia, referencia_id, notas, usuario)
  select 'fix-' || oc_id || '-' || bodega_id, v_emp, min(recibida)::text, v_hora, 'entrada',
         jsonb_agg(jsonb_build_object(
           'producto_id', producto_id, 'producto_nombre', nombre,
           'cantidad', recibido, 'direccion', '+')),
         null, bodega_id, numero, oc_id,
         'Corrección: la recepción no había sumado stock (OC creada desde Kits sin productos enlazados)',
         'Corrección Pixit'
    from _fix
   where recibida >= v_desde_seguro
   group by oc_id, numero, bodega_id;

  raise notice 'Aplicado: %', v_resumen;
end $$;
