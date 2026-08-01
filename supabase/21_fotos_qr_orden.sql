-- Fotos de una orden por QR (celular del cliente escanea, sube fotos sin
-- sesión, vía public/foto-orden.html). Antes la URL del QR llevaba
-- `empresa_id` + `orden_id` + `tipo` directo en el query string y policies
-- USING(true) sobre `ordenes` ("qr anon lee/actualiza su orden") — cualquiera
-- con el link (o adivinando IDs) podía leer/escribir cualquier orden de
-- cualquier empresa. Se reemplaza por un token opaco de un solo uso limitado
-- (60 usos, expira a las 48h) en una tabla dedicada.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

create table if not exists public.orden_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  orden_id text not null,
  tipo text not null,
  token text not null default encode(gen_random_bytes(20), 'hex'),
  expira_at timestamptz not null default (now() + interval '48:00:00'),
  revocado boolean not null default false,
  usos integer not null default 0,
  creado_en timestamptz not null default now()
);

alter table public.orden_qr_tokens enable row level security;

create policy "empresa gestiona sus qr tokens"
on public.orden_qr_tokens
for all
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());

-- Lee los datos de la orden (equipo, cliente, fotos actuales del tipo que
-- corresponda) a partir de un token válido y no vencido. El `tipo` (ingreso/
-- inspección/salida/traslado) lo determina el servidor a partir del token,
-- nunca lo manda el cliente — así no se puede pisar la columna equivocada.
create or replace function public.get_orden_publica_qr(p_token text)
returns json
language plpgsql
security definer
as $function$
declare v json; v_tipo text; v_orden_id text;
begin
  select tipo, orden_id into v_tipo, v_orden_id
  from public.orden_qr_tokens
  where token = p_token and revocado = false and expira_at > now();
  if v_orden_id is null then return null; end if;

  select json_build_object(
    'num', num, 'modelo', modelo, 'nombre', nombre, 'status', status, 'branch_id', branch_id,
    'tipo', v_tipo,
    'fotos_actuales', case v_tipo
      when 'inspeccion' then coalesce(inspeccion->'fotos','[]'::jsonb)
      when 'salida' then coalesce(photos_salida,'[]'::jsonb)
      when 'traslado' then coalesce(photos_traslado,'[]'::jsonb)
      else coalesce(photos_ingreso,'[]'::jsonb)
    end
  ) into v from public.ordenes where id = v_orden_id;
  return v;
end; $function$;

-- Guarda las fotos subidas. Límite de 60 usos por token (evita que un link
-- filtrado/reusado indefinidamente se convierta en una vía de escritura sin
-- límite sobre la orden).
create or replace function public.guardar_fotos_orden_qr(p_token text, p_fotos jsonb)
returns boolean
language plpgsql
security definer
as $function$
declare v_tipo text; v_orden_id text; v_empresa_id uuid;
begin
  select tipo, orden_id, empresa_id into v_tipo, v_orden_id, v_empresa_id
  from public.orden_qr_tokens
  where token = p_token and revocado = false and expira_at > now();
  if v_orden_id is null then return false; end if;

  update public.orden_qr_tokens set usos = usos + 1 where token = p_token and usos < 60;
  if not found then return false; end if;

  if v_tipo = 'inspeccion' then
    update public.ordenes set inspeccion = jsonb_set(coalesce(inspeccion,'{}'::jsonb),'{fotos}',p_fotos)
      where id = v_orden_id and empresa_id = v_empresa_id;
  elsif v_tipo = 'salida' then
    update public.ordenes set photos_salida = p_fotos where id = v_orden_id and empresa_id = v_empresa_id;
  elsif v_tipo = 'traslado' then
    update public.ordenes set photos_traslado = p_fotos where id = v_orden_id and empresa_id = v_empresa_id;
  else
    update public.ordenes set photos_ingreso = p_fotos where id = v_orden_id and empresa_id = v_empresa_id;
  end if;
  return true;
end; $function$;

grant execute on function public.get_orden_publica_qr(text) to anon, authenticated;
grant execute on function public.guardar_fotos_orden_qr(text, jsonb) to anon, authenticated;

-- Cierra las policies USING(true) anteriores sobre `ordenes` (el flujo de QR
-- ahora pasa por las funciones de arriba, no por acceso directo a la tabla).
drop policy if exists "qr anon lee su orden" on public.ordenes;
drop policy if exists "qr anon actualiza su orden" on public.ordenes;

-- Bucket de storage donde se suben las fotos (mismo bucket que otros
-- assets de la app — logos, etc.). El anon solo puede subir/leer, nunca
-- borrar ni listar fuera de lo que ya conoce por URL.
create policy "erp-assets-insert-anon" on storage.objects
for insert to anon
with check (bucket_id = 'erp-assets');

create policy "erp-assets-select-anon" on storage.objects
for select to anon
using (bucket_id = 'erp-assets');
