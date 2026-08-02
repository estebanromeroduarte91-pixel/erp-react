-- Fix de 22_acotar_storage_qr_anon.sql: la policy de INSERT quedó rota para
-- el caso real. La subquery `exists (select ... from orden_qr_tokens ...)`
-- corre como el rol `anon`, y `orden_qr_tokens` tiene su propia RLS
-- ("empresa gestiona sus qr tokens") que exige `empresa_id = mi_empresa_id()`
-- — `anon` no tiene sesión, `mi_empresa_id()` da null, así que esa RLS le
-- esconde la fila del token aunque exista y esté vigente. Resultado: ni
-- siquiera una subida legítima con token real pasaba.
--
-- Se mueve el chequeo a una función SECURITY DEFINER (mismo patrón que
-- get_orden_publica_qr / guardar_fotos_orden_qr), que sí puede leer
-- orden_qr_tokens sin toparse con esa RLS.

create or replace function public.qr_token_vigente(p_token text)
returns boolean
language sql
security definer
stable
as $function$
  select exists (
    select 1 from public.orden_qr_tokens
    where token = p_token
      and revocado = false
      and expira_at > now()
  );
$function$;

grant execute on function public.qr_token_vigente(text) to anon, authenticated;

drop policy if exists "erp-assets-insert-anon-qr" on storage.objects;

create policy "erp-assets-insert-anon-qr" on storage.objects
for insert to anon
with check (
  bucket_id = 'erp-assets'
  and (storage.foldername(name))[1] = 'qr'
  and public.qr_token_vigente((storage.foldername(name))[2])
);
