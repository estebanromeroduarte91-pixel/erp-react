-- Comisión técnica pagada = gasto real, una sola vez por OT.
-- Ejecutar en Supabase SQL Editor después de 58_comision_manual_bruta.sql.

alter table public.ordenes
  add column if not exists tecnico_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists comision_tecnica_pagada boolean not null default false,
  add column if not exists comision_tecnica_pagada_at date,
  add column if not exists comision_tecnica_gasto_id text;

create index if not exists idx_ordenes_comision_tecnico
  on public.ordenes (empresa_id, tecnico_id)
  where comision_tecnica_activa = true;

-- Conserva las asignaciones ya guardadas antes de existir tecnico_id.
update public.ordenes o
set tecnico_id = up.id
from public.user_profiles up
where o.empresa_id = up.empresa_id
  and o.tecnico_id is null
  and nullif(trim(o.tecnico), '') is not null
  and lower(trim(o.tecnico)) = lower(trim(up.nombre));

create or replace function public.pagar_comision_tecnica(
  p_orden_id uuid,
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

grant execute on function public.pagar_comision_tecnica(uuid, date, text) to authenticated;
