-- Corregir el método de pago de una venta ya confirmada.
--
-- Caso real: el cajero cobra en efectivo y marca "débito" (o al revés). Hasta
-- ahora la única salida era anular la venta y rehacerla, lo que devuelve
-- stock, gasta otro folio y ensucia el histórico — desproporcionado para
-- corregir un solo campo que no afecta montos ni inventario.
--
-- Se hace por RPC y no con un update directo desde el navegador por la misma
-- razón que el resto de las escrituras de ventas (migración 24): la tabla no
-- debe ser escribible con la sesión del cliente. Y acepta `p_empresa_id` con
-- el mismo criterio de la migración 49: solo se honra si el llamador es de
-- verdad platform admin, para que funcione durante la impersonación sin
-- abrir la puerta a que cualquiera toque otra empresa.
--
-- LÍMITE CONSCIENTE: no se valida que el método exista en el catálogo de la
-- empresa. Ese catálogo vive en un blob JSON (`erp_data/metodos_pago`) que
-- además cae a valores por defecto del frontend cuando está vacío, así que
-- validarlo acá acoplaría la RPC a esa forma. La UI solo ofrece métodos
-- válidos; acá se acota el largo y se exige no vacío.
--
-- NO se registra quién hizo el cambio: hoy `ventas` no tiene ninguna columna
-- de usuario y no existe tabla de auditoría (ver el hueco detectado el
-- 2026-08-18 al no poder rastrear qué ventas hizo el super-admin).

create or replace function public.fn_actualizar_metodo_pago(
  p_venta_id text,
  p_metodo_pago text,
  p_empresa_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_impersonando boolean;
  v_estado text;
begin
  v_impersonando := p_empresa_id is not null and public.is_platform_admin();
  v_empresa_id := case when v_impersonando then p_empresa_id else public.mi_empresa_id() end;

  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if not v_impersonando and public.mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede cambiar el método de pago';
  end if;

  if p_metodo_pago is null or btrim(p_metodo_pago) = '' then
    raise exception 'Método de pago vacío';
  end if;
  if length(p_metodo_pago) > 60 then
    raise exception 'Método de pago inválido';
  end if;

  select estado into v_estado
  from public.ventas
  where id = p_venta_id and empresa_id = v_empresa_id
  for update;

  if v_estado is null then raise exception 'Venta no encontrada'; end if;

  -- Una venta anulada es un registro histórico cerrado: su método de pago ya
  -- no significa nada y editarlo solo confunde el arqueo del día en que se
  -- anuló. Se bloquea a propósito.
  if v_estado = 'anulada' then
    raise exception 'No se puede cambiar el método de pago de una venta anulada';
  end if;

  update public.ventas
  set metodo_pago = btrim(p_metodo_pago)
  where id = p_venta_id and empresa_id = v_empresa_id;
end;
$$;

revoke all on function public.fn_actualizar_metodo_pago(text, text, uuid) from public, anon;
grant execute on function public.fn_actualizar_metodo_pago(text, text, uuid) to authenticated;
