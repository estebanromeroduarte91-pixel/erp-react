-- Si un producto se elimina desde WooCommerce, se desmarca solo en Pixit.
--
-- Sin esto quedaba un estado mentiroso: el producto seguía marcado "vender
-- online" y la sincronización lo volvía a crear en la tienda en el siguiente
-- cambio de precio o stock. O sea, borrarlo en WooCommerce no servía de nada:
-- reaparecía.
--
-- Se limpia también `woo_product_id`: ese id ya no existe en la tienda, y
-- dejarlo haría que un futuro intento de actualización apunte a un producto
-- inexistente.

create or replace function public.fn_woo_producto_eliminado(p_token text, p_woo_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_sku text;
begin
  select empresa_id into v_empresa
  from public.woo_conexiones
  where token = p_token and activa = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Conexión no encontrada');
  end if;

  update public.productos
  set vender_online = false, woo_product_id = null
  where empresa_id = v_empresa and woo_product_id = p_woo_id
  returning sku into v_sku;

  if v_sku is null then
    return jsonb_build_object('ok', true, 'ignorado',
      'Ningún producto de Pixit estaba enlazado a ese id de la tienda');
  end if;

  -- Se saca de la cola: no tiene sentido seguir intentando publicar algo que
  -- se acaba de desvincular.
  delete from public.woo_sync_cola
  where empresa_id = v_empresa
    and producto_id in (select id from public.productos
                        where empresa_id = v_empresa and sku = v_sku);

  return jsonb_build_object('ok', true, 'desvinculado', v_sku);
end;
$$;

revoke all on function public.fn_woo_producto_eliminado(text, bigint) from public, anon, authenticated;
