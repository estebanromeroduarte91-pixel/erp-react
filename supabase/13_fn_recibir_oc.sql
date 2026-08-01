-- Fase 3, punto 5: recibir una OC (total o parcial) pasa de un
-- read-modify-write del array `recepciones` completo desde el cliente (dos
-- recepciones parciales casi simultáneas de la misma OC podían pisarse y
-- perder una de las dos) a una función atómica con lock de fila sobre la OC.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

create or replace function public.fn_recibir_oc(
  p_oc_id text,
  p_recepciones jsonb,
  p_lotes jsonb default null,
  p_movimientos jsonb default null,
  p_ajustes_stock jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid := public.mi_empresa_id();
  v_items jsonb;
  v_estado_actual text;
  v_recepciones_nuevas jsonb;
  v_total_ord numeric := 0;
  v_total_rec numeric := 0;
  it jsonb;
  v_rec_item numeric;
  v_nuevo_estado text;
  v_hoy text := to_char(now(), 'YYYY-MM-DD');
begin
  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;

  select items, estado, recepciones into v_items, v_estado_actual, v_recepciones_nuevas
  from public.ocs where id = p_oc_id and empresa_id = v_empresa_id
  for update;

  if v_items is null then
    raise exception 'OC no encontrada';
  end if;

  v_recepciones_nuevas := coalesce(v_recepciones_nuevas, '[]'::jsonb) || p_recepciones;

  if v_estado_actual in ('cancelada', 'confirmada') then
    v_nuevo_estado := v_estado_actual;
  elsif jsonb_array_length(v_items) = 0 then
    v_nuevo_estado := 'borrador';
  else
    for it in select * from jsonb_array_elements(v_items)
    loop
      select coalesce(sum((ri->>'cantidad')::numeric), 0) into v_rec_item
      from jsonb_array_elements(v_recepciones_nuevas) r, jsonb_array_elements(r->'items') ri
      where ri->>'prod_item_id' = it->>'id';

      v_total_ord := v_total_ord + (it->>'cantidad')::numeric;
      v_total_rec := v_total_rec + least(v_rec_item, (it->>'cantidad')::numeric);
    end loop;

    if v_total_rec = 0 then v_nuevo_estado := 'borrador';
    elsif v_total_rec >= v_total_ord then v_nuevo_estado := 'recibida';
    else v_nuevo_estado := 'parcial';
    end if;
  end if;

  update public.ocs
  set recepciones = v_recepciones_nuevas,
      estado = v_nuevo_estado,
      fecha_primera_recepcion = coalesce(fecha_primera_recepcion, v_hoy),
      fecha_recepcion = case when v_nuevo_estado = 'recibida' then v_hoy else fecha_recepcion end
  where id = p_oc_id and empresa_id = v_empresa_id;

  if p_lotes is not null then
    insert into public.lotes_inventario
      (id, empresa_id, producto_id, bodega_id, cantidad_inicial, cantidad_restante, costo_unitario, origen, oc_id, oc_item_id, fecha, creado_en)
    select
      l->>'id', v_empresa_id, l->>'producto_id', l->>'bodega_id',
      (l->>'cantidad_inicial')::numeric, (l->>'cantidad_restante')::numeric, (l->>'costo_unitario')::numeric,
      coalesce(l->>'origen', 'oc'), l->>'oc_id', l->>'oc_item_id', l->>'fecha',
      coalesce((l->>'creado_en')::timestamptz, now())
    from jsonb_array_elements(p_lotes) l;
  end if;

  if p_movimientos is not null then
    insert into public.movimientos_inventario
      (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino, referencia, referencia_id, notas, usuario)
    select
      m->>'id', v_empresa_id, m->>'fecha', m->>'hora', m->>'tipo',
      coalesce(m->'productos', '[]'::jsonb), m->>'bodega_origen', m->>'bodega_destino',
      m->>'referencia', m->>'referencia_id', m->>'notas', m->>'usuario'
    from jsonb_array_elements(p_movimientos) m;
  end if;

  if p_ajustes_stock is not null then
    perform public.fn_ajustar_stock(p_ajustes_stock);
  end if;
end;
$$;

grant execute on function public.fn_recibir_oc(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
