-- Aprobaciones de presupuesto: el cliente aprueba/rechaza por link público
-- (public/aprobar.html), sin sesión. Antes había policies "acceso_publico"/
-- "open_access" con USING(true) en la tabla `aprobaciones` — CRUD completo
-- para cualquiera en internet, incluyendo datos de otros clientes (nombre,
-- equipo, presupuesto). Se reemplazan por dos funciones SECURITY DEFINER
-- acotadas por token.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

create or replace function public.get_aprobacion_publica(p_token text)
returns json
language plpgsql
security definer
as $function$
declare v json;
begin
  select json_build_object(
    'cliente', cliente, 'equipo', equipo, 'orden_num', orden_num,
    'trabajo', trabajo, 'presupuesto', presupuesto, 'estado', estado
  ) into v
  from public.aprobaciones where token = p_token;
  return v;
end; $function$;

create or replace function public.responder_aprobacion(p_token text, p_estado text)
returns boolean
language plpgsql
security definer
as $function$
declare v_count int;
begin
  if p_estado not in ('aprobado','rechazado') then return false; end if;
  update public.aprobaciones
    set estado = p_estado, aprobado_en = now()
    where token = p_token and estado = 'pendiente';
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $function$;

grant execute on function public.get_aprobacion_publica(text) to anon, authenticated;
grant execute on function public.responder_aprobacion(text, text) to anon, authenticated;

-- Cierra el acceso abierto — verificado con pg_policies que "acceso_publico"
-- y "open_access" desaparecieron de verdad (el primer intento de DROP en
-- esta tabla reportó éxito sin aplicarse; hubo que reintentarlo y confirmar).
drop policy if exists "acceso_publico" on public.aprobaciones;
drop policy if exists "open_access" on public.aprobaciones;

drop policy if exists "empresa aisla aprobaciones" on public.aprobaciones;
create policy "empresa aisla aprobaciones"
on public.aprobaciones
for all
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());
