-- Contrato entre el código y la base de datos.
--
-- El 2026-09-15 el frontend dejó de mandarle los ajustes de stock al servidor
-- porque la función nueva los calculaba sola. Esa función nunca se aplicó en
-- producción, así que durante diez días las ventas guardaron el movimiento sin
-- descontar stock — sin un solo error a la vista.
--
-- Esta función responde, en una sola consulta, si cada RPC que el frontend
-- llama existe, recibe los parámetros que le mandan, y trae los marcadores que
-- distinguen la versión nueva de una vieja. No modifica nada.
--
-- Uso:  select public.fn_contrato_rpc('{...}'::jsonb);
-- El JSON lo genera `node scripts/verificar-rpc.mjs`.

create or replace function public.fn_contrato_rpc(p_esperado jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_nombre text;
  v_espera jsonb;
  v_proc record;
  v_salida jsonb := '[]'::jsonb;
  v_faltan_param text[];
  v_faltan_marca text[];
begin
  -- Desde la aplicación, solo el dueño de la plataforma: el código fuente de
  -- las funciones puede revelar reglas de negocio y nombres de tablas
  -- internas. Sin sesión (SQL Editor o un script con la service_role) se
  -- permite: ahí ya se tiene acceso total a la base, y es donde se corre la
  -- verificación antes de publicar. El EXECUTE está revocado para anon, así
  -- que nadie llega acá sin credenciales.
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'Solo Pixit puede revisar el contrato de las funciones';
  end if;

  for v_nombre, v_espera in select key, value from jsonb_each(p_esperado)
  loop
    -- Con sobrecargas se queda con la de más parámetros, que es la vigente:
    -- las viejas se dejan un tiempo para no romper clientes desactualizados.
    select p.proname, p.proargnames, p.prosrc,
           pg_get_function_identity_arguments(p.oid) as firma
      into v_proc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_nombre
    order by p.pronargs desc
    limit 1;

    if not found then
      v_salida := v_salida || jsonb_build_array(jsonb_build_object(
        'funcion', v_nombre, 'existe', false));
      continue;
    end if;

    select coalesce(array_agg(e.param), '{}')
      into v_faltan_param
    from jsonb_array_elements_text(coalesce(v_espera->'parametros', '[]'::jsonb)) e(param)
    where not (e.param = any (coalesce(v_proc.proargnames, '{}')));

    select coalesce(array_agg(m.marca), '{}')
      into v_faltan_marca
    from jsonb_array_elements_text(coalesce(v_espera->'marcadores', '[]'::jsonb)) m(marca)
    where position(m.marca in v_proc.prosrc) = 0;

    v_salida := v_salida || jsonb_build_array(jsonb_build_object(
      'funcion', v_nombre,
      'existe', true,
      'firma', v_proc.firma,
      'parametros_faltantes', to_jsonb(v_faltan_param),
      'marcadores_faltantes', to_jsonb(v_faltan_marca)
    ));
  end loop;

  return v_salida;
end;
$$;

revoke all on function public.fn_contrato_rpc(jsonb) from public, anon;
grant execute on function public.fn_contrato_rpc(jsonb) to authenticated;
