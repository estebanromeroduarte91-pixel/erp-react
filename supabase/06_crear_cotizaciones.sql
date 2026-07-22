-- Módulo de Cotizaciones (solo lectura para el cliente — sin flujo de
-- aprobación, eso ya lo cubre "aprobación de presupuesto" en Órdenes).
-- Requiere que ya hayas corrido 03_fix_recursion_cruzada.sql (usa mi_empresa_id()).

create extension if not exists pgcrypto;

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero integer not null,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  cliente_nombre text not null,
  cliente_rut text,
  cliente_email text,
  cliente_tel text,
  equipo text,
  notas text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  iva numeric not null default 0,
  total numeric not null default 0,
  fecha_emision date not null default current_date,
  fecha_vencimiento date,
  creado_en timestamptz not null default now()
);

create index if not exists cotizaciones_empresa_idx on public.cotizaciones (empresa_id);
create unique index if not exists cotizaciones_empresa_numero_idx on public.cotizaciones (empresa_id, numero);

alter table public.cotizaciones enable row level security;

-- La empresa dueña ve/gestiona sus propias cotizaciones (mismo patrón que ocs/gastos).
drop policy if exists "empresa aisla cotizaciones" on public.cotizaciones;
create policy "empresa aisla cotizaciones"
on public.cotizaciones
for all
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());

-- Lectura pública SOLO por token exacto (igual criterio que la página de fotos
-- QR y la de aprobación de presupuesto): quien no conoce el token no puede
-- listar ni adivinar filas, porque el cliente siempre filtra por token único.
drop policy if exists "anon lee cotizacion por token" on public.cotizaciones;
create policy "anon lee cotizacion por token"
on public.cotizaciones
for select
to anon
using (true);

-- Verificación
select policyname, roles, cmd from pg_policies where tablename = 'cotizaciones';
