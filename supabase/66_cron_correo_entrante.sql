-- Revisa las casillas conectadas cada 2 minutos (correo-entrante-sync).
--
-- Mismo esquema que woo-push: el trabajo manda la anon key en Authorization
-- solo para pasar el control de JWT de Supabase, y la credencial real es
-- `x-cron-token`, que debe ser IGUAL al secreto CORREO_CRON_TOKEN de la
-- función. Reemplaza PEGA_AQUI_EL_TOKEN antes de ejecutar; no lo compartas.

select cron.unschedule('correo-entrante-cada-2-min')
where exists (select 1 from cron.job where jobname = 'correo-entrante-cada-2-min');

select cron.schedule(
  'correo-entrante-cada-2-min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://nfcdqdbhrsjhbnbtqewl.supabase.co/functions/v1/correo-entrante-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY2RxZGJocnNqaGJuYnRxZXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjU0NDksImV4cCI6MjA5NTQwMTQ0OX0.crMaV1oIodW1fTa2oTmYr2rk8hVLJbQPqUFHe6oFAV8',
      'x-cron-token', 'PEGA_AQUI_EL_TOKEN'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
