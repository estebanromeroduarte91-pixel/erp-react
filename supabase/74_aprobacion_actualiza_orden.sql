-- La respuesta del cliente (aprobar/rechazar presupuesto) actualiza la orden
-- en el momento.
--
-- Antes, responder_aprobacion solo cambiaba la fila de `aprobaciones`. La
-- orden se enteraba recién cuando alguien la tenía abierta en Pixit (la
-- pantalla consultaba cada 30 segundos): si nadie la abría, la orden seguía
-- "Aprobación pendiente" en la lista y en los otros computadores.
--
-- Se hace con un trigger sobre `aprobaciones` y no tocando
-- responder_aprobacion, para que funcione igual sea cual sea la versión de esa
-- función que esté corriendo en producción.

create or replace function public.fn_aprobacion_a_orden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado in ('aprobado', 'rechazado') and new.estado is distinct from old.estado then
    update public.ordenes
       set aprobacion_estado = new.estado,
           aprobacion_fecha  = coalesce(new.aprobado_en, now())
     where aprobacion_token = new.token
       and empresa_id = new.empresa_id
       and aprobacion_estado is distinct from new.estado;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_aprobacion_a_orden on public.aprobaciones;
create trigger trg_aprobacion_a_orden
after update of estado on public.aprobaciones
for each row execute function public.fn_aprobacion_a_orden();

-- Las que el cliente ya respondió y la orden todavía no reflejaba.
update public.ordenes o
   set aprobacion_estado = a.estado,
       aprobacion_fecha  = coalesce(a.aprobado_en, now())
  from public.aprobaciones a
 where a.token = o.aprobacion_token
   and a.empresa_id = o.empresa_id
   and a.estado in ('aprobado', 'rechazado')
   and o.aprobacion_estado = 'pendiente';
