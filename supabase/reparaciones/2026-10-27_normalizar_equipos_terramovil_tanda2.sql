begin;

create temporary table equipos_confirmados (
  id text primary key,
  marca_anterior text,
  modelo_anterior text,
  marca text,
  modelo text
) on commit drop;

insert into equipos_confirmados values
('1787863571336', '', 'A35', 'Samsung', 'A35 5G'),
('1787870121224', 'Oppo', 'RENO 7 4G', 'Oppo', 'Reno 7'),
('1787928003216', 'Samsung', 'A52S', 'Samsung', 'A52s 5G'),
('1788110179890', 'Xiaomi', '12 PRO 5G', 'Xiaomi', '12 Pro'),
('1788187741895', 'Apple', 'XS MAX', 'Apple', 'iPhone XS Max'),
('1788279148803', 'Xiaomi', 'POCO F3 5G', 'Xiaomi', 'POCO F3'),
('1788638271640', 'Samsung', 'A05 4G', 'Samsung', 'A05'),
('1788813695431', '', 'A26', 'Samsung', 'A26 5G'),
('1788994858184', '', '14 PRO MAX', 'Apple', 'iPhone 14 Pro Max'),
('1789231522399', '', 'POCO X5 5G', 'Xiaomi', 'POCO X5'),
('1789236727570', 'Apple', '11', 'Apple', 'iPhone 11'),
('1789330804855', '', 'G20', 'Motorola', 'Moto G20'),
('1789656818513', '', 'A14 4G', 'Samsung', 'A14'),
('1790193293625', '', 'X8A 4G', 'Honor', 'X8a'),
('1790362468861', '', 'A13 4G', 'Samsung', 'A13'),
('1791125677212', '', 'REDMI NOTE 11S 4G', 'Xiaomi', 'Redmi Note 11S'),
('1791734528044', '', 'REDMI NOTE 11 4G', 'Xiaomi', 'Redmi Note 11'),
('1791752417363', '', 'XR', 'Apple', 'iPhone XR'),
('1792081664999', 'Samsung', 'A26', 'Samsung', 'A26 5G'),
('1792682126372', 'Honor', 'X6B 5G', 'Honor', 'X6b'),
('1792939718900', 'Samsung', 'S23 ULTRA (SM-S918B)', 'Samsung', 'S23 Ultra'),
('1793022386014', 'Samsung', 'A25', 'Samsung', 'A25 5G'),
('1793133188883', 'Motorola', 'G54', 'Motorola', 'Moto G54 5G');

do $actualizar$
declare
  destino uuid;
  origen uuid;
  actual jsonb;
  referencia jsonb;
  nuevo jsonb;
  cantidad integer;
begin
  if (select count(*) from public.empresas
      where lower(trim(nombre)) = 'terra movil') <> 1
     or (select count(*) from public.empresas
         where lower(trim(nombre)) = 'steve docs') <> 1 then
    raise exception 'No se identificaron ambas empresas de forma única.';
  end if;

  select id into destino from public.empresas
  where lower(trim(nombre)) = 'terra movil';
  select id into origen from public.empresas
  where lower(trim(nombre)) = 'steve docs';

  select datos::jsonb into actual from public.erp_data
  where empresa_id = destino and clave = 'tp_equipos'
  for update;
  select datos::jsonb into referencia from public.erp_data
  where empresa_id = origen and clave = 'tp_equipos'
  for update;

  if actual is null or referencia is null
     or jsonb_typeof(actual) <> 'array'
     or jsonb_typeof(referencia) <> 'array' then
    raise exception 'Falta un catálogo válido. No se aplicó ningún cambio.';
  end if;

  if exists (
    select 1 from equipos_confirmados c
    where (select count(*) from jsonb_array_elements(actual) as t(e)
           where e->>'id' = c.id) <> 1
       or not exists (
         select 1 from jsonb_array_elements(actual) as t(e)
         where e->>'id' = c.id
           and coalesce(e->>'marca', '') = c.marca_anterior
           and e->>'modelo' = c.modelo_anterior
       )
  ) then
    raise exception 'Cambió algún registro pendiente o su ID no es único. No se aplicó ningún cambio.';
  end if;

  if exists (
    select 1 from equipos_confirmados c
    where not exists (
      select 1 from jsonb_array_elements(referencia) as t(e)
      where e->>'marca' = c.marca and e->>'modelo' = c.modelo
    )
  ) then
    raise exception 'Cambió una referencia de Steve Docs. No se aplicó ningún cambio.';
  end if;

  -- Respaldo completo del estado inmediatamente anterior a esta tanda.
  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  select empresa_id, 'tp_equipos_respaldo_20261027_tanda2', datos, now()
  from public.erp_data
  where empresa_id = destino and clave = 'tp_equipos';

  select jsonb_agg(
    case when c.id is null then e
    else e || jsonb_build_object('marca', c.marca, 'modelo', c.modelo)
      || case
        when c.id = '1792939718900'
          and position('SM-S918B' in upper(coalesce(e->>'descripcion', ''))) = 0
        then jsonb_build_object(
          'descripcion',
          case when coalesce(e->>'descripcion', '') = ''
               then 'Código de modelo: SM-S918B'
               else (e->>'descripcion') || E'\nCódigo de modelo: SM-S918B'
          end
        )
        else '{}'::jsonb
      end
    end order by posicion
  ) into nuevo
  from jsonb_array_elements(actual) with ordinality as t(e, posicion)
  left join equipos_confirmados c on c.id = e->>'id';

  if jsonb_array_length(nuevo) <> jsonb_array_length(actual) then
    raise exception 'Cantidad final inesperada. Operación cancelada.';
  end if;

  select count(*) into cantidad
  from jsonb_array_elements(nuevo) as t(e)
  join equipos_confirmados c on c.id = e->>'id'
  where e->>'marca' = c.marca and e->>'modelo' = c.modelo;
  if cantidad <> 23 then
    raise exception 'La verificación de los 23 registros falló. Operación cancelada.';
  end if;

  update public.erp_data set datos = nuevo, actualizado_en = now()
  where empresa_id = destino and clave = 'tp_equipos';
end;
$actualizar$;

select e.nombre as empresa, t.equipo->>'id' as id,
       t.equipo->>'marca' as marca, t.equipo->>'modelo' as modelo,
       t.equipo->>'descripcion' as descripcion,
       (t.equipo->>'marca' = c.marca
        and t.equipo->>'modelo' = c.modelo) as coincide
from public.empresas e
join public.erp_data d on d.empresa_id = e.id and d.clave = 'tp_equipos'
cross join lateral jsonb_array_elements(d.datos::jsonb) as t(equipo)
join equipos_confirmados c on c.id = t.equipo->>'id'
where lower(trim(e.nombre)) = 'terra movil'
order by marca, modelo, id;

commit;
