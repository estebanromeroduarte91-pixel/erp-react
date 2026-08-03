-- Punto #11 del audit: observabilidad. Hasta ahora, si a un cliente le
-- reventaba una pantalla ("Algo salió mal" del ErrorBoundary), el error moría
-- en su consola del navegador y nadie se enteraba nunca. No había servicio de
-- telemetría, ni manejadores globales, ni registro de ningún tipo.
--
-- Esta tabla junta los errores de runtime del navegador para poder verlos
-- después desde el Panel Pixit. Se eligió una tabla propia en vez de un
-- servicio externo (Sentry) para no mandarle a un tercero mensajes de error
-- que pueden traer datos de los clientes, y para no sumar costo ni bundle.
--
-- Limitación conocida y aceptada: el build de producción no emite source maps,
-- así que el `stack` viene minificado. El mensaje + la ruta + el componente
-- suelen alcanzar para ubicar el problema; si algún día no alcanza, la salida
-- es activar source maps o mover esto a Sentry.

create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  user_id uuid,
  mensaje text not null,
  stack text,
  componente text,          -- component stack de React (de dónde salió en el árbol)
  ruta text,                -- ruta del hash router donde ocurrió
  user_agent text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_error_log_creado_en on public.error_log (creado_en desc);
create index if not exists idx_error_log_empresa on public.error_log (empresa_id, creado_en desc);

alter table public.error_log enable row level security;

-- Escritura: cualquier usuario autenticado puede registrar SU propio error.
-- No se permite a `anon` a propósito: sería un buzón abierto a internet para
-- llenar la tabla. El costo es que los errores de la landing (sin sesión) no
-- quedan registrados — es un intercambio consciente.
create policy "usuario registra su propio error"
on public.error_log
for insert
to authenticated
with check (user_id = auth.uid());

-- Lectura: solo el dueño de Pixit (Panel). Un taller no necesita ver esto, y
-- los mensajes de una empresa no deben ser visibles para otra.
create policy "platform admin lee errores"
on public.error_log
for select
to authenticated
using (public.is_platform_admin());

-- Freno server-side: si algo entra en loop y dispara errores sin parar, el
-- cliente ya se autolimita, pero no hay que confiar en el cliente. Pasadas
-- 100 filas por empresa en la última hora, las siguientes se descartan en
-- silencio (RETURN NULL) en vez de fallar: registrar un error nunca debe
-- romper la pantalla que lo estaba reportando.
create or replace function public.fn_limitar_error_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_recientes integer;
begin
  select count(*) into v_recientes
  from public.error_log
  where empresa_id is not distinct from NEW.empresa_id
    and creado_en > now() - interval '1 hour';

  if v_recientes >= 100 then
    return null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_limitar_error_log on public.error_log;

create trigger trg_limitar_error_log
before insert on public.error_log
for each row
execute function public.fn_limitar_error_log();
