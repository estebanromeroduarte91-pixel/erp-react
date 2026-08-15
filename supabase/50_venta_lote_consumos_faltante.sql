-- La migración 49 usa esta tabla para registrar el consumo FIFO de cada
-- venta, pero producción no tenía aplicada la parte estructural de la
-- migración 31. Sin la tabla, fn_confirmar_venta abortaba toda la transacción
-- con 42P01 al vender un producto respaldado por lotes.
--
-- Se crea únicamente la estructura faltante. No se recrean las funciones de
-- la migración 31 porque eso reemplazaría las firmas nuevas de la migración 49.

create table if not exists public.venta_lote_consumos (
  venta_id text not null,
  lote_id text not null,
  empresa_id uuid not null,
  cantidad numeric not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  primary key (venta_id, lote_id)
);

create index if not exists venta_lote_consumos_empresa_venta_idx
  on public.venta_lote_consumos (empresa_id, venta_id);

alter table public.venta_lote_consumos enable row level security;

-- La tabla solo se modifica desde RPC security definer. No se expone para
-- lecturas o escrituras directas desde el navegador.
revoke all on public.venta_lote_consumos from public, anon, authenticated;
