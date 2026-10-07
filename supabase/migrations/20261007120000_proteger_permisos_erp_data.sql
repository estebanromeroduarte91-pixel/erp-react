-- Sprint 0 · Parte 3 — Los permisos viven en `erp_data` y hoy cualquier usuario
-- activo puede reescribirlos por API:
--   · `cargos`            define qué permisos tiene cada cargo
--   · `ucfg_<usuario>`    cargo y sucursal de cada usuario
--   · `user_cargo_map`    copia consolidada de lo anterior
--   · `pending_cargo_*`   cargo que se aplicará al aceptar una invitación
-- `fn_puede_ver_estadisticas()` confía en esas claves, así que un vendedor podía
-- asignarse un cargo con `estadisticas: true` y leer márgenes y sueldos.
--
-- El `role` de user_profiles ya estaba protegido (trigger 14_bloqueo_escalacion_rol);
-- lo que faltaba era `erp_data`.
--
-- Dos capas:
--   1. Policies RESTRICTIVE (se combinan con AND sobre las permisivas existentes):
--      solo un administrador de la empresa escribe esas claves. La lectura no se toca.
--   2. RPC transaccional para guardar la configuración de un usuario: antes eran
--      tres escrituras sueltas desde el navegador y podían quedar a medias.
--
-- La Edge Function `aceptar-invitacion` usa service_role y no pasa por RLS.

