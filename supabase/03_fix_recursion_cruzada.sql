-- URGENTE: corrige recursión cruzada entre user_profiles, empresas y
-- pending_invites. Cada tabla quedó consultando a la otra dentro de su propia
-- policy → "infinite recursion detected". Esto afecta el login de CUALQUIER
-- usuario (AuthContext consulta `empresas` al iniciar sesión), no solo el
-- Panel Pixit.
--
-- Fix: 3 funciones security definer — cada una bypasea el RLS de la tabla que
-- consulta hacia adentro, así ninguna policy vuelve a disparar la de otra tabla.

create or replace function public.mi_empresa_id()
returns uuid language sql security definer stable set search_path = public
as $$ select empresa_id from public.user_profiles where id = auth.uid() $$;

create or replace function public.soy_dueno_de(target_empresa uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select exists(select 1 from public.empresas where id = target_empresa and owner_id = auth.uid()) $$;

create or replace function public.tengo_invitacion_para(target_empresa uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select exists(
  select 1 from public.pending_invites
  where empresa_id = target_empresa and email = (auth.jwt() ->> 'email') and used = false
) $$;

-- user_profiles: usa solo las funciones, nunca una subconsulta cruda a otra tabla
drop policy if exists "empresa aisla user_profiles" on public.user_profiles;
create policy "empresa aisla user_profiles"
on public.user_profiles
for all
using (empresa_id = public.mi_empresa_id() or public.soy_dueno_de(empresa_id))
with check (
  empresa_id = public.mi_empresa_id()
  or public.soy_dueno_de(empresa_id)
  or public.tengo_invitacion_para(empresa_id)
);

-- pending_invites: mismo criterio, vía función
drop policy if exists "empresa aisla pending_invites" on public.pending_invites;
create policy "empresa aisla pending_invites"
on public.pending_invites
for all
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());

-- empresas.staff_read: esta policy YA EXISTÍA (no la tocamos antes) y es la que
-- cierra el ciclo — hacía una subconsulta cruda a user_profiles. Se reescribe
-- igual que las demás, mismo rol/comando que tenía originalmente.
drop policy if exists "staff_read" on public.empresas;
create policy "staff_read"
on public.empresas
for select
to authenticated
using (id = public.mi_empresa_id());

-- Verificación
select schemaname, tablename, policyname, qual, with_check
from pg_policies
where tablename in ('user_profiles','empresas','pending_invites')
order by tablename, policyname;
