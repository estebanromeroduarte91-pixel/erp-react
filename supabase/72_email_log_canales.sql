-- email_log aceptaba solo los canales 'smtp' y 'resend'. En agosto 2026
-- send-email pasó a registrar 'smtp-gateway', 'resend-pixit' y 'error', y desde
-- el 13-08-2026 cada registro chocaba con esta regla: los correos salían, pero
-- el historial de Configuración → Correo quedó congelado y el límite de 60
-- correos por hora (que cuenta filas de esta tabla) dejó de funcionar.
-- Se mantienen los nombres antiguos para no invalidar las filas existentes.

alter table public.email_log drop constraint if exists email_log_canal_check;
alter table public.email_log add constraint email_log_canal_check
  check (canal in ('smtp', 'resend', 'smtp-gateway', 'resend-pixit', 'error'));
