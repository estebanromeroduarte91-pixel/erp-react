// Conecta una página de Facebook (Messenger) a Conversaciones.
//
// El navegador hace el login de Facebook (SDK de Meta) y manda acá el token
// de usuario. Este nunca se guarda: se usa para listar las páginas que esa
// persona administra y, al elegir una, para obtener el token de la página.
// Como se pide a partir de un token de usuario de larga duración, el token
// de página no vence; se guarda cifrado en Vault.
//
// Acciones:
//   config   → app_id y config_id para inicializar el SDK (no son secretos).
//   paginas  → páginas que administra quien inició sesión en Facebook.
//   conectar → guarda la página elegida y la suscribe al webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaPermitida } from "../_shared/impersonacion.ts";
import { GRAPH, META_APP_ID, META_APP_SECRET, graph } from "../_shared/meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const META_LOGIN_CONFIG_ID = Deno.env.get("META_LOGIN_CONFIG_ID") ?? "";

function responder(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Pagina = { id: string; name: string; access_token?: string; tasks?: string[] };

async function paginasDe(userToken: string): Promise<{ ok: true; paginas: Pagina[] } | { ok: false; error: string }> {
  const r = await graph("/me/accounts", userToken, { query: { fields: "id,name,access_token,tasks", limit: "100" } });
  if (!r.ok) return { ok: false, error: `Facebook no entregó tus páginas: ${r.error?.message ?? "error desconocido"}` };
  // Para responder mensajes hay que poder gestionar la página (tarea MESSAGING
  // o MANAGE). Una página donde la persona solo modera no sirve.
  const paginas = ((r.data?.data ?? []) as Pagina[])
    .filter((p) => !p.tasks || p.tasks.some((t) => t === "MESSAGING" || t === "MANAGE"));
  return { ok: true, paginas };
}

async function tokenLargo(userToken: string): Promise<string | null> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", META_APP_ID);
  url.searchParams.set("client_secret", META_APP_SECRET);
  url.searchParams.set("fb_exchange_token", userToken);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  return res.ok && data?.access_token ? data.access_token : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cabecera = req.headers.get("Authorization") ?? "";
    const jwt = cabecera.replace("Bearer ", "").trim();
    if (!jwt || jwt === ANON_KEY) return responder({ ok: false, error: "No autenticado" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: cabecera } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return responder({ ok: false, error: "No autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: perfil } = await admin
      .from("user_profiles").select("empresa_id,role,activo").eq("id", userData.user.id).maybeSingle();
    if (!perfil?.empresa_id || perfil.activo === false) return responder({ ok: false, error: "Usuario sin empresa" }, 403);

    const body = await req.json().catch(() => ({}));
    const { empresaId, impersonando } = await empresaPermitida(admin, userData.user.id, perfil.empresa_id, body?.empresa_id);

    if (body?.accion === "config") {
      return responder({ ok: !!META_APP_ID, app_id: META_APP_ID || null, config_id: META_LOGIN_CONFIG_ID || null,
        error: META_APP_ID ? undefined : "La app de Meta todavía no está configurada en Pixit (falta META_APP_ID)." });
    }

    // Conectar canales es configuración: solo admin (o Pixit impersonando).
    if (!impersonando && perfil.role !== "admin") {
      return responder({ ok: false, error: "Solo un administrador puede conectar canales." }, 403);
    }
    if (!META_APP_ID || !META_APP_SECRET) {
      return responder({ ok: false, error: "La app de Meta todavía no está configurada en Pixit." }, 500);
    }
    const userToken = typeof body?.user_token === "string" ? body.user_token.trim() : "";
    if (!userToken) return responder({ ok: false, error: "Falta el inicio de sesión de Facebook." }, 400);

    if (body.accion === "paginas") {
      const r = await paginasDe(userToken);
      if (!r.ok) return responder(r, 400);
      return responder({ ok: true, paginas: r.paginas.map((p) => ({ id: p.id, nombre: p.name })) });
    }

    if (body.accion === "conectar") {
      const paginaId = String(body.pagina_id ?? "");
      const largo = await tokenLargo(userToken);
      if (!largo) return responder({ ok: false, error: "No se pudo confirmar el inicio de sesión de Facebook. Inténtalo de nuevo." }, 400);

      // Se vuelve a pedir la lista con el token largo: así el token de página
      // no vence, y además se confirma que la persona sí administra la página
      // elegida (el id que manda el navegador no se toma por bueno).
      const r = await paginasDe(largo);
      if (!r.ok) return responder(r, 400);
      const pagina = r.paginas.find((p) => p.id === paginaId);
      if (!pagina?.access_token) return responder({ ok: false, error: "No administras esa página, o no tiene permiso para mensajes." }, 403);

      const sus = await graph(`/${pagina.id}/subscribed_apps`, pagina.access_token, {
        method: "POST",
        query: { subscribed_fields: "messages,messaging_postbacks,message_echoes" },
      });
      if (!sus.ok) return responder({ ok: false, error: `No se pudo activar la recepción de mensajes de la página: ${sus.error?.message}` }, 400);

      const { error } = await admin.rpc("fn_canal_meta_guardar", {
        p_empresa: empresaId,
        p_canal: "messenger",
        p_cuenta_id: pagina.id,
        p_cuenta_nombre: pagina.name,
        p_token: pagina.access_token,
        p_usuario: userData.user.id,
      });
      if (error) return responder({ ok: false, error: error.message }, 400);
      return responder({ ok: true, pagina: { id: pagina.id, nombre: pagina.name } });
    }

    return responder({ ok: false, error: "Acción no válida" }, 400);
  } catch (error) {
    return responder({ ok: false, error: String((error as Error)?.message || error) }, 400);
  }
});
