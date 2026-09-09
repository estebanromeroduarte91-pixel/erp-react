-- Registro de avisos comerciales enviados por Pixit antes del vencimiento.
-- La clave única impide enviar varias veces el mismo aviso aunque el proceso
-- diario se ejecute más de una vez.

alter table public.empresas
  add column if not exists suscripcion_termina timestamptz;

comment on column public.empresas.suscripcion_termina is
  'Fecha de renovación/vencimiento del plan pagado. NULL conserva planes antiguos sin vencimiento automático.';

create table if not exists public.avisos_vencimiento_suscripcion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('trial_3_dias', 'plan_3_dias')),
  vencimiento timestamptz not null,
  destinatario text not null,
  estado text not null default 'procesando' check (estado in ('procesando', 'enviado')),
  enviado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, vencimiento)
);

alter table public.avisos_vencimiento_suscripcion enable row level security;

-- Es información interna de facturación. Sólo la Edge Function con
-- service_role puede leerla o modificarla.
revoke all on table public.avisos_vencimiento_suscripcion from anon, authenticated;
grant all on table public.avisos_vencimiento_suscripcion to service_role;

create index if not exists idx_avisos_vencimiento_empresa
  on public.avisos_vencimiento_suscripcion (empresa_id, creado_en desc);

-- Igual que plan_estado y trial_termina, la fecha comercial sólo puede ser
-- modificada desde el Panel Pixit por un administrador de la plataforma.
create or replace function public.fn_proteger_plan_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if not coalesce(public.is_platform_admin(), false) then
      NEW.plan_estado := 'trial';
      NEW.trial_termina := now() + interval '30 days';
      NEW.suscripcion_termina := null;
    end if;
    return NEW;
  end if;

  if not coalesce(public.is_platform_admin(), false) then
    if NEW.plan_estado is distinct from OLD.plan_estado then
      raise exception 'Solo un administrador de la plataforma puede cambiar el estado del plan';
    end if;
    if NEW.trial_termina is distinct from OLD.trial_termina then
      raise exception 'Solo un administrador de la plataforma puede cambiar la fecha de término de la prueba';
    end if;
    if NEW.suscripcion_termina is distinct from OLD.suscripcion_termina then
      raise exception 'Solo un administrador de la plataforma puede cambiar el vencimiento de la suscripción';
    end if;
  end if;
  return NEW;
end;
$$;
