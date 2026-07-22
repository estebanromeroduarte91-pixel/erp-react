-- Leads / prospectos de registro: captura a TODA persona que se registra,
-- aunque no confirme el correo ni termine contratando, para seguimiento
-- comercial desde el panel /pixit-admin.
--
-- Flujo: al enviar el formulario de registro se inserta un lead (estado
-- 'registrado'). Cuando la persona confirma el correo y entra por primera vez,
-- el AuthContext crea la empresa y marca el lead como 'confirmado' con su
-- empresa_id. (El paso de 'confirmado' -> 'cliente' se hace a mano o cuando
-- la empresa pasa a plan pagado.)

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  celular text,
  email text,
  empresa_nombre text,
  estado text not null default 'registrado',   -- registrado | confirmado | cliente
  user_id uuid,                                 -- auth.users.id (se conoce tras signUp)
  empresa_id uuid references public.empresas(id) on delete set null,
  creado_en timestamptz not null default now(),
  confirmado_en timestamptz
);

create index if not exists leads_creado_idx on public.leads (creado_en desc);
create index if not exists leads_email_idx on public.leads (email);

-- Red de seguridad: una empresa por dueño. Con la confirmación de correo la
-- empresa se crea en el primer render confirmado, que puede dispararse dos veces
-- (getSession + onAuthStateChange); este índice evita duplicados si hay carrera.
create unique index if not exists empresas_owner_uidx on public.empresas (owner_id) where owner_id is not null;

alter table public.leads enable row level security;

-- INSERT abierto (anon + authenticated): en el momento del registro la persona
-- todavía NO tiene sesión (si la confirmación de correo está activa), así que la
-- fila se inserta como anon. Mismo criterio que fotos QR / cotización pública.
drop policy if exists "cualquiera registra un lead" on public.leads;
create policy "cualquiera registra un lead"
on public.leads
for insert
to anon, authenticated
with check (true);

-- El propio usuario puede actualizar su lead (marcarlo confirmado al crear su
-- empresa tras confirmar el correo). Solo puede tocar la fila que lleva su user_id.
drop policy if exists "usuario actualiza su propio lead" on public.leads;
create policy "usuario actualiza su propio lead"
on public.leads
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Lectura / gestión total SOLO para super-admins de la plataforma.
drop policy if exists "platform admin lee leads" on public.leads;
create policy "platform admin lee leads"
on public.leads
for select
to authenticated
using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

drop policy if exists "platform admin gestiona leads" on public.leads;
create policy "platform admin gestiona leads"
on public.leads
for update
to authenticated
using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

notify pgrst, 'reload schema';

-- Verificación: debe devolver 4 filas de policies
select policyname, roles, cmd from pg_policies where tablename = 'leads';
