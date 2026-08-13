-- Correo multiempresa: selección explícita entre el envío administrado por
-- Pixit y el SMTP propio del taller.
--
-- Las credenciales ya existentes se conservan, pero NO activan por sí solas
-- el SMTP: cuando `mode` falta, la aplicación y la Edge Function interpretan
-- `pixit`. Esto impide que una clave vieja/bloqueada corte todos los avisos.

create extension if not exists supabase_vault with schema vault;

create or replace function public.get_smtp_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa uuid := public.mi_empresa_id();
  v_datos jsonb;
begin
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

create or replace function public.guardar_smtp_config(p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.mi_empresa_id();
  v_anterior jsonb := '{}'::jsonb;
  v_nuevo jsonb := coalesce(p_datos, '{}'::jsonb) - 'hasPassword';
  v_mode text;
  v_password text;
  v_secret_id uuid;
  v_port integer;
begin
  if v_empresa is null then
    raise exception 'Usuario sin empresa activa';
  end if;
  if public.mi_rol() is distinct from 'admin' then
    raise exception 'Solo un administrador puede configurar el correo';
  end if;

  select datos into v_anterior
  from public.erp_data
  where empresa_id = v_empresa and clave = 'tp_smtp_config';
  v_anterior := coalesce(v_anterior, '{}'::jsonb);

  -- El campo vacío conserva la clave anterior. Una clave nueva se mueve a
  -- Supabase Vault y `erp_data` solo guarda el UUID de referencia.
  v_password := coalesce(v_nuevo->>'password', '');
  if length(v_password) > 1024 then
    raise exception 'La contraseña SMTP es demasiado larga';
  end if;
  v_nuevo := v_nuevo - 'password';
  if coalesce(v_anterior->>'password_secret_id', '') <> '' then
    v_secret_id := (v_anterior->>'password_secret_id')::uuid;
  end if;
  if v_password <> '' then
    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        v_password,
        'smtp_' || v_empresa::text,
        'Credencial SMTP cifrada de la empresa ' || v_empresa::text
      );
    else
      perform vault.update_secret(v_secret_id, v_password);
    end if;
  end if;
  if v_secret_id is not null then
    v_nuevo := jsonb_set(v_nuevo, '{password_secret_id}', to_jsonb(v_secret_id::text), true);
  end if;

  v_mode := coalesce(v_nuevo->>'mode', 'pixit');
  if v_mode not in ('pixit', 'smtp') then
    raise exception 'Modo de correo no válido';
  end if;

  if coalesce(p_datos->>'from_email', '') <> ''
     and trim(p_datos->>'from_email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'El correo remitente no es válido';
  end if;
  if coalesce(p_datos->>'reply_to', '') <> ''
     and trim(p_datos->>'reply_to') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'El correo para respuestas no es válido';
  end if;

  v_port := nullif(p_datos->>'port', '')::integer;
  if v_mode = 'smtp' then
    if trim(coalesce(p_datos->>'host', '')) = ''
       or trim(coalesce(p_datos->>'from_email', '')) = ''
       or v_secret_id is null
       or v_port is null
       or v_port not in (465, 587, 2525) then
      raise exception 'La configuración SMTP está incompleta';
    end if;
  end if;

  -- Lista blanca de campos: evita guardar propiedades arbitrarias enviadas
  -- mediante una llamada RPC manipulada desde el navegador.
  v_nuevo := jsonb_strip_nulls(jsonb_build_object(
    'mode', v_mode,
    'host', nullif(left(trim(coalesce(p_datos->>'host', '')), 253), ''),
    'port', v_port,
    'secure', case when p_datos ? 'secure' then (p_datos->>'secure')::boolean else null end,
    'user', nullif(left(trim(coalesce(p_datos->>'user', '')), 254), ''),
    'from_name', nullif(left(trim(coalesce(p_datos->>'from_name', '')), 200), ''),
    'from_email', nullif(left(trim(coalesce(p_datos->>'from_email', '')), 254), ''),
    'reply_to', nullif(left(trim(coalesce(p_datos->>'reply_to', '')), 254), ''),
    'password_secret_id', v_secret_id::text
  ));

  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  values (v_empresa, 'tp_smtp_config', v_nuevo, now())
  on conflict (empresa_id, clave) do update
    set datos = excluded.datos,
        actualizado_en = excluded.actualizado_en;
end;
$$;

-- Migra claves antiguas en texto plano antes de que la Edge Function use el
-- gateway. Después de este bloque no queda ninguna contraseña SMTP en JSON.
do $$
declare
  r record;
  v_secret_id uuid;
begin
  for r in
    select empresa_id, datos
    from public.erp_data
    where clave = 'tp_smtp_config'
      and coalesce(datos->>'password', '') <> ''
  loop
    v_secret_id := vault.create_secret(
      r.datos->>'password',
      'smtp_' || r.empresa_id::text,
      'Credencial SMTP migrada de la empresa ' || r.empresa_id::text
    );
    update public.erp_data
    set datos = (datos - 'password') || jsonb_build_object('password_secret_id', v_secret_id::text),
        actualizado_en = now()
    where empresa_id = r.empresa_id and clave = 'tp_smtp_config';
  end loop;
end;
$$;

-- Exclusiva para el backend: entrega la configuración con la clave descifrada
-- solo al rol de servicio que ejecuta `send-email`.
create or replace function public.get_smtp_config_for_delivery(p_empresa uuid)
returns jsonb
language sql
security definer
stable
set search_path = public, vault
as $$
  select (ed.datos - 'password_secret_id') || jsonb_build_object(
    'password', coalesce(ds.decrypted_secret, '')
  )
  from public.erp_data ed
  left join vault.decrypted_secrets ds
    on ds.id = nullif(ed.datos->>'password_secret_id', '')::uuid
  where ed.empresa_id = p_empresa and ed.clave = 'tp_smtp_config'
  limit 1;
$$;

revoke all on function public.get_smtp_status() from public;
revoke all on function public.guardar_smtp_config(jsonb) from public;
revoke all on function public.get_smtp_config_for_delivery(uuid) from public;
grant execute on function public.get_smtp_status() to authenticated;
grant execute on function public.guardar_smtp_config(jsonb) to authenticated;
grant execute on function public.get_smtp_config_for_delivery(uuid) to service_role;
