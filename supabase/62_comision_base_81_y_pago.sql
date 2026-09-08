-- Comisión técnica: una sola fórmula, y la función de pago utilizable.
--
-- ── LA FÓRMULA ───────────────────────────────────────────────────
-- Acuerdo con el técnico: al bruto cobrado se le descuenta un 19% y sobre ese
-- resultado se aplica el porcentaje de comisión.
--     $100.000 → base $81.000 → 20% = $16.200
-- El sistema venía dividiendo por 1,19 (el neto tributario real), que sobre
-- $100.000 da $84.034 y una comisión de $16.807: $607 de más por orden.
-- No es lo mismo restar 19% que quitar el IVA — $81.000 más IVA son $96.390.
-- Se adopta la regla acordada, que es la que manda acá.
--
-- La fórmula estaba repetida en cinco lugares (tres en el frontend, el trigger
-- de la 58 y fn_confirmar_venta de la 57) y no todos calculaban igual. Ahora
-- vive en `fn_comision_base` y todo el SQL la llama.
--
-- ── LOS DOS BUGS QUE IMPEDÍAN PAGAR ──────────────────────────────
-- 1) `pagar_comision_tecnica` declaraba `p_orden_id uuid`, pero `ordenes.id`
--    es TEXT con valores tipo '1788380615640' → «invalid input syntax for
--    type uuid». La función nunca pudo pagar nada.
-- 2) El trigger de la 58 topaba la base contra el neto de los ítems
--    'ot-servicio' de la venta. Si la venta no llevaba ese ítem, ese neto es 0
--    y `least(base, 0)` dejaba la comisión en cero — o en NULL por la rama
--    else. El tope ahora solo se aplica cuando el servicio sí está detallado.

-- ── La fórmula, definida una vez ─────────────────────────────────
create or replace function public.fn_comision_base(p_bruto numeric)
returns numeric
language sql
immutable
set search_path = public
as $$ select round(coalesce(p_bruto, 0) * 0.81) $$;

comment on function public.fn_comision_base(numeric) is
  'Base comisionable: al bruto cobrado se le descuenta 19% (acuerdo con el técnico).';

grant execute on function public.fn_comision_base(numeric) to authenticated;


-- ── Trigger de la 58, con la fórmula nueva y el tope corregido ───
create or replace function public.fn_calcular_comision_tecnica_orden()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_servicio_neto numeric := 0;
  v_base_configurada numeric := 0;
begin
  if new.venta_id is not null and new.venta_id is distinct from old.venta_id then
    if coalesce(new.comision_tecnica_activa, false)
       and coalesce(new.comision_tecnica_porcentaje, 0) > 0
       and coalesce(new.comision_tecnica_bruto, 0) > 0 then

      select coalesce(sum(subtotal), 0)
        into v_servicio_neto
      from public.venta_items
      where venta_id = new.venta_id
        and empresa_id = new.empresa_id
        and producto_id = 'ot-servicio';

      v_base_configurada := public.fn_comision_base(new.comision_tecnica_bruto);

      -- El tope evita pagar comisión sobre un descuento, pero solo tiene
      -- sentido si el servicio viene detallado en la venta. Si no hay ítem
      -- 'ot-servicio', ese neto es 0 y topar contra él anulaba la comisión.
      new.comision_tecnica_base := case
        when v_servicio_neto > 0 then least(v_base_configurada, v_servicio_neto)
        else v_base_configurada
      end;
      new.comision_tecnica_monto := round(new.comision_tecnica_base * new.comision_tecnica_porcentaje / 100);
    else
      new.comision_tecnica_base := null;
      new.comision_tecnica_monto := null;
    end if;
  end if;
  return new;
end;
$$;


-- ── Pago: id de texto + fórmula nueva, conservando lo de la 60 ───
drop function if exists public.pagar_comision_tecnica(uuid, date, text);
drop function if exists public.pagar_comision_tecnica(text, date, text);

