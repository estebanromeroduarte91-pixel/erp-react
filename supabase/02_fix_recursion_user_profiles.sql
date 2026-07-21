-- Corrige el bug del Bloque 3: la policy anterior hacía una subconsulta a
-- user_profiles DESDE una policy de user_profiles → "infinite recursion
-- detected in policy for relation user_profiles". Rompía CUALQUIER lectura de
-- esa tabla (por eso Panel Pixit también quedó en 0).
--
-- Fix: una función security definer resuelve el empresa_id del usuario sin
-- volver a disparar RLS de user_profiles (patrón estándar de Postgres para
-- este caso).

drop policy if exists "empresa aisla user_profiles" on public.user_profiles;

create or replace function public.mi_empresa_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select empresa_id from public.user_profiles where id = auth.uid()
$$;

create policy "empresa aisla user_profiles"
on public.user_profiles
for all
using (
  empresa_id = public.mi_empresa_id()
  or exists (select 1 from public.empresas e where e.id = user_profiles.empresa_id and e.owner_id = auth.uid())
)
with check (
  empresa_id = public.mi_empresa_id()
  or exists (select 1 from public.empresas e where e.id = user_profiles.empresa_id and e.owner_id = auth.uid())
  or exists (
    select 1 from public.pending_invites pi
    where pi.empresa_id = user_profiles.empresa_id
      and pi.email = (auth.jwt() ->> 'email')
      and pi.used = false
  )
);

-- Verificación: después de correr esto, recarga Panel Pixit — debería volver
-- a mostrar las empresas reales, no "0" / "Sin resultados".
