begin;

create function pg_temp.clave_duplicado(e jsonb)
returns jsonb language sql immutable as $f$
  select jsonb_build_array(
    lower(regexp_replace(trim(coalesce(e->>'marca', '')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(e->>'modelo', '')), '\s+', ' ', 'g'))
  );
$f$;

create temporary table equipos_unificar (
  equipo jsonb, posicion bigint, clave jsonb
) on commit drop;

create temporary table equipos_resultado (
  equipo jsonb, posicion bigint, cantidad integer
) on commit drop;

do $unificar$
declare
  destino uuid;
  actual jsonb;
  nuevo jsonb;
  mapa jsonb;
begin
  if (select count(*) from public.empresas
      where lower(trim(nombre)) = 'terra movil') <> 1 then
    raise exception 'No se identificó Terra Movil de forma única.';
  end if;
  select id into destino from public.empresas
  where lower(trim(nombre)) = 'terra movil';

  select datos::jsonb into actual from public.erp_data
  where empresa_id = destino and clave = 'tp_equipos'
  for update;

  if actual is null or jsonb_typeof(actual) <> 'array' then
    raise exception 'No hay un catálogo válido.';
  end if;
  if jsonb_array_length(actual) <> 1283 then
    raise exception 'El catálogo ya no tiene 1283 registros. Operación cancelada.';
  end if;

  insert into equipos_unificar
  select e, n, pg_temp.clave_duplicado(e)
  from jsonb_array_elements(actual) with ordinality as t(e, n);

  if exists (
    select 1 from equipos_unificar
    where coalesce(equipo->>'id', '') = ''
       or trim(coalesce(equipo->>'modelo', '')) = ''
  ) or (select count(distinct equipo->>'id') from equipos_unificar) <> 1283 then
    raise exception 'Hay modelos o identificadores inválidos.';
  end if;

  -- No descartar campos adicionales que no conocemos.
  if exists (
    select 1 from equipos_unificar
    group by clave
    having count(distinct (
      equipo - 'id' - 'marca' - 'modelo' - 'categoria' - 'descripcion'
    )) > 1
  ) then
    raise exception 'Hay campos adicionales distintos entre duplicados. Requieren revisión.';
  end if;

  insert into equipos_resultado
  select
    g.primero
    || case when g.categoria <> ''
       then jsonb_build_object('categoria', g.categoria)
       else '{}'::jsonb end
    || case when concat_ws(E'\n', d.descripcion,
         case when c.cantidad > 1
              then 'Categorías anteriores: ' || c.categorias end) <> ''
       then jsonb_build_object('descripcion', concat_ws(E'\n',
         d.descripcion,
         case when c.cantidad > 1
              then 'Categorías anteriores: ' || c.categorias end))
       else '{}'::jsonb end,
    g.posicion,
    g.cantidad
  from (
    select clave,
      (array_agg(equipo order by posicion))[1] as primero,
      min(posicion) as posicion,
      count(*)::integer as cantidad,
      coalesce((array_agg(equipo->>'categoria' order by posicion)
        filter (where trim(coalesce(equipo->>'categoria', '')) <> ''))[1], '') as categoria
    from equipos_unificar
    group by clave
  ) g
  cross join lateral (
    select string_agg(v.descripcion, E'\n' order by v.posicion) as descripcion
    from (
      select equipo->>'descripcion' as descripcion, min(posicion) as posicion
      from equipos_unificar u
      where u.clave = g.clave
        and trim(coalesce(equipo->>'descripcion', '')) <> ''
      group by equipo->>'descripcion'
    ) v
  ) d
  cross join lateral (
    select count(*) as cantidad,
      string_agg(v.categoria, ' / ' order by v.posicion) as categorias
    from (
      select equipo->>'categoria' as categoria, min(posicion) as posicion
      from equipos_unificar u
      where u.clave = g.clave
        and trim(coalesce(equipo->>'categoria', '')) <> ''
      group by equipo->>'categoria'
    ) v
  ) c;

  if (select count(*) from equipos_resultado) <> 1262
     or (select count(*) from equipos_resultado where cantidad > 1) <> 17 then
    raise exception 'Los duplicados difieren de los 17 grupos esperados. Operación cancelada.';
  end if;

  select jsonb_agg(equipo order by posicion) into nuevo
  from equipos_resultado;

  -- Mapa de IDs retirados y su ID conservado, para trazabilidad.
  select jsonb_agg(jsonb_build_object(
    'id_retirado', u.equipo->>'id',
    'id_conservado', r.equipo->>'id',
    'marca', r.equipo->>'marca',
    'modelo', r.equipo->>'modelo'
  ) order by u.posicion) into mapa
  from equipos_unificar u
  join equipos_resultado r
    on pg_temp.clave_duplicado(r.equipo) = u.clave
  where u.equipo->>'id' <> r.equipo->>'id';

  if jsonb_array_length(mapa) <> 21 then
    raise exception 'La cantidad de registros a unificar no coincide.';
  end if;

  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  select empresa_id, 'tp_equipos_respaldo_20261027_unificacion', datos, now()
  from public.erp_data
  where empresa_id = destino and clave = 'tp_equipos';

  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  values (destino, 'tp_equipos_mapa_unificacion_20261027', mapa, now());

  update public.erp_data
  set datos = nuevo, actualizado_en = now()
  where empresa_id = destino and clave = 'tp_equipos';
end;
$unificar$;

-- Detalle de los 17 grupos unificados.
select equipo->>'marca' as marca,
       equipo->>'modelo' as modelo,
       cantidad as registros_anteriores,
       equipo->>'id' as id_conservado,
       equipo->>'descripcion' as descripcion_final
from equipos_resultado
where cantidad > 1
order by marca, modelo;

-- Resultado esperado: 1283, 1262, 21, 0.
select
  (select count(*) from equipos_unificar) as equipos_antes,
  (select count(*) from equipos_resultado) as equipos_despues,
  (select count(*) from equipos_unificar)
    - (select count(*) from equipos_resultado) as filas_unificadas,
  (select count(*) from (
    select pg_temp.clave_duplicado(equipo)
    from equipos_resultado
    group by pg_temp.clave_duplicado(equipo)
    having count(*) > 1
  ) d) as grupos_duplicados_restantes;

commit;
