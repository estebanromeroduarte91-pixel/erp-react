-- Base para emitir documentos tributarios electrónicos (DTE) vía SimpleAPI.
--
-- Decisiones que explican la forma de estas tablas:
--
-- 1) MULTI-TALLER. Cada empresa tiene su RUT, su certificado digital y sus
--    propios CAF. Nada acá puede ser global.
--
-- 2) LOS ARCHIVOS NO VAN EN LA BASE. El certificado (.pfx) y los CAF (.xml)
--    viven en el bucket privado `dte-privado`, sin acceso para `anon` ni
--    `authenticated`: solo los lee la Edge Function con service_role. Estas
--    tablas guardan la RUTA y los metadatos, nunca el contenido. La clave del
--    .pfx va aparte, en Vault — guardarla junto al archivo sería como dejar la
--    llave pegada en la cerradura.
--
-- 3) EMISIÓN Y ENVÍO SON DOS MOMENTOS. SimpleAPI genera el DTE (timbrado y
--    firmado, con folio) y recién después se arma un sobre y se manda al SII,
--    que devuelve un TrackID. Ellos recomiendan enviar por tandas cada una
--    hora. Por eso `estado` es una máquina de estados y no un booleano: un
--    documento puede estar emitido y válido para el cliente, y todavía no
--    enviado al SII.

-- ── Identidad tributaria del emisor ───────────────────────────────
-- Datos que el SII exige en cada documento y que hoy Pixit no pide.
alter table public.empresas
  add column if not exists rut text,
  add column if not exists razon_social text,
  add column if not exists giro text,
  add column if not exists direccion_origen text,
  add column if not exists comuna_origen text,
  -- Código de actividad económica del SII. Sin esto la factura se rechaza.
  add column if not exists acteco text,
  -- Arranca en certificación a propósito: nadie debería emitir de verdad por
  -- accidente. Pasar a producción es un acto deliberado.
  add column if not exists dte_ambiente text not null default 'certificacion';

alter table public.empresas
  drop constraint if exists empresas_dte_ambiente_check;
alter table public.empresas
  add constraint empresas_dte_ambiente_check
  check (dte_ambiente in ('certificacion', 'produccion'));

-- Los datos tributarios definen A NOMBRE DE QUIÉN se emiten los documentos.
-- Sin esto, cualquiera con permiso de editar la empresa podría cambiar el RUT
-- emisor, y a partir de ahí las boletas salen a nombre de otro contribuyente.
-- Se reserva a `admin`, igual que se hizo con el plan en la migración 29.
create or replace function public.fn_proteger_datos_tributarios()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE'
     and (NEW.rut              is distinct from OLD.rut
       or NEW.razon_social     is distinct from OLD.razon_social
       or NEW.giro             is distinct from OLD.giro
       or NEW.acteco           is distinct from OLD.acteco
       or NEW.dte_ambiente     is distinct from OLD.dte_ambiente)
     and not public.is_platform_admin()
     and public.mi_rol() is distinct from 'admin'
  then
    raise exception 'Solo un administrador puede cambiar los datos tributarios de la empresa';
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_proteger_datos_tributarios on public.empresas;
create trigger trg_proteger_datos_tributarios
before update on public.empresas
for each row execute function public.fn_proteger_datos_tributarios();

-- ── Certificado digital ───────────────────────────────────────────
create table if not exists public.dte_certificados (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  ruta text not null,               -- dentro del bucket privado `dte-privado`
  rut_firmante text not null,
  vence_el date not null,           -- para avisar ANTES de que se venza
  subido_en timestamptz not null default now(),
  subido_por uuid
);

-- ── CAF: rangos de folios autorizados por el SII ──────────────────
create table if not exists public.dte_caf (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_dte int not null,            -- 39 boleta, 33 factura, 61 nota de crédito...
  ambiente text not null check (ambiente in ('certificacion', 'produccion')),
  folio_desde bigint not null,
  folio_hasta bigint not null,
  -- Último folio EFECTIVAMENTE entregado. Se avanza dentro de una transacción
  -- con bloqueo de fila: dos cajas vendiendo al mismo tiempo no pueden sacar el
  -- mismo folio. Un folio repetido es un problema con el SII, no un bug menor.
  ultimo_folio bigint not null default 0,
  ruta text not null,               -- el XML del CAF en el bucket privado
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  check (folio_hasta >= folio_desde)
);

