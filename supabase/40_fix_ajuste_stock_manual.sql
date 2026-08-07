-- Arregla una regresión de la migración 24.
--
-- La 24 revocó `execute` de `fn_ajustar_stock` a `authenticated` para cerrar el
-- agujero real (anon y public podían mover el stock de cualquier empresa sin
-- login). El razonamiento fue que venta y recepción la llaman por dentro y, al
-- ser SECURITY DEFINER, no necesitan el permiso.
--
-- Lo que se pasó por alto: las pantallas de Inventario la llaman DIRECTO desde
-- el navegador. Quedaron rotos, en silencio, el conteo rápido de Productos, los
-- movimientos manuales y la pestaña de Conteos. La celda no muestra el error, así
-- que el número volvía a su valor anterior sin decir nada.
--
-- No se devuelve el permiso sobre `fn_ajustar_stock` —cualquiera con sesión
-- podría fijar el stock a su antojo— ni se le pone control de rol adentro,
-- porque la llaman las ventas por dentro y un vendedor dejaría de poder vender.
-- Va un envoltorio con el control de rol, que es donde corresponde.

create or replace function public.fn_fijar_stock_manual(ajustes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_empresa_id() is null then
    raise exception 'No autenticado';
  end if;

  -- Mismos roles que recibir una orden de compra: ajustar stock a mano es
  -- una tarea de administración de inventario, no de mostrador.
  if public.mi_rol() not in ('admin', 'encargado') then
    raise exception 'Tu rol no tiene permiso para ajustar stock manualmente';
  end if;

  -- La validación de empresa por producto y la atomicidad del delta siguen
  -- viviendo en `fn_ajustar_stock`: acá solo se agrega quién puede llamarla.
  perform public.fn_ajustar_stock(ajustes);
end;
$$;

revoke all on function public.fn_fijar_stock_manual(jsonb) from public, anon;
grant execute on function public.fn_fijar_stock_manual(jsonb) to authenticated;

-- Comprobación: muestra el rol de quien corre esto. Si no dice 'admin' ni
-- 'encargado', esta persona no va a poder ajustar stock y hay que revisarlo
-- antes de dar el arreglo por bueno.
select public.mi_rol() as mi_rol_actual;
