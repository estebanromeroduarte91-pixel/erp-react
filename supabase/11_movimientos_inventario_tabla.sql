-- Fase 3, punto 2: mov_inventario pasa de ser un array JSON completo en
-- erp_data (que se reemplazaba entero en cada guardado, perdiendo el
-- movimiento de otra venta/recepción si dos ocurrían casi al mismo tiempo)
-- a una tabla real, una fila por movimiento.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

create table if not exists public.movimientos_inventario (
  id text primary key,
  empresa_id uuid not null references public.empresas(id),
  fecha text not null,
  hora text,
  tipo text not null,
  productos jsonb not null,
  bodega_origen text,
  bodega_destino text,
  referencia text,
  referencia_id text,
  notas text,
  usuario text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_movimientos_inventario_empresa
  on public.movimientos_inventario(empresa_id, creado_en desc);

alter table public.movimientos_inventario enable row level security;

create policy "empresa aisla movimientos_inventario"
on public.movimientos_inventario
for all
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());

-- Migra los movimientos que vivían en el blob JSON (erp_data, clave
-- 'mov_inventario'). Idempotente (on conflict do nothing).
insert into public.movimientos_inventario
  (id, empresa_id, fecha, hora, tipo, productos, bodega_origen, bodega_destino, referencia, referencia_id, notas, usuario)
select
  elem->>'id',
  ed.empresa_id,
  elem->>'fecha',
  elem->>'hora',
  elem->>'tipo',
  coalesce(elem->'productos', '[]'::jsonb),
  elem->>'bodega_origen',
  elem->>'bodega_destino',
  elem->>'referencia',
  elem->>'referencia_id',
  elem->>'notas',
  elem->>'usuario'
from public.erp_data ed, jsonb_array_elements(ed.datos) elem
where ed.clave = 'mov_inventario'
on conflict (id) do nothing;
