-- Fase 3, punto 1: folios atómicos (VTA-, OT-, OC-, COT-, asientos contables).
-- Antes cada número se calculaba como "máx + 1" en memoria del cliente (o sobre
-- la caché de React Query, en el caso de cotizaciones) y luego se insertaba —
-- dos usuarios cobrando/creando casi al mismo tiempo podían sacar el mismo
-- número. Esta tabla + función lo hace atómico vía lock de fila.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.
-- No hace falta volver a correrlo salvo que estés levantando un proyecto
-- Supabase nuevo desde cero.

create table if not exists public.folios_counters (
  empresa_id uuid not null references public.empresas(id),
  tipo text not null,
  valor integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, tipo)
);

alter table public.folios_counters enable row level security;

create policy "empresa aisla folios_counters"
on public.folios_counters
for all
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());

-- Entrega el siguiente número para un tipo de folio, de forma atómica.
-- El INSERT ... ON CONFLICT DO UPDATE toma un lock de fila: si dos usuarios
-- piden folio al mismo tiempo, Postgres los serializa y cada uno recibe un
-- número distinto y correlativo — no hay forma de que colisionen.
create or replace function public.siguiente_folio(p_tipo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid := public.mi_empresa_id();
  v_valor integer;
begin
  if v_empresa_id is null then
    raise exception 'No autenticado';
  end if;

  insert into public.folios_counters (empresa_id, tipo, valor, actualizado_en)
  values (v_empresa_id, p_tipo, 1, now())
  on conflict (empresa_id, tipo)
  do update set valor = folios_counters.valor + 1, actualizado_en = now()
  returning valor into v_valor;

  return v_valor;
end;
$$;

grant execute on function public.siguiente_folio(text) to authenticated;

-- Siembra los contadores existentes al máximo ya usado por cada empresa, para
-- que al cambiar a esta función no se repita ningún folio ya emitido.
-- Idempotente (on conflict do nothing).
insert into public.folios_counters (empresa_id, tipo, valor)
select e.id, 'venta', greatest(
  coalesce((select (cfg.datos->>'ventaCounter')::int from erp_data cfg where cfg.empresa_id=e.id and cfg.clave='cfg'),0),
  coalesce((select max(nullif(regexp_replace(v.numero,'\D','','g'),'')::int) from ventas v where v.empresa_id=e.id),0)
)
from empresas e
on conflict (empresa_id, tipo) do nothing;

insert into public.folios_counters (empresa_id, tipo, valor)
select e.id, 'oc', greatest(
  coalesce((select (cfg.datos->>'ocCounter')::int from erp_data cfg where cfg.empresa_id=e.id and cfg.clave='cfg'),0),
  coalesce((select max(nullif(regexp_replace(o.numero,'\D','','g'),'')::int) from ocs o where o.empresa_id=e.id),0)
)
from empresas e
on conflict (empresa_id, tipo) do nothing;

insert into public.folios_counters (empresa_id, tipo, valor)
select e.id, 'orden', coalesce((select max(nullif(regexp_replace(ord.num,'\D','','g'),'')::int) from ordenes ord where ord.empresa_id=e.id),0)
from empresas e
on conflict (empresa_id, tipo) do nothing;

insert into public.folios_counters (empresa_id, tipo, valor)
select e.id, 'cotizacion', coalesce((select max(c.numero) from cotizaciones c where c.empresa_id=e.id),0)
from empresas e
on conflict (empresa_id, tipo) do nothing;

insert into public.folios_counters (empresa_id, tipo, valor)
select e.id, 'asiento', coalesce((select max((elem->>'numero')::int) from erp_data ed, jsonb_array_elements(ed.datos) elem where ed.empresa_id=e.id and ed.clave='asientos'),0)
from empresas e
on conflict (empresa_id, tipo) do nothing;
