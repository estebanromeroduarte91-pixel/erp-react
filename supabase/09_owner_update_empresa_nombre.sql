-- Permite que el dueño de una empresa actualice el NOMBRE de su propia empresa
-- (autoservicio en Configuración → Dominio). Antes no existía ninguna policy de
-- UPDATE en `empresas` para el dueño — solo lectura (staff_read) y la actualización
-- desde el Panel Pixit (platform_admin). Sin esto, el nombre quedaba fijo desde el
-- registro y solo un platform_admin podía cambiarlo a mano.
--
-- Requiere que ya hayas corrido 03_fix_recursion_cruzada.sql (usa soy_dueno_de()).

drop policy if exists "owner actualiza su empresa" on public.empresas;
create policy "owner actualiza su empresa"
on public.empresas
for update
to authenticated
using (public.soy_dueno_de(id))
with check (public.soy_dueno_de(id));

-- Verificación: debe aparecer la nueva policy junto a "staff_read"
select policyname, roles, cmd from pg_policies where tablename = 'empresas';
