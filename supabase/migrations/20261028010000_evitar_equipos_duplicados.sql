-- Evita nuevos duplicados por marca/modelo en todos los accesos al catálogo.
-- No modifica datos ni exige limpiar antes catálogos de otras empresas.
begin;

create or replace function public.validar_duplicados_catalogo_equipos()
returns trigger
language plpgsql
set search_path = ''
as $func$
declare
  nuevos jsonb;
  anteriores jsonb := '[]'::jsonb;
  duplicado record;
begin
  if new.clave is distinct from 'tp_equipos' then
    return new;
  end if;

  nuevos := new.datos::jsonb;
  if jsonb_typeof(nuevos) = 'string' then
    nuevos := (nuevos #>> '{}')::jsonb;
  end if;

  if nuevos is null or jsonb_typeof(nuevos) <> 'array' then
    raise exception 'El catálogo de equipos debe ser una lista válida.';
  end if;

  if tg_op = 'UPDATE' then
    if old.clave = 'tp_equipos' and old.empresa_id = new.empresa_id then
      anteriores := old.datos::jsonb;
      if jsonb_typeof(anteriores) = 'string' then
        anteriores := (anteriores #>> '{}')::jsonb;
      end if;
      if anteriores is null or jsonb_typeof(anteriores) <> 'array' then
        anteriores := '[]'::jsonb;
      end if;
    end if;
  end if;

  with nuevo_conteo as (
    select
      lower(regexp_replace(trim(coalesce(e->>'marca', '')), '\s+', ' ', 'g')) as marca,
      lower(regexp_replace(trim(coalesce(e->>'modelo', '')), '\s+', ' ', 'g')) as modelo,
      count(*) as cantidad
    from jsonb_array_elements(nuevos) as t(e)
    where trim(coalesce(e->>'modelo', '')) <> ''
    group by 1, 2
  ), anterior_conteo as (
    select
      lower(regexp_replace(trim(coalesce(e->>'marca', '')), '\s+', ' ', 'g')) as marca,
      lower(regexp_replace(trim(coalesce(e->>'modelo', '')), '\s+', ' ', 'g')) as modelo,
      count(*) as cantidad
    from jsonb_array_elements(anteriores) as t(e)
    where trim(coalesce(e->>'modelo', '')) <> ''
    group by 1, 2
  )
  select n.marca, n.modelo into duplicado
  from nuevo_conteo n
  left join anterior_conteo a using (marca, modelo)
  where n.cantidad > greatest(1, coalesce(a.cantidad, 0))
  limit 1;

  if found then
    raise exception 'El equipo % % ya existe en el catálogo. Usa el registro existente.',
      duplicado.marca, duplicado.modelo;
  end if;

  return new;
end;
$func$;

drop trigger if exists trg_evitar_equipos_duplicados on public.erp_data;
create trigger trg_evitar_equipos_duplicados
after insert or update on public.erp_data
for each row execute function public.validar_duplicados_catalogo_equipos();

commit;
