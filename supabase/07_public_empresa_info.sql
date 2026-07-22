-- Función pública para obtener el nombre y logo de una empresa de forma segura para las vistas públicas (Cotizaciones, Ordenes)
create or replace function public.get_public_empresa_info(p_empresa_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_nombre text;
  v_logo text;
begin
  -- 1. Obtener nombre de la empresa
  select nombre into v_nombre from public.empresas where id = p_empresa_id;
  
  -- 2. Obtener logoUrl de su configuración (tp_seg_config en erp_data)
  select datos->>'logoUrl' into v_logo 
  from public.erp_data 
  where empresa_id = p_empresa_id and clave = 'tp_seg_config';
  
  return json_build_object(
    'nombre', coalesce(v_nombre, 'Taller'),
    'logo_url', v_logo
  );
end;
$$;

-- Permitir ejecución anónima y autenticada
grant execute on function public.get_public_empresa_info(uuid) to anon, authenticated;
