-- Datos de la resolución del SII que autorizó a la empresa como emisor
-- electrónico. Van en la "carátula" del sobre de envío
-- (`POST /api/v1/envio/generar`), no en el documento, por eso no aparecieron
-- hasta que se miró el segundo paso del flujo.
--
-- En certificación el número es 0 y la fecha es la de la certificación. En
-- producción son el número y la fecha de la resolución real de cada
-- contribuyente, así que son por empresa y no se pueden fijar en el código.

alter table public.empresas
  add column if not exists numero_resolucion int not null default 0,
  add column if not exists fecha_resolucion date;

-- Se protegen igual que el resto de los datos tributarios: una resolución
-- equivocada hace que el SII rechace el envío completo, no un documento suelto.
create or replace function public.fn_proteger_datos_tributarios()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE'
     and (NEW.rut               is distinct from OLD.rut
       or NEW.razon_social      is distinct from OLD.razon_social
       or NEW.giro              is distinct from OLD.giro
       or NEW.acteco            is distinct from OLD.acteco
       or NEW.dte_ambiente      is distinct from OLD.dte_ambiente
       or NEW.numero_resolucion is distinct from OLD.numero_resolucion
       or NEW.fecha_resolucion  is distinct from OLD.fecha_resolucion)
     and not public.is_platform_admin()
     and public.mi_rol() is distinct from 'admin'
  then
    raise exception 'Solo un administrador puede cambiar los datos tributarios de la empresa';
  end if;
  return NEW;
end; $$;
