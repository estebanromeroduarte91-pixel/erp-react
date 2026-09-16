-- Complemento Delivery: habilitacion por empresa y bandeja de solicitudes.
-- El formulario publico escribe exclusivamente mediante la Edge Function
-- delivery-solicitud; anon no recibe permisos directos sobre estas tablas.

create table if not exists public.empresa_modulos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  modulo text not null,
  activo boolean not null default false,
  configuracion jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, modulo),
  constraint empresa_modulos_modulo_check check (modulo in ('delivery'))
);

alter table public.empresa_modulos enable row level security;

drop policy if exists "empresa lee sus modulos" on public.empresa_modulos;
create policy "empresa lee sus modulos" on public.empresa_modulos
for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "pixit administra modulos" on public.empresa_modulos;
create policy "pixit administra modulos" on public.empresa_modulos
for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create table if not exists public.delivery_formularios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  slug text not null unique,
  activo boolean not null default true,
  origenes_permitidos text[] not null default '{}'::text[],
  configuracion jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint delivery_formularios_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$')
);

alter table public.delivery_formularios enable row level security;
revoke all on public.delivery_formularios from anon;

drop policy if exists "empresa lee su formulario delivery" on public.delivery_formularios;
create policy "empresa lee su formulario delivery" on public.delivery_formularios
for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "pixit administra formularios delivery" on public.delivery_formularios;
create policy "pixit administra formularios delivery" on public.delivery_formularios
for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create sequence if not exists public.delivery_solicitud_numero_seq;

create table if not exists public.delivery_solicitudes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero bigint not null default nextval('public.delivery_solicitud_numero_seq'),
  estado text not null default 'nueva',
  nombre text not null,
  apellido text not null,
  rut text not null,
  telefono text not null,
  email text,
  direccion text not null,
  comuna text not null,
  region text,
  referencia_direccion text,
  tipo_equipo text not null,
  marca text,
  modelo text,
  falla text not null,
  fecha_preferida date,
  bloque_horario text,
  observaciones text,
  notas_internas text,
  origen text not null default 'web',
  ip_hash text,
  acepto_privacidad boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint delivery_solicitudes_estado_check check (
    estado in ('nueva','contactada','agendada','en_retiro','recibida','cancelada')
  ),
  constraint delivery_solicitudes_privacidad_check check (acepto_privacidad)
);

create unique index if not exists delivery_solicitudes_numero_idx
  on public.delivery_solicitudes(numero);
create index if not exists delivery_solicitudes_empresa_fecha_idx
  on public.delivery_solicitudes(empresa_id, creado_en desc);
create index if not exists delivery_solicitudes_empresa_estado_idx
  on public.delivery_solicitudes(empresa_id, estado);
create index if not exists delivery_solicitudes_ip_fecha_idx
  on public.delivery_solicitudes(empresa_id, ip_hash, creado_en desc)
  where ip_hash is not null;

alter table public.delivery_solicitudes enable row level security;
revoke all on public.delivery_solicitudes from anon;

drop policy if exists "empresa lee solicitudes delivery" on public.delivery_solicitudes;
create policy "empresa lee solicitudes delivery" on public.delivery_solicitudes
for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "empresa actualiza solicitudes delivery" on public.delivery_solicitudes;
create policy "empresa actualiza solicitudes delivery" on public.delivery_solicitudes
for update to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin())
with check (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

-- Nadie desde el navegador autenticado inserta solicitudes: solo la funcion
-- publica, usando service_role. Esto evita que se suplante otra empresa.
grant select, update on public.delivery_solicitudes to authenticated;
grant select on public.empresa_modulos, public.delivery_formularios to authenticated;
grant insert, update, delete on public.empresa_modulos, public.delivery_formularios to authenticated;

-- Steve Docs parte con el complemento habilitado; las demas empresas no ven
-- el modulo hasta que Pixit lo active expresamente desde el panel.
insert into public.empresa_modulos (empresa_id, modulo, activo)
values ('f347f086-d2ba-40b0-ab70-95a7c02c8781', 'delivery', true)
on conflict (empresa_id, modulo) do update set activo = excluded.activo, actualizado_en = now();

insert into public.delivery_formularios
  (empresa_id, slug, activo, origenes_permitidos, configuracion)
values
  ('f347f086-d2ba-40b0-ab70-95a7c02c8781', 'steve-docs', true,
   array['https://stevedocs.cl','https://www.stevedocs.cl'],
   jsonb_build_object('nombre', 'Steve Docs Delivery'))
on conflict (empresa_id) do update set
  activo = true,
  origenes_permitidos = excluded.origenes_permitidos,
  configuracion = excluded.configuracion,
  actualizado_en = now();

