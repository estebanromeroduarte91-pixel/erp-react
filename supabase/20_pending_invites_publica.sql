-- pending_invites: alguien sin cuenta todavía necesita leer su propia
-- invitación por token antes de registrarse (Login.tsx). Antes había una
-- policy "anon_read" con USING(true) — exponía email/nombre/empresa de
-- CUALQUIER invitación pendiente de CUALQUIER empresa a quien consultara la
-- tabla directo. Se reemplaza por una función SECURITY DEFINER acotada por
-- token + invitación no usada.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

create or replace function public.get_invite_publica(p_token text)
returns json
language plpgsql
security definer
as $function$
declare v json;
begin
  select json_build_object(
    'empresa_id', empresa_id, 'email', email, 'nombre', nombre, 'role', role
  ) into v
  from public.pending_invites
  where token = p_token and used = false;
  return v;
end; $function$;

grant execute on function public.get_invite_publica(text) to anon, authenticated;

drop policy if exists "anon_read" on public.pending_invites;

-- El CRUD normal (crear/cancelar invitaciones desde el panel de Accesos)
-- queda acotado a la empresa del staff autenticado.
drop policy if exists "empresa aisla pending_invites" on public.pending_invites;
create policy "empresa aisla pending_invites"
on public.pending_invites
for all
using (empresa_id = public.mi_empresa_id())
with check (empresa_id = public.mi_empresa_id());
