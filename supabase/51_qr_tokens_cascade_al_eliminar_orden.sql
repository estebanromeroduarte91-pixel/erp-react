-- Eliminar una orden con tokens QR generados (flujo de fotos por celular,
-- ver 21_fotos_qr_orden.sql) fallaba con:
--   update or delete on table "ordenes" violates foreign key constraint
--   "orden_qr_tokens_orden_id_fkey" on table "orden_qr_tokens"
-- La FK no tenía on delete cascade (se creó fuera de las migraciones de este
-- repo, junto con el resto del esquema base de "ordenes"). Un token QR no
-- tiene sentido sin la orden que referencia, así que en cascada es correcto.

alter table public.orden_qr_tokens
  drop constraint orden_qr_tokens_orden_id_fkey;

alter table public.orden_qr_tokens
  add constraint orden_qr_tokens_orden_id_fkey
  foreign key (orden_id) references public.ordenes(id) on delete cascade;
