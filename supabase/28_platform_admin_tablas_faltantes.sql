-- Bug encontrado al revisar el punto #6 (no estaba en el audit): la
-- impersonación desde el Panel Pixit ("entrar" a la empresa de un cliente
-- para darle soporte) está incompleta.
--
-- El Panel cambia el empresaId del contexto en el cliente, pero la RLS del
-- servidor sigue resolviendo `mi_empresa_id()` = la empresa del propio
-- admin, no la impersonada. Las tablas que tienen policy de platform admin
-- ("Platform Admins VIP Access", con is_platform_admin()) funcionan igual
-- —ventas, ordenes, productos, clientes, ocs, lotes, venta_items, gastos—
-- pero estas 5 dependían SOLO de `empresa_id = mi_empresa_id()`:
--
--   cotizaciones, email_log, folios_counters, movimientos_inventario,
--   orden_qr_tokens
--
-- Efecto real: al impersonar, Movimientos de inventario y Cotizaciones se
-- veían vacíos, mientras el resto de la app cargaba normal — parecía un
-- problema de datos del cliente y en realidad era de permisos.
--
-- (`leads` NO está en la lista: ya tenía sus propias policies de platform
-- admin, escritas con una subconsulta inline a platform_admins en vez de la
-- función is_platform_admin().)
--
-- No amplía la superficie de datos a la que un platform admin puede llegar:
-- ya podía leer ventas, órdenes y clientes de cualquier empresa. Esto solo
-- deja consistentes las 5 tablas que habían quedado fuera.

create policy "Platform Admins VIP Access" on public.cotizaciones
for all to public
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "Platform Admins VIP Access" on public.email_log
for all to public
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "Platform Admins VIP Access" on public.folios_counters
for all to public
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "Platform Admins VIP Access" on public.movimientos_inventario
for all to public
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "Platform Admins VIP Access" on public.orden_qr_tokens
for all to public
using (public.is_platform_admin())
with check (public.is_platform_admin());
