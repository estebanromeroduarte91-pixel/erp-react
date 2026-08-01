-- Cotizaciones: acceso público por token (cliente ve su cotización sin
-- sesión, vía public/cotizacion.html) a través de una función SECURITY
-- DEFINER en vez de una policy RLS abierta con USING(true) — que hubiera
-- expuesto el token de CUALQUIER cotización de CUALQUIER empresa a quien
-- hiciera un SELECT directo a la tabla.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

alter table public.cotizaciones
  add column if not exists token_revocado boolean not null default false,
  add column if not exists token_expira_at timestamptz;

create or replace function public.get_cotizacion_publica(p_token text)
returns json
language plpgsql
security definer
as $function$
declare v json;
begin
  select json_build_object(
    'numero', numero, 'fecha_emision', fecha_emision, 'fecha_vencimiento', fecha_vencimiento,
    'cliente_nombre', cliente_nombre, 'cliente_rut', cliente_rut, 'cliente_email', cliente_email,
    'cliente_tel', cliente_tel, 'equipo', equipo, 'items', items, 'subtotal', subtotal,
    'iva', iva, 'total', total, 'notas', notas, 'empresa_id', empresa_id
  ) into v
  from public.cotizaciones
  where token = p_token and token_revocado = false
    and (token_expira_at is null or token_expira_at > now());
  return v;
end;
$function$;

grant execute on function public.get_cotizacion_publica(text) to anon, authenticated;

-- El acceso normal (autenticado, dueño de la cotización) queda acotado a la
-- empresa — el token público de arriba es la única puerta sin sesión.
drop policy if exists "anon lee cotizacion por token" on public.cotizaciones;

drop policy if exists "empresa aisla cotizaciones" on public.cotizaciones;
create policy "empresa aisla cotizaciones"
on public.cotizaciones
for all
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());
