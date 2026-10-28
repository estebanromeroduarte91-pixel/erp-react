begin;

-- Comparación por marca y modelo: ignora mayúsculas y espacios repetidos.
create function pg_temp.clave_equipo(e jsonb)
returns jsonb language sql immutable as $fn$
  select jsonb_build_array(
    lower(regexp_replace(trim(coalesce(e->>'marca', '')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(e->>'modelo', '')), '\s+', ' ', 'g'))
  );
$fn$;

do $copiar$
declare
  origen uuid;
  destino uuid;
  fuente jsonb;
  actual jsonb;
  faltantes jsonb;
  resultado jsonb;
  cantidad integer;
begin
  if (select count(*) from public.empresas
      where lower(trim(nombre)) = 'steve docs') <> 1
     or (select count(*) from public.empresas
         where lower(trim(nombre)) = 'terra movil') <> 1 then
    raise exception 'No se identificaron ambas empresas de forma única.';
  end if;

  select id into origen from public.empresas
  where lower(trim(nombre)) = 'steve docs';
  select id into destino from public.empresas
  where lower(trim(nombre)) = 'terra movil';

  select datos::jsonb into actual from public.erp_data
  where empresa_id = destino and clave = 'tp_equipos'
  for update;
  select datos::jsonb into fuente from public.erp_data
  where empresa_id = origen and clave = 'tp_equipos'
  for update;

  if actual is null or fuente is null
     or jsonb_typeof(actual) <> 'array'
     or jsonb_typeof(fuente) <> 'array' then
    raise exception 'Falta un catálogo válido. Operación cancelada.';
  end if;

  if jsonb_array_length(actual) <> 136
     or jsonb_array_length(fuente) <> 1216 then
    raise exception 'Cambió la cantidad de equipos desde la consulta. Operación cancelada.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(fuente) as t(e)
    where jsonb_typeof(e) <> 'object'
       or trim(coalesce(e->>'modelo', '')) = ''
  ) then
    raise exception 'Hay registros de origen sin modelo válido. Operación cancelada.';
  end if;

  if (select count(distinct pg_temp.clave_equipo(e))
      from jsonb_array_elements(fuente) as t(e)) <> 1216 then
    raise exception 'Cambió la cantidad de modelos únicos de Steve Docs.';
  end if;

  select coalesce(jsonb_agg(
    e || jsonb_build_object('id', 'eq-tm-' || gen_random_uuid()::text)
    order by posicion
  ), '[]'::jsonb) into faltantes
  from jsonb_array_elements(fuente) with ordinality as s(e, posicion)
  where not exists (
    select 1 from jsonb_array_elements(actual) as t(equipo)
    where pg_temp.clave_equipo(equipo) = pg_temp.clave_equipo(s.e)
  );

  if jsonb_array_length(faltantes) <> 1147 then
    raise exception 'La cantidad de modelos faltantes ya no es 1147. Operación cancelada.';
  end if;

  resultado := actual || faltantes;

  if jsonb_array_length(resultado) <> 1283 then
    raise exception 'El total final no coincide con 1283. Operación cancelada.';
  end if;

  select count(distinct e->>'id') into cantidad
  from jsonb_array_elements(resultado) as t(e);
  if cantidad <> 1283 or exists (
    select 1 from jsonb_array_elements(resultado) as t(e)
    where coalesce(e->>'id', '') = ''
  ) then
    raise exception 'Hay identificadores vacíos o duplicados. Operación cancelada.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(fuente) as s(e)
    where not exists (
      select 1 from jsonb_array_elements(resultado) as t(equipo)
      where pg_temp.clave_equipo(equipo) = pg_temp.clave_equipo(s.e)
    )
  ) then
    raise exception 'La verificación del catálogo completo falló. Operación cancelada.';
  end if;

  -- Respaldo completo antes de incorporar los modelos nuevos.
  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  select empresa_id, 'tp_equipos_respaldo_20261027_catalogo_completo', datos, now()
  from public.erp_data
  where empresa_id = destino and clave = 'tp_equipos';

  update public.erp_data
  set datos = resultado, actualizado_en = now()
  where empresa_id = destino and clave = 'tp_equipos';

  raise notice 'Se agregaron 1147 modelos. Total: 1283. Steve Docs permanece sin cambios.';
end;
$copiar$;

with catalogos as (
  select lower(trim(e.nombre)) as empresa, t.equipo
  from public.empresas e
  join public.erp_data d on d.empresa_id = e.id and d.clave = 'tp_equipos'
  cross join lateral jsonb_array_elements(d.datos::jsonb) as t(equipo)
  where lower(trim(e.nombre)) in ('steve docs', 'terra movil')
)
select
  (select count(*) from catalogos
   where empresa = 'terra movil') as equipos_terramovil,
  (select count(*) from catalogos
   where empresa = 'steve docs') as equipos_steve_docs,
  (select count(*) from catalogos s
   where s.empresa = 'steve docs'
     and not exists (
       select 1 from catalogos t
       where t.empresa = 'terra movil'
         and pg_temp.clave_equipo(t.equipo) = pg_temp.clave_equipo(s.equipo)
     )) as modelos_que_aun_faltan;

commit;
