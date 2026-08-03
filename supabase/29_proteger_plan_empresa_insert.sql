-- Encontrado al revisar el punto #7 (no estaba en el audit): el trial se podía
-- extender solo, o directamente saltear. Verificado contra la base real:
--
--   * `authenticated` tiene grant de UPDATE sobre las columnas `plan_estado`
--     y `trial_termina`, y las policies `owner_all` / `propietario_empresa`
--     le dan al dueño UPDATE sobre su propia fila de `empresas`. La RLS no
--     restringe columnas, así que un PATCH directo a `trial_termina` con una
--     fecha lejana = trial infinito. Y durante el trial la app entrega el
--     100% de los módulos (usePuedeUsarModulo).
--
--   * El trigger de la Fase 4 (fn_bloquear_cambio_plan_estado) era `before
--     update` y solo miraba `plan_estado` — no cubría `trial_termina`, ni el
--     INSERT.
--
--   * En el registro, el cliente mandaba `plan_estado` y `trial_termina` en
--     el INSERT (AuthContext.tsx). Alguien podía registrarse con
--     `plan_estado = 'activo'`, que en la app significa sin vencimiento —
--     acceso completo permanente, encima con tier `scale` sembrado por
--     trg_seed_plan_limits (ver 26_plan_limits_solo_pixit.sql).
--
-- Este trigger reemplaza al anterior y cubre las dos operaciones:
--   INSERT → el servidor IMPONE plan_estado='trial' y trial_termina=+30 días
--            (se ignora lo que mande el cliente, en vez de rechazar el
--            registro: así el fix es seguro aunque el navegador siga
--            corriendo la versión vieja del bundle).
--   UPDATE → nadie fuera de platform_admins puede tocar plan_estado NI
--            trial_termina.
--
-- Un platform admin conserva el control total sobre ambas columnas (es quien
-- activa un plan pagado o extiende una prueba desde el Panel Pixit).
--
-- Nota: no se revocan los grants de columna porque platform admins usan el
-- mismo rol `authenticated` — revocarlos rompería también el Panel. El
-- control correcto acá es el trigger, no el grant.

create or replace function public.fn_proteger_plan_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if not coalesce(public.is_platform_admin(), false) then
      NEW.plan_estado := 'trial';
      NEW.trial_termina := now() + interval '30 days';
    end if;
    return NEW;
  end if;

  if not coalesce(public.is_platform_admin(), false) then
    if NEW.plan_estado is distinct from OLD.plan_estado then
      raise exception 'Solo un administrador de la plataforma puede cambiar el estado del plan';
    end if;
    if NEW.trial_termina is distinct from OLD.trial_termina then
      raise exception 'Solo un administrador de la plataforma puede cambiar la fecha de término de la prueba';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_bloquear_cambio_plan_estado on public.empresas;
drop trigger if exists trg_proteger_plan_empresa on public.empresas;

create trigger trg_proteger_plan_empresa
before insert or update on public.empresas
for each row
execute function public.fn_proteger_plan_empresa();
