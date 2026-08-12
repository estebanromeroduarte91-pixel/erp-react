-- Toma de folios desde el servidor.
--
-- `fn_dte_tomar_folio` resuelve la empresa con `mi_empresa_id()`, que depende de
-- `auth.uid()`. Dentro de una Edge Function que usa service_role no hay sesión,
-- así que devolvería null. Esta variante recibe la empresa explícita y solo la
-- puede llamar `service_role` — el navegador no la alcanza.
--
-- Por qué la emisión toma el folio en el servidor y no en el navegador: el folio
-- es un recurso que se consume y se numera de forma correlativa ante el SII.
-- Si lo pidiera el navegador y la llamada a SimpleAPI fallara después, el folio
-- quedaría gastado sin documento y sin registro de por qué.

create or replace function public.fn_dte_tomar_folio_srv(p_empresa uuid, p_tipo_dte int)
returns table (folio bigint, caf_id uuid, ruta text, ambiente text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ambiente text;
  v_caf record;
begin
  select dte_ambiente into v_ambiente from public.empresas where id = p_empresa;
  if v_ambiente is null then
    raise exception 'Empresa no encontrada';
  end if;

  -- `for update` serializa a dos cajas que emitan al mismo tiempo: la segunda
  -- espera y recibe el folio siguiente, nunca el mismo.
  select * into v_caf
  from public.dte_caf
  where empresa_id = p_empresa
    and tipo_dte = p_tipo_dte
    and dte_caf.ambiente = v_ambiente
    and activo
    and ultimo_folio < folio_hasta
  order by folio_desde
  limit 1
  for update;

  if not found then
    raise exception 'No hay folios disponibles para el tipo % en ambiente %. Cargá un CAF nuevo del SII.',
      p_tipo_dte, v_ambiente;
  end if;

  folio := greatest(v_caf.ultimo_folio + 1, v_caf.folio_desde);

  update public.dte_caf
  set ultimo_folio = folio,
      activo = case when folio >= folio_hasta then false else activo end
  where id = v_caf.id;

  caf_id := v_caf.id;
  ruta := v_caf.ruta;
  ambiente := v_ambiente;
  return next;
end;
$$;

revoke all on function public.fn_dte_tomar_folio_srv(uuid, int) from public, anon, authenticated;
grant execute on function public.fn_dte_tomar_folio_srv(uuid, int) to service_role;