-- ── Quién es administrador de una empresa ───────────────────────
create or replace function public.fn_soy_admin_de(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_empresa is not null
    and (
      public.is_platform_admin()
      or (public.mi_rol() = 'admin' and public.mi_empresa_id() = p_empresa)
      or public.soy_dueno_de(p_empresa)
    )
$$;

revoke all on function public.fn_soy_admin_de(uuid) from public, anon;
grant execute on function public.fn_soy_admin_de(uuid) to authenticated;

-- ── Qué claves de erp_data determinan permisos ──────────────────
create or replace function public.fn_clave_de_permisos(p_clave text)
returns boolean
language sql
immutable
as $$
  select p_clave in ('cargos', 'user_cargo_map')
      or p_clave like 'ucfg\_%' escape '\'
      or p_clave like 'pending\_cargo\_%' escape '\'
$$;

-- ── Policies restrictivas: solo administradores escriben permisos ─
drop policy if exists "permisos_solo_admin_insert" on public.erp_data;
create policy "permisos_solo_admin_insert"
on public.erp_data
as restrictive
for insert
to authenticated
with check (
  not public.fn_clave_de_permisos(clave)
  or public.fn_soy_admin_de(empresa_id)
);

drop policy if exists "permisos_solo_admin_update" on public.erp_data;
create policy "permisos_solo_admin_update"
on public.erp_data
as restrictive
for update
to authenticated
using (
  not public.fn_clave_de_permisos(clave)
  or public.fn_soy_admin_de(empresa_id)
)
with check (
  not public.fn_clave_de_permisos(clave)
  or public.fn_soy_admin_de(empresa_id)
);

drop policy if exists "permisos_solo_admin_delete" on public.erp_data;
create policy "permisos_solo_admin_delete"
on public.erp_data
as restrictive
for delete
to authenticated
using (
  not public.fn_clave_de_permisos(clave)
  or public.fn_soy_admin_de(empresa_id)
);

-- ── RPC transaccional: cargo y sucursal de un usuario ───────────
create or replace function public.fn_guardar_usuario_config(
  p_user_id uuid,
  p_cfg jsonb,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa    uuid;
  v_cargo      text;
  v_cargos     jsonb;
  v_rol_actual text;
  v_rol_nuevo  text;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión activa';
  end if;

  -- Misma convención que el resto de las RPC: solo Pixit puede apuntar a otra empresa.
  if p_empresa_id is not null
     and p_empresa_id is distinct from public.mi_empresa_id()
     and not public.is_platform_admin() then
    raise exception 'No puedes operar sobre otra empresa';
  end if;
  v_empresa := coalesce(p_empresa_id, public.mi_empresa_id());

  if v_empresa is null then
    raise exception 'La empresa no está operativa';
  end if;
  if not public.fn_soy_admin_de(v_empresa) then
    raise exception 'Solo un administrador puede gestionar permisos';
  end if;
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then
    raise exception 'La configuración del usuario no es válida';
  end if;

  select role into v_rol_actual
    from public.user_profiles
   where id = p_user_id and empresa_id = v_empresa;
  if not found then
    raise exception 'El usuario no pertenece a esta empresa';
  end if;

  v_cargo := nullif(p_cfg->>'cargoId', '');

  if v_cargo is not null then
    select case when jsonb_typeof(datos) = 'string' then (datos #>> '{}')::jsonb else datos end
      into v_cargos
      from public.erp_data
     where empresa_id = v_empresa and clave = 'cargos';

    if v_cargo in ('tecnico', 'vendedor', 'encargado') then
      v_rol_nuevo := v_cargo;
    else
      select c->>'rol' into v_rol_nuevo
        from jsonb_array_elements(
               case when jsonb_typeof(v_cargos) = 'array' then v_cargos else '[]'::jsonb end
             ) c
       where c->>'id' = v_cargo
       limit 1;
      if v_rol_nuevo is null and not exists (
        select 1
          from jsonb_array_elements(
                 case when jsonb_typeof(v_cargos) = 'array' then v_cargos else '[]'::jsonb end
               ) c
         where c->>'id' = v_cargo
      ) then
        raise exception 'El cargo "%" no existe en esta empresa', v_cargo;
      end if;
      v_rol_nuevo := coalesce(v_rol_nuevo, 'tecnico');
    end if;

    -- Un cargo personalizado nunca puede otorgar administración.
    if v_rol_nuevo not in ('tecnico', 'vendedor', 'encargado') then
      raise exception 'El cargo apunta a un rol no permitido (%)', v_rol_nuevo;
    end if;

    -- Evita dejar la empresa sin administrador (incluido auto-degradarse).
    if v_rol_actual = 'admin' and v_rol_nuevo <> 'admin' then
      if (select count(*) from public.user_profiles
           where empresa_id = v_empresa and role = 'admin' and activo is not false) <= 1 then
        raise exception 'No puedes quitar al único administrador de la empresa';
      end if;
    end if;
  end if;

  -- Todo lo siguiente ocurre en una sola transacción: o queda todo, o nada.
  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  values (v_empresa, 'ucfg_' || p_user_id::text, p_cfg, now())
  on conflict (empresa_id, clave)
  do update set datos = excluded.datos, actualizado_en = excluded.actualizado_en;

  insert into public.erp_data (empresa_id, clave, datos, actualizado_en)
  values (v_empresa, 'user_cargo_map', jsonb_build_object(p_user_id::text, p_cfg), now())
  on conflict (empresa_id, clave)
  do update set
    datos = (case when jsonb_typeof(public.erp_data.datos) = 'object'
                  then public.erp_data.datos else '{}'::jsonb end)
            || jsonb_build_object(p_user_id::text, p_cfg),
    actualizado_en = excluded.actualizado_en;

  if v_rol_nuevo is not null and v_rol_nuevo is distinct from v_rol_actual then
    update public.user_profiles
       set role = v_rol_nuevo
     where id = p_user_id and empresa_id = v_empresa;
  end if;

  return jsonb_build_object('ok', true, 'rol', coalesce(v_rol_nuevo, v_rol_actual));
end;
$$;

revoke all on function public.fn_guardar_usuario_config(uuid, jsonb, uuid) from public, anon;
grant execute on function public.fn_guardar_usuario_config(uuid, jsonb, uuid) to authenticated;

comment on function public.fn_guardar_usuario_config(uuid, jsonb, uuid) is
  'Guarda cargo y sucursal de un usuario (ucfg_, user_cargo_map y user_profiles.role) de forma atómica. Solo administradores. Marcador: fn_soy_admin_de.';

-- ── Reversa (si algo saliera mal, correr esto en el SQL Editor) ──
-- drop policy if exists "permisos_solo_admin_insert" on public.erp_data;
-- drop policy if exists "permisos_solo_admin_update" on public.erp_data;
-- drop policy if exists "permisos_solo_admin_delete" on public.erp_data;
