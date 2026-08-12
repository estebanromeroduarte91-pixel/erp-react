-- Guarda y lee la clave del certificado digital (.pfx) de cada taller.
--
-- La clave va a Vault, cifrada, y NO a una columna al lado del archivo: si
-- alguien llegara a acceder al bucket, el certificado sin su clave no sirve
-- para firmar nada. Separar las dos cosas es la única defensa que queda si la
-- primera falla.
--
-- Estas funciones no las puede llamar nadie con sesión: solo `service_role`,
-- o sea únicamente las Edge Functions. Un usuario del navegador no tiene
-- ninguna razón legítima para leer la clave del certificado de su empresa.

create or replace function public.fn_dte_guardar_clave(p_empresa uuid, p_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := 'dte_pfx_' || p_empresa::text;
begin
  -- Vault no reemplaza por nombre: si ya había una, se borra antes. Sin esto,
  -- cambiar un certificado dejaría dos claves con el mismo nombre y la lectura
  -- devolvería cualquiera de las dos.
  delete from vault.secrets where name = v_nombre;
  perform vault.create_secret(p_clave, v_nombre, 'Clave del certificado digital para DTE');
end;
$$;

create or replace function public.fn_dte_leer_clave(p_empresa uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text;
begin
  select decrypted_secret into v_clave
  from vault.decrypted_secrets
  where name = 'dte_pfx_' || p_empresa::text;
  return v_clave;
end;
$$;

revoke all on function public.fn_dte_guardar_clave(uuid, text) from public, anon, authenticated;
revoke all on function public.fn_dte_leer_clave(uuid)          from public, anon, authenticated;
grant execute on function public.fn_dte_guardar_clave(uuid, text) to service_role;
grant execute on function public.fn_dte_leer_clave(uuid)          to service_role;

-- El servidor sí escribe la ficha del certificado (la Edge Function lo hace
-- con service_role, que se salta RLS). Esto es solo para dejar explícito que
-- desde el navegador no se puede.
revoke insert, update, delete on public.dte_certificados from authenticated;
revoke insert, update, delete on public.dte_caf          from authenticated;
revoke insert, update, delete on public.dte_documentos   from authenticated;
