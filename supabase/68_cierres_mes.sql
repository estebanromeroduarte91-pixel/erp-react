-- Cierre de mes (Estadísticas → Cierres).
--
-- Cerrar un mes guarda una foto de sus números y desde ese momento las
-- ventas y los gastos con fecha de ese mes solo los puede crear, editar o
-- anular el dueño de la empresa (empresas.owner_id) o un platform admin de
-- Pixit. Así nadie cambia sin querer un mes que ya se revisó; el dueño sí
-- puede, para corregir errores, y la pantalla le muestra cuánto cambió
-- contra la foto.
--
-- No se bloquean las órdenes de compra: una OC creada en un mes cerrado se
-- puede recibir después, y eso es operación normal. Tampoco lo que escribe el
-- servidor (auth.uid() nulo: Edge Functions y cron).

create table if not exists public.cierres_mes (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  cerrado_por uuid references auth.users(id) on delete set null,
  cerrado_por_nombre text,
  cerrado_en timestamptz not null default now(),
  -- Foto de los números al cerrar (resultado, flujo, IVA, caja, revisión).
  resumen jsonb not null default '{}'::jsonb,
  primary key (empresa_id, mes)
);

alter table public.cierres_mes enable row level security;

-- Todos los de la empresa lo leen: la pantalla de ventas y gastos necesita
-- saber qué meses están cerrados para avisar antes de intentar editar.
drop policy if exists "empresa lee sus cierres" on public.cierres_mes;
create policy "empresa lee sus cierres"
on public.cierres_mes for select to authenticated
using (empresa_id = public.mi_empresa_id() or public.is_platform_admin());

revoke all on public.cierres_mes from anon, authenticated;
grant select on public.cierres_mes to authenticated;

-- Quién puede ver Cierres, cerrar meses y editar un mes cerrado.
drop function if exists public.fn_puede_cerrar_mes(uuid);
create or replace function public.fn_puede_cerrar_mes(p_empresa_id uuid default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_platform_admin()
      or public.soy_dueno_de(coalesce(p_empresa_id, public.mi_empresa_id()));
$$;

drop function if exists public.fn_cerrar_mes(text, jsonb, uuid);
create or replace function public.fn_cerrar_mes(p_mes text, p_resumen jsonb, p_empresa_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := case when p_empresa_id is not null and public.is_platform_admin() then p_empresa_id else public.mi_empresa_id() end;
  v_nombre text;
begin
  if v_empresa is null then raise exception 'Usuario sin empresa'; end if;
  if not public.fn_puede_cerrar_mes(v_empresa) then
    raise exception 'Solo el dueño de la empresa puede cerrar meses' using errcode = '42501';
  end if;
  if p_mes >= to_char(now() at time zone 'America/Santiago', 'YYYY-MM') then
    raise exception 'Solo se pueden cerrar meses que ya terminaron';
  end if;
  select nombre into v_nombre from public.user_profiles where id = auth.uid();

  -- Volver a cerrar un mes ya cerrado actualiza la foto (después de corregir).
  insert into public.cierres_mes (empresa_id, mes, cerrado_por, cerrado_por_nombre, cerrado_en, resumen)
  values (v_empresa, p_mes, auth.uid(), v_nombre, now(), coalesce(p_resumen, '{}'::jsonb))
  on conflict (empresa_id, mes) do update
    set cerrado_por = excluded.cerrado_por,
        cerrado_por_nombre = excluded.cerrado_por_nombre,
        cerrado_en = now(),
        resumen = excluded.resumen;
end;
$$;

drop function if exists public.fn_reabrir_mes(text, uuid);
create or replace function public.fn_reabrir_mes(p_mes text, p_empresa_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := case when p_empresa_id is not null and public.is_platform_admin() then p_empresa_id else public.mi_empresa_id() end;
begin
  if not public.fn_puede_cerrar_mes(v_empresa) then
    raise exception 'Solo el dueño de la empresa puede reabrir meses' using errcode = '42501';
  end if;
  delete from public.cierres_mes where empresa_id = v_empresa and mes = p_mes;
end;
$$;

-- Bloqueo: una venta o un gasto con fecha en un mes cerrado no se puede
-- crear, cambiar ni borrar, salvo el dueño, un platform admin o el servidor.
-- Se revisa la fecha vieja y la nueva: mover un gasto de octubre (cerrado)
-- a noviembre también cambia octubre.
create or replace function public.fn_bloquear_mes_cerrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := coalesce(new.empresa_id, old.empresa_id);
  v_meses text[] := array[]::text[];
  v_mes text;
begin
  if auth.uid() is null or public.fn_puede_cerrar_mes(v_empresa) then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.fecha is not null then
    v_meses := v_meses || to_char(old.fecha::date, 'YYYY-MM');
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.fecha is not null then
    v_meses := v_meses || to_char(new.fecha::date, 'YYYY-MM');
  end if;
  select c.mes into v_mes
    from public.cierres_mes c
   where c.empresa_id = v_empresa and c.mes = any(v_meses)
   limit 1;
  if v_mes is not null then
    raise exception 'El mes % está cerrado. Solo el dueño de la empresa puede modificarlo.', v_mes
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bloquear_mes_cerrado on public.ventas;
create trigger trg_bloquear_mes_cerrado
before insert or update or delete on public.ventas
for each row execute function public.fn_bloquear_mes_cerrado();

drop trigger if exists trg_bloquear_mes_cerrado on public.gastos;
create trigger trg_bloquear_mes_cerrado
before insert or update or delete on public.gastos
for each row execute function public.fn_bloquear_mes_cerrado();

revoke all on function public.fn_puede_cerrar_mes(uuid) from public, anon;
revoke all on function public.fn_cerrar_mes(text, jsonb, uuid) from public, anon;
revoke all on function public.fn_reabrir_mes(text, uuid) from public, anon;
revoke all on function public.fn_bloquear_mes_cerrado() from public, anon, authenticated;
grant execute on function public.fn_puede_cerrar_mes(uuid) to authenticated;
grant execute on function public.fn_cerrar_mes(text, jsonb, uuid) to authenticated;
grant execute on function public.fn_reabrir_mes(text, uuid) to authenticated;
