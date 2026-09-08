-- Corrige `pagar_comision_tecnica`: recibía `p_orden_id uuid`, pero
-- `ordenes.id` es TEXT y sus valores no son UUID (son marcas de tiempo, por
-- ejemplo '1788380615640'). Postgres intentaba convertir la columna a uuid
-- para comparar y abortaba con:
--   invalid input syntax for type uuid: "1788380615640"
--
-- Es decir, la función NUNCA pudo pagar una comisión — ni desde la ficha de la
-- orden ni desde el listado. El cuerpo ya trataba el id como texto
-- (`v_orden.id::text`); lo único equivocado era la firma.
--
-- Hay que DROP y no `create or replace`: cambiar el tipo de un parámetro cambia
-- la identidad de la función, así que un replace dejaría las dos versiones
-- conviviendo y PostgREST no sabría cuál llamar.

drop function if exists public.pagar_comision_tecnica(uuid, date, text);

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
  v_gasto_id text;
begin
  select * into v_orden
  from public.ordenes
  where id = p_orden_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  select role into v_role
  from public.user_profiles
  where id = auth.uid()
    and empresa_id = v_orden.empresa_id
    and activo is distinct from false;

  if v_role <> 'admin' then
    raise exception 'Solo un administrador puede registrar el pago de una comisión.';
  end if;

  if v_orden.comision_tecnica_pagada then
    raise exception 'Esta comisión ya fue pagada.';
  end if;

  if not coalesce(v_orden.comision_tecnica_activa, false)
     or coalesce(v_orden.comision_tecnica_monto, 0) <= 0
     or v_orden.tecnico_id is null then
    raise exception 'La orden no tiene una comisión técnica válida para pagar.';
  end if;

  -- ID determinístico: incluso ante doble clic o reintento no puede duplicarse.
  v_gasto_id := 'comision-ot-' || v_orden.id::text;

  insert into public.gastos (
    id, empresa_id, fecha, descripcion, monto, categoria, subcategoria,
    metodo, bodega_id, bodega_nombre, con_credito_fiscal
  ) values (
    v_gasto_id,
    v_orden.empresa_id,
    coalesce(p_fecha, current_date),
    'Comisión OT #' || v_orden.num || coalesce(' — ' || nullif(v_orden.trabajo, ''), ''),
    round(v_orden.comision_tecnica_monto),
    'Comisiones',
    v_orden.tecnico,
    coalesce(nullif(trim(p_metodo), ''), 'Transferencia'),
    coalesce(v_orden.branch_id, 'general'),
    null,
    false
  ) on conflict (id) do nothing;

  update public.ordenes
  set comision_tecnica_pagada = true,
      comision_tecnica_pagada_at = coalesce(p_fecha, current_date),
      comision_tecnica_gasto_id = v_gasto_id
  where id = v_orden.id;

  return jsonb_build_object(
    'orden_id', v_orden.id,
    'gasto_id', v_gasto_id,
    'monto', round(v_orden.comision_tecnica_monto)
  );
end;
$$;

revoke all on function public.pagar_comision_tecnica(text, date, text) from public, anon;
grant execute on function public.pagar_comision_tecnica(text, date, text) to authenticated;
