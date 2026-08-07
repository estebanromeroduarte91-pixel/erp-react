-- Al desmarcar "vender online", la fila del producto quedaba en la cola de
-- sincronización para siempre.
--
-- No causaba daño —`fn_woo_pendientes` filtra por productos marcados, así que
-- nunca se procesaban— pero sí confundía: el conteo de pendientes mostraba
-- filas que jamás iban a salir, y la pantalla decía "no hay cambios pendientes"
-- mientras la consulta reportaba 3 en cola. Dos verdades contradictorias.

create or replace function public.fn_woo_trigger_producto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Al dejar de vender online se limpia lo que hubiera pendiente: ya no hay
  -- nada que empujar para ese producto.
  if NEW.vender_online is not true then
    if TG_OP = 'UPDATE' and OLD.vender_online is true then
      delete from public.woo_sync_cola
      where empresa_id = NEW.empresa_id and producto_id = NEW.id;
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE'
     and NEW.nombre is not distinct from OLD.nombre
     and NEW.precio_venta is not distinct from OLD.precio_venta
     and NEW.sku is not distinct from OLD.sku
     and NEW.descripcion is not distinct from OLD.descripcion
     and NEW.vender_online is not distinct from OLD.vender_online
  then
    return NEW;
  end if;

  perform public.fn_woo_encolar(NEW.empresa_id, NEW.id, 'ficha');
  return NEW;
end; $$;

-- Limpia las huérfanas que ya se habían acumulado.
delete from public.woo_sync_cola q
using public.productos p
where p.id = q.producto_id and p.vender_online is not true;
