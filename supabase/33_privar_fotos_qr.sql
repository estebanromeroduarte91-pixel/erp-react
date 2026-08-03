-- Cierra la lectura pública directa de erp-assets. Las fotos QR pasan por la
-- Edge Function qr-photo, que sólo sirve objetos qr/{token}/... cuando el token
-- existe, no está revocado y coincide exactamente con la carpeta solicitada.
--
-- Antes de ejecutar este SQL se debe desplegar:
--   supabase functions deploy qr-photo --no-verify-jwt
--   supabase functions deploy public-logo --no-verify-jwt

drop policy if exists "erp-assets-select-anon" on storage.objects;
drop policy if exists "erp-assets-select-anon-qr" on storage.objects;

update storage.buckets set public = false where id = 'erp-assets';

-- Conserva los logos ya guardados: siguen siendo públicos por diseño, pero la
-- función public-logo sólo admite {empresa_uuid}/logo/{archivo}.
update public.erp_data
set datos = jsonb_set(
  datos,
  '{logoUrl}',
  to_jsonb(
    'https://nfcdqdbhrsjhbnbtqewl.supabase.co/functions/v1/public-logo?p=' ||
    split_part(split_part(datos->>'logoUrl', '/storage/v1/object/public/erp-assets/', 2), '?', 1)
  )
)
where clave = 'tp_seg_config'
  and jsonb_typeof(datos) = 'object'
  and datos->>'logoUrl' like '%/storage/v1/object/public/erp-assets/%/logo/%';

-- Convierte una URL pública QR histórica a la URL controlada por la función.
-- Los data URLs y cualquier asset ajeno a qr/ se conservan sin cambios.
create or replace function public.url_foto_qr_privada(p_url text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_path text;
  v_token text;
begin
  if p_url is null or position('/storage/v1/object/public/erp-assets/qr/' in p_url) = 0 then return p_url; end if;
  v_path := split_part(p_url, '/storage/v1/object/public/erp-assets/', 2);
  v_token := split_part(v_path, '/', 2);
  if v_token !~ '^[a-fA-F0-9]{40}$' then return p_url; end if;
  return 'https://nfcdqdbhrsjhbnbtqewl.supabase.co/functions/v1/qr-photo?t=' || v_token || '&p=' || v_path;
end;
$$;

update public.ordenes o
set photos_ingreso = coalesce((
  select jsonb_agg(to_jsonb(public.url_foto_qr_privada(e.value)) order by e.ord)
  from jsonb_array_elements_text(coalesce(o.photos_ingreso, '[]'::jsonb)) with ordinality e(value, ord)
), '[]'::jsonb)
where exists (
  select 1 from jsonb_array_elements_text(coalesce(o.photos_ingreso, '[]'::jsonb)) e(value)
  where e.value like '%/storage/v1/object/public/erp-assets/qr/%'
);

update public.ordenes o
set photos_salida = coalesce((
  select jsonb_agg(to_jsonb(public.url_foto_qr_privada(e.value)) order by e.ord)
  from jsonb_array_elements_text(coalesce(o.photos_salida, '[]'::jsonb)) with ordinality e(value, ord)
), '[]'::jsonb)
where exists (
  select 1 from jsonb_array_elements_text(coalesce(o.photos_salida, '[]'::jsonb)) e(value)
  where e.value like '%/storage/v1/object/public/erp-assets/qr/%'
);

update public.ordenes o
set photos_traslado = coalesce((
  select jsonb_agg(to_jsonb(public.url_foto_qr_privada(e.value)) order by e.ord)
  from jsonb_array_elements_text(coalesce(o.photos_traslado, '[]'::jsonb)) with ordinality e(value, ord)
), '[]'::jsonb)
where exists (
  select 1 from jsonb_array_elements_text(coalesce(o.photos_traslado, '[]'::jsonb)) e(value)
  where e.value like '%/storage/v1/object/public/erp-assets/qr/%'
);

update public.ordenes o
set inspeccion = jsonb_set(
  coalesce(o.inspeccion, '{}'::jsonb),
  '{fotos}',
  coalesce((
    select jsonb_agg(to_jsonb(public.url_foto_qr_privada(e.value)) order by e.ord)
    from jsonb_array_elements_text(coalesce(o.inspeccion->'fotos', '[]'::jsonb)) with ordinality e(value, ord)
  ), '[]'::jsonb)
)
where exists (
  select 1 from jsonb_array_elements_text(coalesce(o.inspeccion->'fotos', '[]'::jsonb)) e(value)
  where e.value like '%/storage/v1/object/public/erp-assets/qr/%'
);

drop function public.url_foto_qr_privada(text);
