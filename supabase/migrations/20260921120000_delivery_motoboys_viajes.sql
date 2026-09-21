-- Primera etapa de logística Delivery: motoboys y viajes por solicitud.
-- Los kilómetros son ingresados manualmente hasta integrar un proveedor de rutas.
create table if not exists public.delivery_motoboys (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text not null default '',
  tarifa_km numeric(12,2) not null check (tarifa_km >= 0),
  minimo_viaje numeric(12,2) not null default 0 check (minimo_viaje >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index if not exists delivery_motoboys_empresa_id_idx on public.delivery_motoboys(empresa_id, id);
create index if not exists delivery_motoboys_empresa_activo_idx on public.delivery_motoboys(empresa_id, activo);
create unique index if not exists delivery_solicitudes_empresa_id_idx on public.delivery_solicitudes(empresa_id, id);

create table if not exists public.delivery_viajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  solicitud_id uuid not null,
  tipo text not null check (tipo in ('retiro', 'entrega')),
  motoboy_id uuid,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'asignado', 'en_ruta', 'completado', 'cancelado')),
  sucursal_id text not null,
  sucursal_nombre text not null,
  sucursal_direccion text not null,
  cliente_direccion text not null,
  fecha date,
  bloque text,
  distancia_km numeric(10,2) check (distancia_km is null or distancia_km >= 0),
  distancia_fuente text not null default 'manual' check (distancia_fuente in ('manual', 'rutas')),
  tarifa_km numeric(12,2) check (tarifa_km is null or tarifa_km >= 0),
  minimo_viaje numeric(12,2) check (minimo_viaje is null or minimo_viaje >= 0),
  monto numeric(12,0) generated always as (
    case when distancia_km is null or tarifa_km is null then null
      else greatest(round(distancia_km * tarifa_km), round(coalesce(minimo_viaje, 0))) end
  ) stored,
  nota text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (solicitud_id, tipo),
  foreign key (empresa_id, solicitud_id) references public.delivery_solicitudes(empresa_id, id) on delete cascade,
  foreign key (empresa_id, motoboy_id) references public.delivery_motoboys(empresa_id, id)
);
create index if not exists delivery_viajes_empresa_fecha_idx on public.delivery_viajes(empresa_id, fecha, estado);
create index if not exists delivery_viajes_motoboy_idx on public.delivery_viajes(empresa_id, motoboy_id, estado);

create or replace function public.fn_delivery_viaje_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.actualizado_en := now();
  if tg_op = 'UPDATE' and (new.empresa_id, new.solicitud_id, new.tipo)
      is distinct from (old.empresa_id, old.solicitud_id, old.tipo) then
    raise exception 'No se puede cambiar empresa, solicitud ni tipo de viaje';
  end if;
  if new.estado in ('asignado', 'en_ruta', 'completado')
     and (new.motoboy_id is null or new.distancia_km is null or new.tarifa_km is null) then
    raise exception 'Asigna motoboy, kilómetros y tarifa antes de avanzar';
  end if;
  return new;
end $$;
drop trigger if exists trg_delivery_viaje_validar on public.delivery_viajes;
create trigger trg_delivery_viaje_validar before insert or update on public.delivery_viajes
for each row execute function public.fn_delivery_viaje_validar();

alter table public.delivery_motoboys enable row level security;
alter table public.delivery_viajes enable row level security;
revoke all on public.delivery_motoboys, public.delivery_viajes from anon;
grant select, insert, update on public.delivery_motoboys, public.delivery_viajes to authenticated;

drop policy if exists "delivery motoboys lectura empresa" on public.delivery_motoboys;
create policy "delivery motoboys lectura empresa" on public.delivery_motoboys
for select to authenticated using (empresa_id = public.mi_empresa_id() and public.mi_rol() in ('admin','encargado') or public.is_platform_admin());
drop policy if exists "delivery motoboys gestion" on public.delivery_motoboys;
create policy "delivery motoboys gestion" on public.delivery_motoboys
for all to authenticated
using (empresa_id = public.mi_empresa_id() and public.mi_rol() in ('admin','encargado') or public.is_platform_admin())
with check (empresa_id = public.mi_empresa_id() and public.mi_rol() in ('admin','encargado') or public.is_platform_admin());

drop policy if exists "delivery viajes lectura empresa" on public.delivery_viajes;
create policy "delivery viajes lectura empresa" on public.delivery_viajes
for select to authenticated using (empresa_id = public.mi_empresa_id() and public.mi_rol() in ('admin','encargado') or public.is_platform_admin());
drop policy if exists "delivery viajes gestion" on public.delivery_viajes;
create policy "delivery viajes gestion" on public.delivery_viajes
for all to authenticated
using (empresa_id = public.mi_empresa_id() and public.mi_rol() in ('admin','encargado') or public.is_platform_admin())
with check (empresa_id = public.mi_empresa_id() and public.mi_rol() in ('admin','encargado') or public.is_platform_admin());
