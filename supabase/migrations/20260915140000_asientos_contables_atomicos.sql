-- Asientos contables relacionales y sincronizados con sus documentos origen.
-- Evita el patrón anterior de leer/modificar/regrabar un array completo en
-- erp_data y garantiza que gasto/OC + asiento se confirmen en una transacción.

create table if not exists public.asientos_contables (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  id text not null,
  datos jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, id),
  constraint asientos_contables_datos_objeto check (jsonb_typeof(datos) = 'object')
);

alter table public.asientos_contables enable row level security;

drop policy if exists "empresa aisla asientos_contables" on public.asientos_contables;
create policy "empresa aisla asientos_contables"
on public.asientos_contables for all to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin())
with check (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

grant select, insert, update, delete on public.asientos_contables to authenticated;

create index if not exists asientos_contables_empresa_fecha_idx
  on public.asientos_contables (empresa_id, ((datos->>'fecha')) desc);

-- Migra el historial del blob sin destruirlo; el blob queda temporalmente
-- como respaldo y la aplicación empieza a leer la tabla relacional.
insert into public.asientos_contables (empresa_id, id, datos)
select d.empresa_id, elem->>'id', elem
from public.erp_data d
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(d.datos) = 'array' then d.datos else '[]'::jsonb end
) elem
where d.clave = 'asientos'
  and nullif(elem->>'id', '') is not null
on conflict (empresa_id, id) do update
set datos = excluded.datos, actualizado_en = now();

