-- Mismo bug que fn_ventas_resumen (migración 47), en get_smtp_status():
-- resolvía la empresa con mi_empresa_id() sin aceptar la empresa impersonada.
-- Un platform admin impersonando otra empresa y mirando Configuración → SMTP
-- veía el estado de SU PROPIO correo, no el del cliente.
--
-- Solo de lectura (nunca expone la contraseña, solo si hay una configurada),
-- así que el riesgo real era confusión, no fuga de credenciales. Se aplica
-- el mismo criterio: p_empresa_id opcional, honrado solo si el que llama es
-- platform admin.
--
-- guardar_smtp_config() —la que SÍ escribe— queda deliberadamente afuera de
-- este arreglo: extenderla de la misma forma habilitaría a un admin a escribir
-- la configuración de correo de otra empresa, que es una capacidad nueva, no
-- una corrección. Eso necesita una decisión aparte antes de tocarse.

create or replace function public.get_smtp_status(p_empresa_id uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid;
  v_datos jsonb;
begin
  if p_empresa_id is not null and public.is_platform_admin() then
    v_empresa := p_empresa_id;
  else
    v_empresa := public.mi_empresa_id();
  end if;

  if v_empresa is null then
    raise exception 'Usuario sin empresa activa';
  end if;

  select datos into v_datos
  from public.erp_data
  where empresa_id = v_empresa and clave = 'tp_smtp_config';

  v_datos := coalesce(v_datos, '{}'::jsonb);
  return (v_datos - 'password' - 'password_secret_id') || jsonb_build_object(
    'hasPassword', coalesce(v_datos->>'password_secret_id', '') <> ''
  );
end;
$$;

grant execute on function public.get_smtp_status(uuid) to authenticated;

-- fn_dte_tomar_folio(int) sin el sufijo _srv quedó sin uso: dte-emitir llama
-- exclusivamente a fn_dte_tomar_folio_srv (que sí recibe la empresa como
-- parámetro explícito). Esta versión vieja resuelve por mi_empresa_id(), así
-- que no puede tocar folios de otra empresa —no es un riesgo cruzado—, pero
-- sigue expuesta a `authenticated` sin que nada la llame. Se revoca por
-- higiene: menos superficie callable directamente es menos que auditar.
revoke all on function public.fn_dte_tomar_folio(int) from authenticated;
