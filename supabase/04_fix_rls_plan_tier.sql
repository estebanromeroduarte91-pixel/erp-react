-- Fase 3: RLS condicionado al plan sobre `ocs` (Compras) y `gastos`.
-- Mismo criterio que usePuedeUsarModulo() en el frontend: bypass total para
-- platform admin (ya existe como policy aparte, no se toca), acceso completo
-- durante el trial, y para plan pagado solo si el tier es pro/scale.
--
-- Usa las funciones security definer de 03_fix_recursion_cruzada.sql
-- (mi_empresa_id) — correrlo antes si no lo hiciste.

create or replace function public.auth_plan_tier()
returns text
language sql security definer stable set search_path = public
as $$
  select coalesce(
    (select datos ->> 'tier' from public.erp_data
     where empresa_id = public.mi_empresa_id() and clave = 'plan_limits' limit 1),
    'starter'
  )
$$;

create or replace function public.auth_plan_ok()
returns boolean
language sql security definer stable set search_path = public
as $$
  select
    exists (
      select 1 from public.empresas e
      where e.id = public.mi_empresa_id()
        and e.plan_estado = 'trial'
        and (e.trial_termina is null or e.trial_termina > now())
    )
    or public.auth_plan_tier() in ('pro', 'scale')
$$;

drop policy if exists "empresa aisla ocs" on public.ocs;
create policy "empresa aisla ocs"
on public.ocs
for all
using (empresa_id = public.mi_empresa_id() and public.auth_plan_ok())
with check (empresa_id = public.mi_empresa_id() and public.auth_plan_ok());

drop policy if exists "empresa aisla gastos" on public.gastos;
create policy "empresa aisla gastos"
on public.gastos
for all
using (empresa_id = public.mi_empresa_id() and public.auth_plan_ok())
with check (empresa_id = public.mi_empresa_id() and public.auth_plan_ok());

-- Verificación
select tablename, policyname, qual, with_check
from pg_policies
where tablename in ('ocs','gastos')
order by tablename, policyname;
