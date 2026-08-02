-- Las policies "erp-assets-insert-anon" / "erp-assets-select-anon" creadas en
-- 21_fotos_qr_orden.sql daban INSERT/SELECT a `anon` sobre TODO el bucket
-- `erp-assets` (bucket_id = 'erp-assets'), sin acotar por carpeta. El único
-- flujo verdaderamente anónimo es la subida de fotos por QR (foto-orden.html,
-- que sube a `qr/{token}/...`). El resto del bucket (ej. `{empresa_id}/logo/...`
-- en GeneralTab.tsx) se sube con sesión autenticada y no necesita acceso anon.
--
-- Con las policies viejas, cualquiera sin sesión podía:
--  - subir archivos arbitrarios a cualquier ruta del bucket (abuso de storage,
--    o incluso pisar `{empresa_id}/logo/logo_taller.png` de otra empresa si
--    llegaba a conocer/adivinar ese empresa_id — es un UUID, no trivial de
--    adivinar, pero no debería depender de eso).
--  - leer cualquier objeto del bucket, no solo fotos de QR.
--
-- Este cambio reemplaza esas 2 policies por versiones acotadas a la carpeta
-- `qr/` y, para INSERT, exige además que el segundo segmento de la ruta sea
-- un token de `orden_qr_tokens` vigente (no vencido, no revocado) — así el
-- permiso de escritura queda atado al mismo control de acceso que ya usan
-- las funciones RPC, no solo a una convención de nombres de carpeta.
--
-- NOTA: no toca la carpeta `{empresa_id}/logo/...` (sigue solo accesible por
-- `authenticated`, sin cambios) ni crea el bucket (ya existe, se administra
-- desde el dashboard de Supabase).

drop policy if exists "erp-assets-insert-anon" on storage.objects;
drop policy if exists "erp-assets-select-anon" on storage.objects;

create policy "erp-assets-insert-anon-qr" on storage.objects
for insert to anon
with check (
  bucket_id = 'erp-assets'
  and (storage.foldername(name))[1] = 'qr'
  and exists (
    select 1 from public.orden_qr_tokens
    where token = (storage.foldername(name))[2]
      and revocado = false
      and expira_at > now()
  )
);

create policy "erp-assets-select-anon-qr" on storage.objects
for select to anon
using (
  bucket_id = 'erp-assets'
  and (storage.foldername(name))[1] = 'qr'
);
