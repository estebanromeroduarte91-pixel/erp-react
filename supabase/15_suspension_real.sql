-- Fase 4, punto 2: hoy "empresa suspendida" solo era un flag cosmético que la
-- UI leía para mostrar una pantalla de bloqueo — pero la API REST/RPC seguía
-- aceptando cualquier operación igual, así que una empresa suspendida podía
-- seguir vendiendo/operando llamando a la API directo. Este cambio lo hace
-- real a nivel de base de datos.
--
-- Requiere mi_empresa_id(), is_platform_admin() y la tabla empresas ya
-- existentes.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

-- 1) Nadie excepto un platform admin puede cambiar plan_estado (si no, un
-- dueño con la cuenta suspendida podría reactivarla él mismo con un PATCH
-- directo a su propia fila de `empresas`).
create or replace function public.fn_bloquear_cambio_plan_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.plan_estado is distinct from OLD.plan_estado then
    if not coalesce(public.is_platform_admin(), false) then
      raise exception 'Solo un administrador de la plataforma puede cambiar el estado del plan';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_bloquear_cambio_plan_estado on public.empresas;

create trigger trg_bloquear_cambio_plan_estado
before update on public.empresas
for each row
execute function public.fn_bloquear_cambio_plan_estado();

-- 2) mi_empresa_id() devuelve NULL si la empresa está suspendida. Como casi
-- todas las policies de la app (erp_data, ventas, órdenes, OCs, movimientos,
-- lotes, folios, invitaciones) usan `empresa_id = mi_empresa_id()`, este
-- único cambio corta el acceso operativo en cadena para toda esa superficie.
create or replace function public.mi_empresa_id()
returns uuid language sql security definer stable set search_path = public
as $$
  select up.empresa_id
  from public.user_profiles up
  join public.empresas e on e.id = up.empresa_id
  where up.id = auth.uid()
    and e.plan_estado is distinct from 'suspendida'
$$;

-- 3) Bypasea RLS de user_profiles (igual que mi_empresa_id) pero SIN filtrar
-- por suspensión — necesaria para que un usuario suspendido pueda seguir
-- leyendo el estado de su propia empresa (si no, quedaría en un limbo
-- silencioso: ni puede operar, ni puede enterarse de por qué).
create or replace function public.mi_empresa_id_sin_filtro()
returns uuid language sql security definer stable set search_path = public
as $$ select empresa_id from public.user_profiles where id = auth.uid() $$;

-- 4) Lectura de la propia empresa NO depende de mi_empresa_id() (ver punto 3).
drop policy if exists "staff_read" on public.empresas;

create policy "staff_read"
on public.empresas
for select
to authenticated
using (id = public.mi_empresa_id_sin_filtro());

-- 5) Cierra el bypass del dueño en erp_data — antes ignoraba la suspensión
-- por completo (subconsulta directa a owner_id, sin pasar por mi_empresa_id()).
drop policy if exists "datos_propios" on public.erp_data;

create policy "datos_propios"
on public.erp_data
for all
using (
  empresa_id in (
    select e.id from public.empresas e
    where e.owner_id = auth.uid() and e.plan_estado is distinct from 'suspendida'
  )
);
