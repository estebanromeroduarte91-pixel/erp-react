begin;

create temporary table equipos_confirmados (
  id text primary key,
  marca_anterior text,
  modelo_anterior text,
  marca text,
  modelo text
) on commit drop;

insert into equipos_confirmados values
('1787509541965', '', 'SAMSUNG A17', 'Samsung', 'A17'),
('1787593478329', '', 'ACER ASPIRE LITE 14', 'Acer', 'Aspire Lite 14'),
('1787670015722', '', 'MOTOROLA E22I', 'Motorola', 'Moto E22i'),
('1787697912898', 'Samsung', 'S5E', 'Samsung', 'Galaxy Tab S5e'),
('1787784530475', 'Honor', 'HONOR 400SMART 5G', 'Honor', '400 Smart 5G'),
('1787929993366', '', 'ZTE BLADE A3 2020', 'ZTE', 'Blade A3 2020'),
('1787950058264', '', 'LAPTOP HP ENVI15', 'HP', 'Envy 15'),
('1788289565165', 'Samsung', 'A7 LITE', 'Samsung', 'Galaxy Tab A7 Lite'),
('1788295870989', 'Huawei', 'Y9', 'Huawei', 'Y9'),
('1788297543141', 'Motorola', 'MOTO G56', 'Motorola', 'Moto G56'),
('1788534339478', '', 'REDMI A3', 'Xiaomi', 'Redmi A3'),
('1788539278158', '', 'INFINIX NOTE 40 5G', 'Infinix', 'Note 40 5G'),
('1788553246384', 'Motorola', 'g53', 'Motorola', 'Moto G53'),
('1788557660906', 'HP', '14-ck00511a', 'HP', '14-ck00511a'),
('1788634911073', '', 'NINTENDO SWITCH', 'Nintendo', 'Switch'),
('1788818220530', '', 'Pavilion 14-av033la', 'HP', 'Pavilion 14-av033la'),
('1788874886383', 'Motorola', 'g56', 'Motorola', 'Moto G56'),
('1789237058664', '', 'SONY MANDO PS5', 'Sony', 'Mando PS5'),
('1789652905096', '', 'XBOX 360', 'Microsoft', 'Xbox 360'),
('1789655559606', '', 'TABLET S6 LITE', 'Samsung', 'Galaxy Tab S6 Lite'),
('1790005528204', '', 'LENOVO YOGA10', 'Lenovo', 'Yoga 10'),
('1790101817638', '', 'ASUS A556U', 'Asus', 'A556U'),
('1790109570656', '', 'MANDO DE NINTENDO SWITCH', 'Nintendo', 'Mando de Nintendo Switch'),
('1790275530283', '', 'PLAY 4', 'Sony', 'PlayStation 4'),
('1790426339257', '', 'infinix hot 40 neo', 'Infinix', 'Hot 40 Neo'),
('1790436025035', 'Motorola', 'g85', 'Motorola', 'Moto G85'),
('1790455684056', 'Samsung', 'A7 LITE', 'Samsung', 'Galaxy Tab A7 Lite'),
('1790627269647', '', 'SAMSUNG A07', 'Samsung', 'A07'),
('1790781908026', '', 'G05', 'Motorola', 'Moto G05'),
('1790814230688', '', 'IPAD 9 GEN', 'Apple', 'iPad 9.ª generación'),
('1791042463412', 'Samsung', 'TABLET S7 FE', 'Samsung', 'Galaxy Tab S7 FE'),
('1791730440927', 'Sony', 'MANDO PS4', 'Sony', 'Mando PS4'),
('1791734014787', '', 'XBOX SERIE X', 'Microsoft', 'Xbox Series X'),
('1791735219783', '', 'A17', 'Samsung', 'A17'),
('1791894655532', 'tecno spark', 'tecno spark 20 pro', 'Tecno', 'Spark 20 Pro'),
('1791897668438', 'Honor', '400 SMART', 'Honor', '400 Smart'),
('1791926821955', 'Motorola', 'G53', 'Motorola', 'Moto G53'),
('1791996791340', 'Asus', 'rog ally z1 extreme', 'Asus', 'ROG Ally Z1 Extreme'),
('1792088271352', 'Motorola', 'G06 4G', 'Motorola', 'Moto G06 4G'),
('1792089024318', 'Sony', 'MANDO PLAY5', 'Sony', 'Mando PS5'),
('1792091612579', 'Sony', 'PS4', 'Sony', 'PlayStation 4'),
('1792609096459', 'Samsung', 'A07 5G', 'Samsung', 'A07 5G'),
('1792761698443', 'Xiaomi', 'REDMI 10 5G', 'Xiaomi', 'Redmi 10 5G'),
('1792959705317', 'Honor', 'X5B PLUS', 'Honor', 'X5b Plus');

do $actualizar$
declare
  destino uuid;
  actual jsonb;
  nuevo jsonb;
  cantidad integer;
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

  -- Respaldo completo del estado inmediatamente anterior a esta tanda.
  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  select empresa_id, 'tp_equipos_respaldo_20261027_tanda3', datos, now()
  from public.erp_data
  where empresa_id = destino and clave = 'tp_equipos';

  select jsonb_agg(
    case when c.id is null then e
    else e || jsonb_build_object('marca', c.marca, 'modelo', c.modelo)
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
  if cantidad <> 44 then
    raise exception 'La verificación de los 44 registros falló. Operación cancelada.';
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
