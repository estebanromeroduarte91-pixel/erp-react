-- Fase 1: cierra los huecos de aislamiento real encontrados en el diagnóstico.
-- Correr en Supabase Dashboard → SQL Editor. Revisar cada bloque antes de ejecutar
-- (recomendado: correr sección por sección, no todo de una vez, verificando la app
-- después de cada una).
--
-- NO TOCA (a propósito, quedan documentados como pendiente aparte):
--   - `ordenes`: políticas "qr anon lee/actualiza su orden" (USING true) — flujo de
--     fotos por QR sin login. Necesitan acotarse por token, no por empresa_id.
--   - `aprobaciones`: mismo patrón, flujo de aprobación de presupuesto por link
--     público con token. Mismo motivo, no se toca hoy.
--   - `pending_invites.anon_read` (USING true) — necesario para que alguien sin
--     cuenta pueda leer su propia invitación por token antes de registrarse; acotar
--     esto requeriría pasar el token de otra forma. Queda como riesgo residual menor
--     (solo expone metadata de invitaciones, no datos operativos).


-- ═══════════════════════════════════════════════════════════════
-- 1) erp_data: elimina el acceso público sin login (el hallazgo más grave)
-- ═══════════════════════════════════════════════════════════════
-- Hoy cualquiera en internet, sin iniciar sesión, puede leer/insertar/modificar
-- el blob completo (cargos, plan_limits, bodegas, movimientos, config SMTP...)
-- de CUALQUIER empresa. Las políticas erp_data_select/insert/update (autenticado,
-- ya acotadas por empresa) y datos_propios (dueño) quedan intactas — son las que
-- de verdad deben regir.
drop policy if exists "allow-anon-read-erp-data" on public.erp_data;
drop policy if exists "erp-data-insert-anon" on public.erp_data;
drop policy if exists "erp-data-upsert-anon" on public.erp_data;


-- ═══════════════════════════════════════════════════════════════
-- 2) movimientos_stock: tabla confirmada sin uso (ni en erp-react ni en el ERP
--    vanilla) — se cierra en vez de escribirle una policy real. Con RLS activo y
--    sin ninguna policy permisiva (aparte del bypass de platform admin), queda
--    denegada por defecto para todos los demás.
-- ═══════════════════════════════════════════════════════════════
drop policy if exists "acceso_total_temporal_mov" on public.movimientos_stock;


-- ═══════════════════════════════════════════════════════════════
-- 3) user_profiles: hoy cualquier usuario autenticado (de cualquier empresa)
--    puede leer/modificar/desactivar usuarios de OTRAS empresas.
-- ═══════════════════════════════════════════════════════════════
drop policy if exists "auth_all" on public.user_profiles;

create policy "empresa aisla user_profiles"
on public.user_profiles
for all
using (
  -- ya soy staff de esa empresa (admin gestionando a un colega, o yo mismo)
  empresa_id in (select up.empresa_id from public.user_profiles up where up.id = auth.uid())
  -- o soy el dueño de esa empresa (caso bootstrap: mi propia fila aún no existe)
  or exists (select 1 from public.empresas e where e.id = user_profiles.empresa_id and e.owner_id = auth.uid())
)
with check (
  empresa_id in (select up.empresa_id from public.user_profiles up where up.id = auth.uid())
  or exists (select 1 from public.empresas e where e.id = user_profiles.empresa_id and e.owner_id = auth.uid())
  -- o me acabo de registrar por una invitación pendiente y válida a esa empresa
  -- (flujo onInvitado en Login.tsx: signUp → insert user_profiles, todavía sin
  -- fila propia ni ser dueño — sin esta condición, el registro de staff invitado
  -- quedaría bloqueado).
  or exists (
    select 1 from public.pending_invites pi
    where pi.empresa_id = user_profiles.empresa_id
      and pi.email = (auth.jwt() ->> 'email')
      and pi.used = false
  )
);


-- ═══════════════════════════════════════════════════════════════
-- 4) pending_invites: mismo problema que user_profiles para el CRUD normal
--    (crear/cancelar invitaciones). anon_read se deja igual a propósito (ver nota
--    arriba) — solo se cierra el acceso de "cualquier autenticado a cualquier
--    empresa".
-- ═══════════════════════════════════════════════════════════════
drop policy if exists "auth_all" on public.pending_invites;

create policy "empresa aisla pending_invites"
on public.pending_invites
for all
using (empresa_id in (select up.empresa_id from public.user_profiles up where up.id = auth.uid()))
with check (empresa_id in (select up.empresa_id from public.user_profiles up where up.id = auth.uid()));


-- ═══════════════════════════════════════════════════════════════
-- Verificación: volver a correr esto y comparar con el resultado de
-- 00_diagnostico_rls.sql — deberían haber desaparecido las filas de
-- allow-anon-read-erp-data, erp-data-insert-anon, erp-data-upsert-anon,
-- acceso_total_temporal_mov, y las dos "auth_all"; y aparecer las 3 policies
-- nuevas "empresa aisla ...".
-- ═══════════════════════════════════════════════════════════════
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