create index if not exists dte_caf_busqueda_idx
  on public.dte_caf (empresa_id, tipo_dte, ambiente, activo);

-- ── Documentos emitidos ───────────────────────────────────────────
create table if not exists public.dte_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  venta_id text,                    -- la venta de Pixit que lo originó
  tipo_dte int not null,
  folio bigint not null,
  ambiente text not null check (ambiente in ('certificacion', 'produccion')),
  estado text not null default 'generado'
    check (estado in ('generado', 'en_sobre', 'enviado', 'aceptado', 'rechazado', 'error')),
  track_id text,                    -- lo devuelve el SII al recibir el sobre
  xml_ruta text,
  pdf_ruta text,
  neto numeric,
  iva numeric,
  total numeric,
  receptor_rut text,
  receptor_razon_social text,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Un folio no se puede repetir jamás dentro del mismo tipo y ambiente.
  -- Esta restricción es la última línea de defensa contra un folio duplicado.
  unique (empresa_id, tipo_dte, ambiente, folio)
);

create index if not exists dte_documentos_pendientes_idx
  on public.dte_documentos (empresa_id, estado)
  where estado in ('generado', 'en_sobre');

create index if not exists dte_documentos_venta_idx
  on public.dte_documentos (empresa_id, venta_id);

-- ── Entrega atómica de folios ─────────────────────────────────────
create or replace function public.fn_dte_tomar_folio(p_tipo_dte int)
returns table (folio bigint, caf_id uuid, ruta text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.mi_empresa_id();
  v_ambiente text;
  v_caf record;
begin
  if v_empresa is null then
    raise exception 'No autenticado';
  end if;

  if public.mi_rol() not in ('admin', 'encargado', 'vendedor') then
    raise exception 'Tu rol no tiene permiso para emitir documentos';
  end if;

  select dte_ambiente into v_ambiente from public.empresas where id = v_empresa;

  -- `for update` bloquea la fila del CAF: si dos cajas piden folio a la vez,
  -- la segunda espera y recibe el siguiente, nunca el mismo.
  select * into v_caf
  from public.dte_caf
  where empresa_id = v_empresa
    and tipo_dte = p_tipo_dte
    and ambiente = v_ambiente
    and activo
    and ultimo_folio < folio_hasta
  order by folio_desde
  limit 1
  for update;

  if not found then
    raise exception 'No hay folios disponibles para el tipo % en ambiente %. Cargá un CAF nuevo del SII.',
      p_tipo_dte, v_ambiente;
  end if;

  -- Un CAF recién cargado tiene ultimo_folio = 0: el primero es folio_desde.
  folio := greatest(v_caf.ultimo_folio + 1, v_caf.folio_desde);

  update public.dte_caf
  set ultimo_folio = folio,
      activo = case when folio >= folio_hasta then false else activo end
  where id = v_caf.id;

  caf_id := v_caf.id;
  ruta := v_caf.ruta;
  return next;
end;
$$;

revoke all on function public.fn_dte_tomar_folio(int) from public, anon;
grant execute on function public.fn_dte_tomar_folio(int) to authenticated;

-- ── RLS ───────────────────────────────────────────────────────────
alter table public.dte_certificados enable row level security;
alter table public.dte_caf          enable row level security;
alter table public.dte_documentos   enable row level security;

-- Los metadatos del certificado sí se leen desde la app (para avisar cuándo
-- vence), pero escribirlos es cosa del servidor: la carga del archivo pasa por
-- una Edge Function que valida el .pfx antes de aceptarlo.
create policy "empresa lee su certificado" on public.dte_certificados
  for select to authenticated using (empresa_id = public.mi_empresa_id());

create policy "empresa lee sus caf" on public.dte_caf
  for select to authenticated using (empresa_id = public.mi_empresa_id());

create policy "empresa lee sus dte" on public.dte_documentos
  for select to authenticated using (empresa_id = public.mi_empresa_id());

-- Nadie escribe estas tablas por REST. Todo pasa por funciones del servidor:
-- un folio o un estado de DTE escrito a mano desde el navegador es un problema
-- tributario, no un dato más.

create policy "Platform Admins VIP Access" on public.dte_certificados
  for all to public using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "Platform Admins VIP Access" on public.dte_caf
  for all to public using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "Platform Admins VIP Access" on public.dte_documentos
  for all to public using (public.is_platform_admin()) with check (public.is_platform_admin());
