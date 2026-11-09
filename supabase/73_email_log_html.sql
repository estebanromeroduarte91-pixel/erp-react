-- Contenido de cada correo enviado, para poder reenviarlo.
--
-- El historial guardaba destinatario, asunto y si el servidor lo aceptó, pero
-- no el correo en sí: cuando un cliente decía "no me llegó" no había nada que
-- volver a mandar. Con el HTML guardado, Configuración → Correo muestra un
-- botón Reenviar que envía exactamente el mismo correo a la misma persona.
-- Los correos anteriores a este cambio quedan sin contenido y sin botón.

alter table public.email_log add column if not exists html text;

-- La lista del historial se refresca cada 15 segundos: con esta marca sabe a
-- qué correos ponerles el botón sin descargar el HTML de los 20.
alter table public.email_log
  add column if not exists tiene_html boolean generated always as (html is not null) stored;
