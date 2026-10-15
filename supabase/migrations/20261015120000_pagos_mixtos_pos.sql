-- Pagos mixtos del POS. Se conserva ventas.metodo_pago para compatibilidad y
-- se agrega el desglose exacto usado por caja, reportes e impresión.

alter table public.ventas
  add column if not exists pagos jsonb not null default '[]'::jsonb;

alter table public.ventas
  drop constraint if exists ventas_pagos_array_chk;
alter table public.ventas
  add constraint ventas_pagos_array_chk
  check (jsonb_typeof(pagos) = 'array');

-- Las ventas antiguas pasan a tener un pago único equivalente a su total.
update public.ventas
set pagos = jsonb_build_array(jsonb_build_object(
  'metodo_pago', coalesce(nullif(metodo_pago, ''), 'otro'),
  'monto', total_iva
))
where jsonb_array_length(pagos) = 0;

-- Sobrecarga atómica: valida los pagos, ejecuta la confirmación histórica
-- (stock, FIFO, movimiento y OT) y guarda el desglose en la misma transacción.
create or replace function public.fn_confirmar_venta(
  p_venta jsonb,
  p_items jsonb,
  p_movimiento jsonb,
  p_ajustes_stock jsonb,
  p_lotes jsonb,
  p_orden jsonb,
  p_pagos jsonb,
  p_empresa_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_impersonando boolean;
  v_pago jsonb;
  v_pagos jsonb;
  v_suma numeric := 0;
  v_cantidad integer := 0;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa_id is null then raise exception 'No autenticado'; end if;

  v_pagos := coalesce(p_pagos, jsonb_build_array(jsonb_build_object(
    'metodo_pago', p_venta->>'metodo_pago',
    'monto', (p_venta->>'total_iva')::numeric
  )));

  if jsonb_typeof(v_pagos) <> 'array' or jsonb_array_length(v_pagos) = 0 then
    raise exception 'La venta debe tener al menos un método de pago';
  end if;

  for v_pago in select value from jsonb_array_elements(v_pagos)
  loop
    if nullif(btrim(v_pago->>'metodo_pago'), '') is null
       or length(v_pago->>'metodo_pago') > 60 then
      raise exception 'Método de pago inválido';
    end if;
    if coalesce(nullif(v_pago->>'monto', '')::numeric, 0) <= 0 then
      raise exception 'Cada monto de pago debe ser mayor a cero';
    end if;
    v_suma := v_suma + (v_pago->>'monto')::numeric;
    v_cantidad := v_cantidad + 1;
  end loop;

  if abs(v_suma - (p_venta->>'total_iva')::numeric) > 1 then
    raise exception 'La suma de los pagos no coincide con el total de la venta';
  end if;

  -- La función original sigue siendo la única responsable de inventario y OT.
  perform public.fn_confirmar_venta(
    p_venta, p_items, p_movimiento, p_ajustes_stock, p_lotes, p_orden, p_empresa_id
  );

  update public.ventas
  set pagos = v_pagos,
      metodo_pago = case
        when v_cantidad > 1 then 'mixto'
        else v_pagos->0->>'metodo_pago'
      end
  where id = p_venta->>'id' and empresa_id = v_empresa_id;

  if not found then raise exception 'La venta no pudo guardar sus pagos'; end if;
end;
$$;

revoke all on function public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid)
  from public, anon;
grant execute on function public.fn_confirmar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid)
  to authenticated;

-- Resumen de medios de pago independiente del resumen general. Una venta
-- mixta aporta cada monto a su método, pero cuenta una sola vez por método.
create or replace function public.fn_ventas_pagos_resumen(
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
  v_resultado jsonb;
begin
  if p_empresa_id is not null and public.is_platform_admin() then
    v_empresa_id := p_empresa_id;
  else
    v_empresa_id := public.mi_empresa_id();
  end if;
  if v_empresa_id is null then raise exception 'No autenticado'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('metodo', metodo, 'total', total, 'count', cantidad)
    order by total desc
  ), '[]'::jsonb)
  into v_resultado
  from (
    select pago->>'metodo_pago' as metodo,
           sum((pago->>'monto')::numeric) as total,
           count(distinct v.id) as cantidad
    from public.ventas v
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(v.pagos) = 'array' and jsonb_array_length(v.pagos) > 0 then v.pagos
        else jsonb_build_array(jsonb_build_object(
          'metodo_pago', coalesce(nullif(v.metodo_pago, ''), 'otro'),
          'monto', v.total_iva
        ))
      end
    ) pago
    where v.empresa_id = v_empresa_id
      and v.estado = 'pagada'
      and (p_branch_id is null or v.branch_id = p_branch_id)
      and (p_desde is null or v.fecha >= p_desde)
      and (p_hasta is null or v.fecha <= p_hasta)
    group by pago->>'metodo_pago'
  ) resumen;

  return v_resultado;
end;
$$;

revoke all on function public.fn_ventas_pagos_resumen(date, date, text, uuid) from public, anon;
grant execute on function public.fn_ventas_pagos_resumen(date, date, text, uuid) to authenticated;

create or replace function public.fn_contar_ventas_metodo_pago(
  p_metodo_pago text,
  p_empresa_id uuid default null
)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_total bigint;
begin
  if p_empresa_id is not null and public.is_platform_admin() then
    v_empresa_id := p_empresa_id;
  else
    v_empresa_id := public.mi_empresa_id();
  end if;
  if v_empresa_id is null then raise exception 'No autenticado'; end if;

  select count(*) into v_total
  from public.ventas v
  where v.empresa_id = v_empresa_id
    and exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(v.pagos) = 'array' and jsonb_array_length(v.pagos) > 0 then v.pagos
          else jsonb_build_array(jsonb_build_object('metodo_pago', v.metodo_pago, 'monto', v.total_iva))
        end
      ) pago
      where pago->>'metodo_pago' = p_metodo_pago
    );
  return v_total;
end;
$$;

revoke all on function public.fn_contar_ventas_metodo_pago(text, uuid) from public, anon;
grant execute on function public.fn_contar_ventas_metodo_pago(text, uuid) to authenticated;

-- Si un administrador corrige una venta antigua, se reemplaza el desglose
-- por un pago único para que caja y reportes no conserven montos obsoletos.
create or replace function public.fn_actualizar_metodo_pago(
  p_venta_id text,
  p_metodo_pago text,
  p_empresa_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_impersonando boolean;
  v_estado text;
  v_total numeric;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if not v_impersonando and public.mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede cambiar el método de pago';
  end if;
  if p_metodo_pago is null or btrim(p_metodo_pago) = '' or length(p_metodo_pago) > 60 then
    raise exception 'Método de pago inválido';
  end if;

  select estado, total_iva into v_estado, v_total
  from public.ventas
  where id = p_venta_id and empresa_id = v_empresa_id
  for update;
  if v_estado is null then raise exception 'Venta no encontrada'; end if;
  if v_estado = 'anulada' then
    raise exception 'No se puede cambiar el método de pago de una venta anulada';
  end if;

  update public.ventas
  set metodo_pago = btrim(p_metodo_pago),
      pagos = jsonb_build_array(jsonb_build_object(
        'metodo_pago', btrim(p_metodo_pago),
        'monto', v_total
      ))
  where id = p_venta_id and empresa_id = v_empresa_id;
end;
$$;

revoke all on function public.fn_actualizar_metodo_pago(text, text, uuid) from public, anon;
grant execute on function public.fn_actualizar_metodo_pago(text, text, uuid) to authenticated;