-- Obtiene una cuenta desde la configuración de la empresa y usa metadatos
-- estándar si todavía no existe un plan personalizado.
create or replace function public.fn_cuenta_contable_json(p_empresa_id uuid, p_cuenta_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_plan jsonb;
  v_cuenta jsonb;
begin
  select datos into v_plan
  from public.erp_data
  where empresa_id = p_empresa_id and clave = 'plan_cuentas';

  if jsonb_typeof(v_plan) = 'array' then
    select elem into v_cuenta
    from jsonb_array_elements(v_plan) elem
    where elem->>'id' = p_cuenta_id
    limit 1;
  end if;

  if v_cuenta is not null then return v_cuenta; end if;

  return case p_cuenta_id
    when 'pc-110' then '{"id":"pc-110","codigo":"110","nombre":"Caja"}'::jsonb
    when 'pc-120' then '{"id":"pc-120","codigo":"120","nombre":"Banco"}'::jsonb
    when 'pc-140' then '{"id":"pc-140","codigo":"140","nombre":"Inventario"}'::jsonb
    when 'pc-150' then '{"id":"pc-150","codigo":"150","nombre":"IVA Crédito Fiscal"}'::jsonb
    when 'pc-210' then '{"id":"pc-210","codigo":"210","nombre":"Cuentas por Pagar"}'::jsonb
    when 'pc-510' then '{"id":"pc-510","codigo":"510","nombre":"Servicios Básicos"}'::jsonb
    when 'pc-520' then '{"id":"pc-520","codigo":"520","nombre":"Remuneraciones"}'::jsonb
    when 'pc-530' then '{"id":"pc-530","codigo":"530","nombre":"Arriendo"}'::jsonb
    when 'pc-540' then '{"id":"pc-540","codigo":"540","nombre":"Limpieza"}'::jsonb
    when 'pc-550' then '{"id":"pc-550","codigo":"550","nombre":"Logística"}'::jsonb
    when 'pc-560' then '{"id":"pc-560","codigo":"560","nombre":"Alimentación"}'::jsonb
    when 'pc-570' then '{"id":"pc-570","codigo":"570","nombre":"Mantenimiento"}'::jsonb
    when 'pc-575' then '{"id":"pc-575","codigo":"575","nombre":"Servicios Tercerizados"}'::jsonb
    when 'pc-580' then '{"id":"pc-580","codigo":"580","nombre":"Materiales"}'::jsonb
    when 'pc-590' then '{"id":"pc-590","codigo":"590","nombre":"Administrativo"}'::jsonb
    else '{"id":"pc-595","codigo":"595","nombre":"Otros Gastos"}'::jsonb
  end;
end;
$$;

revoke all on function public.fn_cuenta_contable_json(uuid, text) from public, anon, authenticated;

create or replace function public.fn_siguiente_asiento_empresa(p_empresa_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_numero integer;
begin
  insert into public.folios_counters (empresa_id, tipo, valor, actualizado_en)
  values (p_empresa_id, 'asiento', 1, now())
  on conflict (empresa_id, tipo) do update
  set valor = public.folios_counters.valor + 1, actualizado_en = now()
  returning valor into v_numero;
  return v_numero;
end;
$$;

revoke all on function public.fn_siguiente_asiento_empresa(uuid) from public, anon, authenticated;

create or replace function public.fn_sync_asiento_gasto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_numero integer;
  v_map jsonb;
  v_debe_id text;
  v_haber_id text;
  v_debe jsonb;
  v_haber jsonb;
  v_datos jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.asientos_contables
    where empresa_id = old.empresa_id and id = 'as-gasto-' || old.id;
    return old;
  end if;

  v_id := 'as-gasto-' || new.id;
  select nullif(datos, 'null'::jsonb) into v_map
  from public.erp_data
  where empresa_id = new.empresa_id and clave = 'cat_cuenta';

  v_debe_id := coalesce(v_map->>new.categoria,
    case new.categoria
      when 'Servicios' then 'pc-510'
      when 'RRHH' then 'pc-520'
      when 'Sueldos' then 'pc-520'
      when 'Comisiones' then 'pc-520'
      when 'Arriendo' then 'pc-530'
      when 'Limpieza' then 'pc-540'
      when 'Logística' then 'pc-550'
      when 'Alimentación' then 'pc-560'
      when 'Mantenimiento' then 'pc-570'
      when 'Servicios Tercerizados' then 'pc-575'
      when 'Materiales' then 'pc-580'
      when 'Administrativo' then 'pc-590'
      else 'pc-595'
    end);
  v_haber_id := case new.metodo
    when 'Efectivo' then 'pc-110'
    when 'Crédito' then 'pc-210'
    else 'pc-120'
  end;
  v_debe := public.fn_cuenta_contable_json(new.empresa_id, v_debe_id);
  v_haber := public.fn_cuenta_contable_json(new.empresa_id, v_haber_id);

  select nullif((datos->>'numero')::integer, 0) into v_numero
  from public.asientos_contables
  where empresa_id = new.empresa_id and id = v_id;
  if v_numero is null then
    v_numero := public.fn_siguiente_asiento_empresa(new.empresa_id);
  end if;

  v_datos := jsonb_build_object(
    'id', v_id,
    'numero', v_numero,
    'fecha', new.fecha,
    'descripcion', coalesce(nullif(trim(new.descripcion), ''), nullif(new.categoria, ''), 'Gasto'),
    'ref_tipo', 'gasto',
    'ref_id', new.id,
    'lineas', jsonb_build_array(
      jsonb_build_object('cuenta_id', v_debe->>'id', 'cuenta_codigo', v_debe->>'codigo', 'cuenta_nombre', v_debe->>'nombre', 'debe', new.monto, 'haber', 0),
      jsonb_build_object('cuenta_id', v_haber->>'id', 'cuenta_codigo', v_haber->>'codigo', 'cuenta_nombre', v_haber->>'nombre', 'debe', 0, 'haber', new.monto)
    )
  );

  insert into public.asientos_contables (empresa_id, id, datos, actualizado_en)
  values (new.empresa_id, v_id, v_datos, now())
  on conflict (empresa_id, id) do update
  set datos = excluded.datos, actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_asiento_gasto on public.gastos;
create trigger trg_sync_asiento_gasto
after insert or update or delete on public.gastos
for each row execute function public.fn_sync_asiento_gasto();

create or replace function public.fn_sync_asiento_oc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_numero integer;
  v_total numeric;
  v_neto numeric;
  v_iva numeric;
  v_sin_factura boolean;
  v_haber_id text;
  v_inv jsonb;
  v_iva_cuenta jsonb;
  v_haber jsonb;
  v_lineas jsonb;
  v_datos jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.asientos_contables
    where empresa_id = old.empresa_id and id = 'as-oc-' || old.id;
    return old;
  end if;

  v_id := 'as-oc-' || new.id;
  if new.estado is distinct from 'confirmada' then
    delete from public.asientos_contables
    where empresa_id = new.empresa_id and id = v_id;
    return new;
  end if;

  v_total := coalesce(new.total, 0);
  v_sin_factura := nullif(trim(coalesce(new.folio_factura, '')), '') is null
    or upper(trim(new.folio_factura)) = 'SIN FACTURA';
  v_neto := case when v_sin_factura then v_total else round(v_total / 1.19) end;
  v_iva := v_total - v_neto;
  v_haber_id := case new.metodo_pago when 'caja' then 'pc-110' when 'credito' then 'pc-210' else 'pc-120' end;
  v_inv := public.fn_cuenta_contable_json(new.empresa_id, 'pc-140');
  v_iva_cuenta := public.fn_cuenta_contable_json(new.empresa_id, 'pc-150');
  v_haber := public.fn_cuenta_contable_json(new.empresa_id, v_haber_id);

  select nullif((datos->>'numero')::integer, 0) into v_numero
  from public.asientos_contables where empresa_id = new.empresa_id and id = v_id;
  if v_numero is null then v_numero := public.fn_siguiente_asiento_empresa(new.empresa_id); end if;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_inv->>'id', 'cuenta_codigo', v_inv->>'codigo', 'cuenta_nombre', v_inv->>'nombre', 'debe', v_neto, 'haber', 0)
  );
  if v_iva > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta_id', v_iva_cuenta->>'id', 'cuenta_codigo', v_iva_cuenta->>'codigo', 'cuenta_nombre', v_iva_cuenta->>'nombre', 'debe', v_iva, 'haber', 0)
    );
  end if;
  v_lineas := v_lineas || jsonb_build_array(
    jsonb_build_object('cuenta_id', v_haber->>'id', 'cuenta_codigo', v_haber->>'codigo', 'cuenta_nombre', v_haber->>'nombre', 'debe', 0, 'haber', v_total)
  );

  v_datos := jsonb_build_object(
    'id', v_id, 'numero', v_numero, 'fecha', new.fecha,
    'descripcion', trim('Compra ' || coalesce(new.numero::text, '') ||
      case when nullif(new.proveedor_nombre, '') is not null then ' · ' || new.proveedor_nombre else '' end ||
      case when v_sin_factura then ' · Sin factura' when nullif(new.folio_factura, '') is not null then ' · Fact. ' || new.folio_factura else '' end),
    'ref_tipo', 'oc', 'ref_id', new.id, 'ref_numero', new.numero::text,
    'lineas', v_lineas
  );
  insert into public.asientos_contables (empresa_id, id, datos, actualizado_en)
  values (new.empresa_id, v_id, v_datos, now())
  on conflict (empresa_id, id) do update set datos = excluded.datos, actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_asiento_oc on public.ocs;
