-- Ejecutar completo en Supabase SQL Editor.
-- Solo normaliza marca y modelo de los 61 registros aprobados.
-- Conserva IDs, orden, categorías, descripciones y todos los otros registros.
begin;

create temporary table equipos_aprobados (
  id text primary key,
  marca text not null,
  modelo text not null
) on commit drop;

insert into equipos_aprobados (id, marca, modelo) values
    ('1787585266399', 'Samsung', 'A22 5G'),
    ('1787769102687', 'Xiaomi', 'Redmi 10C'),
    ('1787843271965', 'Samsung', 'A06'),
    ('1788023314060', 'Samsung', 'J5 Prime'),
    ('1788032504900', 'Apple', 'iPhone 12'),
    ('1788035161279', 'Apple', 'iPhone 15 Pro Max'),
    ('1788186905123', 'Huawei', 'P20'),
    ('1788192438152', 'Xiaomi', 'Redmi 13C'),
    ('1788292739869', 'Xiaomi', 'Redmi Note 14'),
    ('1788299611275', 'Huawei', 'P30'),
    ('1788460271097', 'Samsung', 'A03 Core'),
    ('1788533647897', 'Xiaomi', 'Redmi Note 13 Pro 5G'),
    ('1788554272251', 'Xiaomi', 'Redmi Note 14 Pro 5G'),
    ('1788717100744', 'Samsung', 'S20 FE'),
    ('1788812717402', 'Apple', 'iPhone 13'),
    ('1789147043428', 'Apple', 'iPhone 13'),
    ('1789221327530', 'Xiaomi', 'Redmi Note 10S'),
    ('1789237286103', 'Samsung', 'Note 8'),
    ('1789312157790', 'Xiaomi', 'Redmi Note 10S'),
    ('1789330974412', 'Motorola', 'Moto G20'),
    ('1789425945201', 'Samsung', 'A02s'),
    ('1789669799755', 'Xiaomi', 'POCO X3 Pro'),
    ('1789680043946', 'Samsung', 'A11'),
    ('1790008958102', 'Apple', 'iPhone 17'),
    ('1790016027259', 'Samsung', 'A15'),
    ('1790021190720', 'Honor', 'X6b'),
    ('1790106522229', 'Oppo', 'A54'),
    ('1790176913655', 'Apple', 'iPhone 11'),
    ('1790180141761', 'Samsung', 'S23 Ultra'),
    ('1790198772463', 'Samsung', 'A32'),
    ('1790208913379', 'Apple', 'iPhone 11'),
    ('1790355242655', 'Samsung', 'A21s'),
    ('1790370939890', 'Huawei', 'P30 Pro'),
    ('1790438010373', 'Motorola', 'Moto E32'),
    ('1790441384109', 'Samsung', 'A50'),
    ('1790450483933', 'Samsung', 'A21s'),
    ('1790604618269', 'Apple', 'iPhone 15'),
    ('1790611252119', 'Samsung', 'S24'),
    ('1790618155761', 'Apple', 'iPhone 13 mini'),
    ('1790625054599', 'Samsung', 'S23 Ultra'),
    ('1790631844927', 'Apple', 'iPhone 12 Pro Max'),
    ('1790685031392', 'Honor', 'X6a'),
    ('1790704684836', 'Apple', 'iPhone 14 Pro'),
    ('1790778030682', 'Samsung', 'A70'),
    ('1791313142653', 'Samsung', 'A51'),
    ('1791319527004', 'Samsung', 'Z Fold 5'),
    ('1791471658859', 'Apple', 'iPhone 15'),
    ('1791733397189', 'Samsung', 'A04s'),
    ('1791742949737', 'Xiaomi', '13T'),
    ('1792081337611', 'Samsung', 'A31'),
    ('1792081792149', 'Samsung', 'A12'),
    ('1792359266789', 'Apple', 'iPhone 16 Pro Max'),
    ('1792423480426', 'Xiaomi', 'Redmi Note 11'),
    ('1792438205550', 'Apple', 'iPhone 12 Pro'),
    ('1792677565186', 'Apple', 'iPhone 15 Plus'),
    ('1792682043631', 'Honor', 'X6b'),
    ('1792685762269', 'Samsung', 'A50'),
    ('1792687017188', 'Apple', 'iPhone 14'),
    ('1792775399724', 'Apple', 'iPhone 13'),
    ('1793120361966', 'Xiaomi', 'Redmi Note 13 5G'),
    ('1793140070749', 'Honor', 'X7b');

