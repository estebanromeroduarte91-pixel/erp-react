// Importa los pedidos recientes de WooCommerce a la bandeja operativa de
// Pixit. Es deliberadamente de solo lectura respecto del inventario: el stock
// lo mueve exclusivamente woo-webhook al cambiar el estado del pedido.

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

function tienePagoConfirmado(pedido: Record<string, unknown>): boolean {
  // WooCommerce completa date_paid/date_paid_gmt únicamente después de que el
  // gateway confirma el cobro. El estado por sí solo no basta: "pending",
  // "failed" y "cancelled" también son pedidos válidos para la API.
  return Boolean(pedido.date_paid_gmt || pedido.date_paid);
}

function desgloseMontos(pedido: Record<string, unknown>) {
  const total = Number(pedido.total ?? 0);
  const costoEnvio = Number(pedido.shipping_total ?? 0) + Number(pedido.shipping_tax ?? 0);
  return {
    subtotal_productos: Math.max(0, total - costoEnvio),
    costo_envio: Math.max(0, costoEnvio),
  };
}

function pedidoFila(empresaId: string, pedido: Record<string, unknown>) {
  const billing = (pedido.billing ?? {}) as Record<string, unknown>;
  const shipping = (pedido.shipping ?? {}) as Record<string, unknown>;
  const lineItems = (pedido.line_items ?? []) as Record<string, unknown>[];
  const nombre = [billing.first_name, billing.last_name].filter(Boolean).join(" ")
    || String(billing.company ?? "") || "Cliente ecommerce";
  return {
    empresa_id: empresaId,
    canal: "woocommerce",
    pedido_externo_id: String(pedido.id ?? pedido.number ?? ""),
    numero: String(pedido.number ?? pedido.id ?? ""),
    estado_origen: String(pedido.status ?? "pending"),
    moneda: String(pedido.currency ?? "CLP"),
    total: Number(pedido.total ?? 0),
    ...desgloseMontos(pedido),
    metodo_pago: String(pedido.payment_method ?? ""),
    metodo_pago_titulo: String(pedido.payment_method_title ?? ""),
    cliente_nombre: nombre,
    cliente_email: String(billing.email ?? ""),
    cliente_telefono: String(billing.phone ?? ""),
    facturacion: billing,
    envio: shipping,
    items: lineItems.map(item => ({
      id: item.id,
      producto_woo_id: item.product_id,
      variacion_woo_id: item.variation_id,
      sku: String(item.sku ?? ""),
      cantidad: Number(item.quantity ?? 1),
      nombre: String(item.name ?? ""),
      precio: Number(item.price ?? 0),
      subtotal: Number(item.subtotal ?? 0),
      total: Number(item.total ?? 0),
      imagen: ((item.image ?? {}) as Record<string, unknown>).src ?? null,
    })),
    nota_cliente: String(pedido.customer_note ?? ""),
    pagado_en: pedido.date_paid_gmt ? `${String(pedido.date_paid_gmt)}Z` : null,
    creado_en_origen: pedido.date_created_gmt ? `${String(pedido.date_created_gmt)}Z` : null,
    actualizado_en_origen: pedido.date_modified_gmt ? `${String(pedido.date_modified_gmt)}Z` : null,
    recibido_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace("Bearer ", "").trim();
  if (!jwt) return json({ ok: false, error: "No autorizado" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // Valida el JWT directamente contra Auth con las credenciales del servidor.
  // Así la función no depende de que SUPABASE_ANON_KEY coincida con la clave
  // pública usada por la versión del frontend que inició la sesión.
  const { data: usuario, error: errorUsuario } = await admin.auth.getUser(jwt);
  if (errorUsuario || !usuario.user) {
    console.error("woo-orders-pull: sesión rechazada", errorUsuario?.message);
    return json({ ok: false, error: "Sesión inválida. Recarga Pixit e inténtalo nuevamente." }, 401);
  }

  const { data: perfil } = await admin.from("user_profiles")
    .select("empresa_id").eq("id", usuario.user.id).maybeSingle();
  if (!perfil?.empresa_id) return json({ ok: false, error: "El usuario no tiene empresa" }, 403);

  let body: { empresa_id?: string } = {};
  try { body = await req.json(); } catch { /* empresa propia */ }
  const { empresaId } = await empresaPermitida(admin, usuario.user.id, perfil.empresa_id, body.empresa_id);

  const { data: conexion } = await admin.from("woo_conexiones")
    .select("site_url,consumer_key,consumer_secret,activa")
    .eq("empresa_id", empresaId).eq("activa", true).maybeSingle();
  if (!conexion?.site_url || !conexion.consumer_key || !conexion.consumer_secret) {
    return json({ ok: false, error: "WooCommerce no está configurado para esta empresa" }, 400);
  }

  const base = String(conexion.site_url).replace(/\/+$/, "");
  const basic = btoa(`${conexion.consumer_key}:${conexion.consumer_secret}`);
  const respuesta = await fetch(`${base}/wp-json/wc/v3/orders?per_page=100&orderby=date&order=desc`, {
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
  });
  const texto = await respuesta.text();
  let pedidos: Record<string, unknown>[] = [];
  try { pedidos = JSON.parse(texto); } catch { /* respuesta inválida */ }
  if (!respuesta.ok || !Array.isArray(pedidos)) {
    const mensaje = (pedidos as unknown as { message?: string })?.message ?? texto.slice(0, 250);
    return json({ ok: false, error: `WooCommerce ${respuesta.status}: ${mensaje}` }, 502);
  }

  const pedidosPagados = pedidos.filter(tienePagoConfirmado);
  const filas = pedidosPagados.map(p => pedidoFila(empresaId, p)).filter(p => p.pedido_externo_id);

  // El módulo es una bandeja de preparación, no un historial de intentos de
  // checkout. Quita registros antiguos que se hayan importado antes de aplicar
  // este filtro y que WooCommerce nunca marcó como pagados.
  const { error: errorLimpiar } = await admin.from("ecommerce_pedidos")
    .delete()
    .eq("empresa_id", empresaId)
    .eq("canal", "woocommerce")
    .is("pagado_en", null);
  if (errorLimpiar) return json({ ok: false, error: errorLimpiar.message }, 500);

  if (filas.length) {
    const { error } = await admin.from("ecommerce_pedidos").upsert(filas, {
      onConflict: "empresa_id,canal,pedido_externo_id",
      ignoreDuplicates: false,
    });
    if (error) return json({ ok: false, error: error.message }, 500);
  }

  return json({ ok: true, importados: filas.length, ignorados_sin_pago: pedidos.length - pedidosPagados.length });
});