create trigger trg_sync_asiento_oc
after insert or update or delete on public.ocs
for each row execute function public.fn_sync_asiento_oc();

-- Regenera documentos existentes. Los números previamente migrados se
-- conservan; solo se asigna correlativo a los que nunca tuvieron asiento.
update public.gastos set id = id;
update public.ocs set id = id where estado = 'confirmada';

create or replace function public.fn_upsert_asientos(p_asientos jsonb, p_empresa_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_asiento jsonb;
begin
  v_empresa_id := case when p_empresa_id is not null and public.is_platform_admin()
    then p_empresa_id else public.mi_empresa_id() end;
  if v_empresa_id is null then raise exception 'No autenticado'; end if;
  if jsonb_typeof(p_asientos) <> 'array' then raise exception 'Asientos inválidos'; end if;

  for v_asiento in select value from jsonb_array_elements(p_asientos)
  loop
    if nullif(v_asiento->>'id', '') is null or jsonb_typeof(v_asiento->'lineas') <> 'array' then
      raise exception 'Asiento inválido';
    end if;
    insert into public.asientos_contables (empresa_id, id, datos, actualizado_en)
    values (v_empresa_id, v_asiento->>'id', v_asiento, now())
    on conflict (empresa_id, id) do update set datos = excluded.datos, actualizado_en = now();
  end loop;
end;
$$;

revoke all on function public.fn_upsert_asientos(jsonb, uuid) from public, anon;
grant execute on function public.fn_upsert_asientos(jsonb, uuid) to authenticated;
