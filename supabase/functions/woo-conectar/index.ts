// Asistente de conexión de WooCommerce. Valida las credenciales, guarda la
// conexión de la empresa y crea/actualiza los webhooks necesarios para que los
// pedidos pagados y los cambios de stock lleguen a Pixit automáticamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaPermitida } from "../_shared/impersonacion.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function normalizarUrl(valor: unknown): string | null {
  try {
    const url = new URL(String(valor ?? "").trim());
    if (url.protocol !== "https:") return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function wooFetch(base: string, key: string, secret: string, ruta: string, init?: RequestInit) {
  const authorization = `Basic ${btoa(`${key}:${secret}`)}`;
  const respuesta = await fetch(`${base}/wp-json/wc/v3${ruta}`, {
    ...init,
    headers: { Authorization: authorization, Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const texto = await respuesta.text();
  let data: unknown = null;
  try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }
  if (!respuesta.ok) {
    const detalle = typeof data === "object" && data && "message" in data
      ? String((data as { message?: unknown }).message ?? "")
      : String(texto).slice(0, 250);
    throw new Error(`WooCommerce ${respuesta.status}: ${detalle || "respuesta inválida"}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!jwt) return json({ ok: false, error: "No autorizado" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: usuario, error: errorUsuario } = await admin.auth.getUser(jwt);
  if (errorUsuario || !usuario.user) return json({ ok: false, error: "Sesión inválida" }, 401);

  const { data: perfil } = await admin.from("user_profiles")
    .select("empresa_id,role").eq("id", usuario.user.id).maybeSingle();
  if (!perfil?.empresa_id) return json({ ok: false, error: "El usuario no tiene empresa" }, 403);

  const { data: platformAdmin } = await admin.from("platform_admins")
    .select("user_id").eq("user_id", usuario.user.id).maybeSingle();
  if (perfil.role !== "admin" && !platformAdmin) {
    return json({ ok: false, error: "Sólo un administrador puede conectar la tienda" }, 403);
  }

  let body: { empresa_id?: string; site_url?: string; consumer_key?: string; consumer_secret?: string; bodega_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Datos inválidos" }, 400); }

  const { empresaId } = await empresaPermitida(admin, usuario.user.id, perfil.empresa_id, body.empresa_id);
  const siteUrl = normalizarUrl(body.site_url);
  const consumerKey = String(body.consumer_key ?? "").trim();
  const consumerSecret = String(body.consumer_secret ?? "").trim();
  const bodegaId = String(body.bodega_id ?? "").trim();

  if (!siteUrl) return json({ ok: false, error: "La tienda debe usar una URL HTTPS válida" }, 400);
  if (!consumerKey.startsWith("ck_") || !consumerSecret.startsWith("cs_")) {
    return json({ ok: false, error: "Las claves de WooCommerce deben comenzar con ck_ y cs_" }, 400);
  }
  if (!bodegaId) return json({ ok: false, error: "Selecciona la sucursal que descontará el stock" }, 400);

  try {
    // Esta consulta comprueba URL, autenticación y permiso de lectura antes de
    // guardar cualquier dato como conexión activa.
    await wooFetch(siteUrl, consumerKey, consumerSecret, "/orders?per_page=1");

    const { data: conexionPrevia } = await admin.from("woo_conexiones")
      .select("id,token,secret").eq("empresa_id", empresaId).maybeSingle();

    const fila = {
      empresa_id: empresaId,
      site_url: siteUrl,
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      bodega_id: bodegaId,
      activa: true,
    };
    const operacion = conexionPrevia
      ? admin.from("woo_conexiones").update(fila).eq("id", conexionPrevia.id).select("id,token,secret").single()
      : admin.from("woo_conexiones").insert(fila).select("id,token,secret").single();
    const { data: conexion, error: errorConexion } = await operacion;
    if (errorConexion || !conexion) throw new Error(errorConexion?.message ?? "No se pudo guardar la conexión");

    const deliveryUrl = `${SUPABASE_URL}/functions/v1/woo-webhook?t=${conexion.token}`;
    const existentes = await wooFetch(siteUrl, consumerKey, consumerSecret, "/webhooks?per_page=100") as { id: number; topic: string; delivery_url: string }[];
    const temas = ["order.created", "order.updated", "product.deleted"];

    for (const topic of temas) {
      const existente = Array.isArray(existentes)
        ? existentes.find(item => item.topic === topic && item.delivery_url === deliveryUrl)
        : undefined;
      const payload = JSON.stringify({
        name: `Pixit · ${topic}`,
        topic,
        status: "active",
        delivery_url: deliveryUrl,
        secret: conexion.secret,
      });
      await wooFetch(siteUrl, consumerKey, consumerSecret, existente ? `/webhooks/${existente.id}` : "/webhooks", {
        method: existente ? "PUT" : "POST",
        body: payload,
      });
    }

    return json({ ok: true, site_url: siteUrl, webhooks: temas.length });
  } catch (error) {
    // Una conexión incompleta nunca debe quedar recibiendo eventos.
    await admin.from("woo_conexiones").update({ activa: false }).eq("empresa_id", empresaId);
    return json({ ok: false, error: error instanceof Error ? error.message : "No se pudo conectar WooCommerce" }, 400);
  }
});