create or replace function public.pagar_comision_tecnica(
  p_orden_id text,
  p_fecha date default current_date,
  p_metodo text default 'Transferencia'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden public.ordenes%rowtype;
  v_role text;
  v_es_platform_admin boolean := public.is_platform_admin();
  v_gasto_id text;
  v_base numeric;
  v_monto numeric;
begin
  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;

  select role into v_role
  from public.user_profiles
  where id = auth.uid() and empresa_id = v_orden.empresa_id and activo is distinct from false;

  -- Se conserva el permiso que agregó 60_integridad_comisiones: el
  -- superadministrador de Pixit puede pagar mientras impersona una empresa.
  if not v_es_platform_admin and coalesce(v_role, '') <> 'admin' then
    raise exception 'Solo un administrador puede registrar el pago de una comisión.';
  end if;

  if v_orden.comision_tecnica_pagada then
    raise exception 'Esta comisión ya fue pagada.';
  end if;

  -- Si el monto no quedó guardado, se deriva del bruto con la fórmula única.
  v_base := v_orden.comision_tecnica_base;
  v_monto := v_orden.comision_tecnica_monto;
  if coalesce(v_monto, 0) <= 0
     and coalesce(v_orden.comision_tecnica_bruto, 0) > 0
     and coalesce(v_orden.comision_tecnica_porcentaje, 0) > 0 then
    v_base := public.fn_comision_base(v_orden.comision_tecnica_bruto);
    v_monto := round(v_base * v_orden.comision_tecnica_porcentaje / 100);
  end if;

  if not coalesce(v_orden.comision_tecnica_activa, false)
     or coalesce(v_monto, 0) <= 0
     or v_orden.tecnico_id is null then
    raise exception 'La orden no tiene una comisión técnica válida para pagar.';
  end if;

  -- Se conserva la exigencia de 60_integridad_comisiones.
  if v_orden.venta_id is null or not exists (
    select 1 from public.ventas v
    where v.id = v_orden.venta_id and v.empresa_id = v_orden.empresa_id and v.estado = 'pagada'
  ) then
    raise exception 'La comisión solo se puede pagar después de confirmar una venta vigente.';
  end if;

  v_gasto_id := 'comision-ot-' || v_orden.id::text;

  insert into public.gastos (
    id, empresa_id, fecha, descripcion, monto, categoria, subcategoria,
    metodo, bodega_id, bodega_nombre, con_credito_fiscal
  ) values (
    v_gasto_id, v_orden.empresa_id, coalesce(p_fecha, current_date),
    'Comisión OT #' || v_orden.num || coalesce(' — ' || nullif(v_orden.trabajo, ''), ''),
    round(v_monto), 'Comisiones', v_orden.tecnico,
    coalesce(nullif(trim(p_metodo), ''), 'Transferencia'),
    coalesce(v_orden.branch_id, 'general'), null, false
  ) on conflict (id) do nothing;

  -- Base y monto quedan congelados en la orden: el pago deja de depender de un
  -- cálculo hecho en el navegador y el histórico no se mueve si cambia la regla.
  update public.ordenes
  set comision_tecnica_base = v_base,
      comision_tecnica_monto = v_monto,
      comision_tecnica_pagada = true,
      comision_tecnica_pagada_at = coalesce(p_fecha, current_date),
      comision_tecnica_gasto_id = v_gasto_id
  where id = v_orden.id;

  return jsonb_build_object('orden_id', v_orden.id, 'gasto_id', v_gasto_id, 'monto', round(v_monto));
end;
$$;

revoke all on function public.pagar_comision_tecnica(text, date, text) from public, anon;
grant execute on function public.pagar_comision_tecnica(text, date, text) to authenticated;


-- ── Recalcular lo que aún no se ha pagado ────────────────────────
-- Las comisiones YA pagadas no se tocan: su monto es un gasto contable
-- registrado y cambiarlo dejaría la contabilidad sin cuadrar.
update public.ordenes
set comision_tecnica_base = public.fn_comision_base(comision_tecnica_bruto),
    comision_tecnica_monto = round(public.fn_comision_base(comision_tecnica_bruto) * comision_tecnica_porcentaje / 100)
where comision_tecnica_activa = true
  and comision_tecnica_pagada = false
  and coalesce(comision_tecnica_bruto, 0) > 0
  and coalesce(comision_tecnica_porcentaje, 0) > 0;
