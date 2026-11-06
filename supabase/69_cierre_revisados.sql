-- Ítems de la revisión de cierre que el dueño marcó como revisados.
--
-- Hay casos que la revisión marca pero que están bien a propósito: una OC de
-- kit con productos a $0, o una orden entregada sin cobrar porque fue
-- garantía. Marcarla como revisada la saca de los pendientes sin tocar la OC
-- ni la orden. Solo el dueño de la empresa (o Pixit) marca y desmarca, igual
-- que el resto de Cierres.

create table if not exists public.cierre_revisados (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  -- Qué punto de la revisión ('oc_costo', 'ordenes') y qué registro (id).
  punto text not null,
  clave text not null,
  revisado_por uuid references auth.users(id) on delete set null,
  revisado_en timestamptz not null default now(),
  primary key (empresa_id, punto, clave)
);

alter table public.cierre_revisados enable row level security;

drop policy if exists "empresa lee sus revisados" on public.cierre_revisados;
create policy "empresa lee sus revisados"
on public.cierre_revisados for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

drop policy if exists "dueno marca revisados" on public.cierre_revisados;
create policy "dueno marca revisados"
on public.cierre_revisados for insert to authenticated
with check (public.fn_puede_cerrar_mes(empresa_id) and revisado_por = auth.uid());

drop policy if exists "dueno desmarca revisados" on public.cierre_revisados;
create policy "dueno desmarca revisados"
on public.cierre_revisados for delete to authenticated
using (public.fn_puede_cerrar_mes(empresa_id));

revoke all on public.cierre_revisados from anon, authenticated;
grant select, insert, delete on public.cierre_revisados to authenticated;