do $normalizar$
declare
  empresa_destino uuid;
  empresa_origen uuid;
  catalogo jsonb;
  referencia jsonb;
  resultado jsonb;
  huella text;
  cantidad integer;
begin
  if (select count(*) from public.empresas
      where lower(trim(nombre)) = 'terra movil') <> 1
     or (select count(*) from public.empresas
         where lower(trim(nombre)) = 'steve docs') <> 1 then
    raise exception 'No se identificaron ambas empresas de forma única.';
  end if;

  select id into empresa_destino from public.empresas
  where lower(trim(nombre)) = 'terra movil';
  select id into empresa_origen from public.empresas
  where lower(trim(nombre)) = 'steve docs';

  select datos::jsonb into catalogo from public.erp_data
  where empresa_id = empresa_destino and clave = 'tp_equipos'
  for update;
  select datos::jsonb into referencia from public.erp_data
  where empresa_id = empresa_origen and clave = 'tp_equipos'
  for update;

  if catalogo is null or referencia is null
     or jsonb_typeof(catalogo) <> 'array'
     or jsonb_typeof(referencia) <> 'array' then
    raise exception 'Alguno de los catálogos falta o no es un arreglo JSON.';
  end if;

  select md5(string_agg(
    concat_ws(chr(31), elem->>'id',
      coalesce(elem->>'marca', ''), coalesce(elem->>'modelo', '')),
    chr(30) order by posicion)) into huella
  from jsonb_array_elements(catalogo) with ordinality as t(elem, posicion);

  if jsonb_array_length(catalogo) <> 136
     or huella is distinct from 'a8b346d06c6484681fdd35897a10e556' then
    raise exception 'El catálogo cambió desde la revisión. No se modificó nada; exportarlo otra vez.';
  end if;

  select count(*) into cantidad
  from jsonb_array_elements(catalogo) as t(elem)
  join equipos_aprobados a on a.id = elem->>'id';
  if cantidad <> 61 or (
    select count(distinct elem->>'id')
    from jsonb_array_elements(catalogo) as t(elem)
  ) <> 136 then
    raise exception 'Los identificadores no coinciden o están duplicados. Operación cancelada.';
  end if;

  if exists (
    select 1 from equipos_aprobados a
    where not exists (
      select 1 from jsonb_array_elements(referencia) as s(elem)
      where elem->>'marca' = a.marca and elem->>'modelo' = a.modelo
    )
  ) then
    raise exception 'Cambió alguna referencia de Steve Docs. Operación cancelada.';
  end if;

  -- Respaldo persistente del catálogo completo antes del cambio.
  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  select empresa_id, 'tp_equipos_respaldo_20261027_normalizacion', datos, now()
  from public.erp_data
  where empresa_id = empresa_destino and clave = 'tp_equipos';

  select jsonb_agg(
    case when a.id is not null
      then elem || jsonb_build_object('marca', a.marca, 'modelo', a.modelo)
      else elem end
    order by posicion
  ) into resultado
  from jsonb_array_elements(catalogo) with ordinality as t(elem, posicion)
  left join equipos_aprobados a on a.id = elem->>'id';

  if jsonb_array_length(resultado) <> 136 then
    raise exception 'Cantidad final inesperada. Operación cancelada.';
  end if;

  update public.erp_data
  set datos = resultado, actualizado_en = now()
  where empresa_id = empresa_destino and clave = 'tp_equipos';

  raise notice 'Completado: 61 registros revisados; 136 equipos conservados. Respaldo creado.';
end;
$normalizar$;

-- Verificación de los registros aprobados y sus nombres finales.
select e.nombre as empresa, a.id, elem->>'marca' as marca,
       elem->>'modelo' as modelo,
       (elem->>'marca' = a.marca and elem->>'modelo' = a.modelo) as coincide
from public.empresas e
join public.erp_data d on d.empresa_id = e.id and d.clave = 'tp_equipos'
cross join lateral jsonb_array_elements(d.datos::jsonb) as t(elem)
join equipos_aprobados a on a.id = elem->>'id'
where lower(trim(e.nombre)) = 'terra movil'
order by marca, modelo, a.id;

commit;
