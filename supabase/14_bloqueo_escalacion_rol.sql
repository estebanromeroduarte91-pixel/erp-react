-- Fase 4, punto 1: nadie puede cambiar el `role` de un user_profile salvo un
-- admin real. Antes cualquier usuario autenticado (encargado, vendedor)
-- podía hacer un PATCH directo a su propia fila en user_profiles y ponerse
-- role='admin' — la app nunca lo permitía desde la UI, pero la API REST sí,
-- porque la policy de RLS no validaba quién estaba haciendo el cambio.
--
-- Verificado: un usuario 'encargado' que intenta poner su propio role en
-- 'admin' recibe el error de este trigger y el cambio no se aplica; un admin
-- real sigue pudiendo cambiar el rol de cualquier usuario de su empresa.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

create or replace function public.fn_bloquear_escalacion_rol()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_soy_admin boolean;
begin
  if NEW.role is distinct from OLD.role then
    select (up.role = 'admin') into v_soy_admin
    from public.user_profiles up
    where up.id = auth.uid();

    if not coalesce(v_soy_admin, false) then
      raise exception 'Solo un administrador puede cambiar el rol de un usuario';
    end if;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_bloquear_escalacion_rol on public.user_profiles;

create trigger trg_bloquear_escalacion_rol
before update on public.user_profiles
for each row
execute function public.fn_bloquear_escalacion_rol();
