-- Punto #6 del audit: desactivar a un usuario en Accesos (user_profiles.activo
-- = false) no le quitaba el acceso real. Verificado leyendo el código:
--
--   * Su cuenta de auth sigue existiendo → puede iniciar sesión igual.
--   * AuthContext leía `activo` pero nunca lo usaba para bloquear.
--   * mi_empresa_id() (la función de la que cuelgan casi todas las policies:
--     ventas, ordenes, ocs, movimientos, lotes, folios, invitaciones) solo
--     filtraba por empresa suspendida, NO por usuario activo.
--
-- Resultado: un empleado desvinculado seguía leyendo y escribiendo toda la
-- operación de la empresa por la API REST. Lo único que sí lo frenaba era
-- `erp_data` (sus policies ya exigían activo = true), así que la UI se veía
-- rota a medias — lo que disimulaba el problema en vez de cerrarlo.
--
-- Mismo enfoque que la suspensión de empresa (15_suspension_real.sql): un
-- solo cambio en mi_empresa_id() corta el acceso en cadena para toda esa
-- superficie, sin tener que reescribir policy por policy.
--
-- `activo` puede ser NULL en perfiles antiguos (anteriores a la columna), así
-- que se usa `is distinct from false` y no `= true`: NULL cuenta como activo
-- y no se le corta el acceso a nadie por un dato que nunca se llenó.

create or replace function public.mi_empresa_id()
returns uuid language sql security definer stable set search_path = public
as $$
  select up.empresa_id
  from public.user_profiles up
  join public.empresas e on e.id = up.empresa_id
  where up.id = auth.uid()
    and e.plan_estado is distinct from 'suspendida'
    and up.activo is distinct from false
$$;

-- mi_empresa_id_sin_filtro() NO cambia a propósito: es la que permite que un
-- usuario bloqueado (por suspensión o por desactivación) siga leyendo el
-- nombre de su empresa, para poder mostrarle una pantalla que explique por
-- qué no puede entrar en vez de dejarlo en un limbo silencioso.
