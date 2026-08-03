-- Punto #4 del audit: el tier del plan (clave `plan_limits` en erp_data) lo
-- podía escribir el propio cliente. Verificado contra las policies reales:
-- `erp_data_insert` / `erp_data_update` dejan escribir CUALQUIER clave a
-- cualquier usuario con un user_profile activo de esa empresa — no solo el
-- dueño, también un técnico o un vendedor. Un PATCH directo a la API REST
-- con {"clave":"plan_limits","datos":{"tier":"scale",...}} bastaba para
-- auto-subirse de plan gratis (Starter -> Scale) y desbloquear POS, Gastos,
-- Compras y sucursales ilimitadas sin pagar.
--
-- Se cierra con policies RESTRICTIVE (se combinan con AND sobre las
-- permissive existentes, sin tener que reescribirlas): escribir la clave
-- `plan_limits` queda reservado a quien esté en `platform_admins`.
-- El SELECT NO se toca — la app necesita leer su propio tier (usePlanLimits).
--
-- Nota: `is_platform_admin()` ya existía (la usa la policy "Platform Admins
-- VIP Access" de esta misma tabla), así que se reutiliza tal cual.

create policy "plan_limits_insert_solo_pixit"
on public.erp_data
as restrictive
for insert
to public
with check (clave <> 'plan_limits' or public.is_platform_admin());

create policy "plan_limits_update_solo_pixit"
on public.erp_data
as restrictive
for update
to public
using (clave <> 'plan_limits' or public.is_platform_admin())
with check (clave <> 'plan_limits' or public.is_platform_admin());

create policy "plan_limits_delete_solo_pixit"
on public.erp_data
as restrictive
for delete
to public
using (clave <> 'plan_limits' or public.is_platform_admin());

-- El bootstrap de una empresa nueva escribía `plan_limits` desde el cliente
-- (AuthContext.tsx, con la sesión del dueño recién registrado) — con las
-- policies de arriba eso ahora sería rechazado. Se mueve al servidor: un
-- trigger SECURITY DEFINER siembra la fila al crear la empresa, así el
-- cliente ya no necesita permiso de escritura sobre esa clave.
--
-- Mantiene el criterio que ya existía en el código: el trial arranca en el
-- tier más alto (scale), para que el 100% del producto esté disponible
-- durante la prueba.
create or replace function public.fn_seed_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  values (
    NEW.id,
    'plan_limits',
    '{"tier":"scale","max_usuarios":999,"max_sucursales":999}'::jsonb,
    now()
  )
  on conflict (empresa_id, clave) do nothing;
  return NEW;
end;
$$;

drop trigger if exists trg_seed_plan_limits on public.empresas;

create trigger trg_seed_plan_limits
after insert on public.empresas
for each row
execute function public.fn_seed_plan_limits();
