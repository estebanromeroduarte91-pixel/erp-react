// Utilidades compartidas para hablar con la Graph API de Meta (Messenger y,
// después, Instagram). Las credenciales de la app viven en secretos de
// Supabase: META_APP_ID, META_APP_SECRET y META_VERIFY_TOKEN.

export const GRAPH = "https://graph.facebook.com/v23.0";

export const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
export const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

function bytesAHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, data: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return bytesAHex(await crypto.subtle.sign("HMAC", key, bytes));
}

function igualesSinFiltrarTiempo(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Meta firma cada evento del webhook con el secreto de la app
 * (X-Hub-Signature-256). Sin esta comprobación, cualquiera que conozca la URL
 * podría inyectar mensajes falsos en la bandeja de un taller.
 */
export async function firmaMetaValida(rawBody: Uint8Array, cabecera: string | null): Promise<boolean> {
  if (!META_APP_SECRET || !cabecera?.startsWith("sha256=")) return false;
  return igualesSinFiltrarTiempo(cabecera.slice(7).toLowerCase(), await hmacHex(META_APP_SECRET, rawBody));
}

/**
 * appsecret_proof: Meta lo exige (o lo recomienda) en llamadas server-side.
 * Si un token se filtrara, sin el secreto de la app no sirve desde afuera.
 */
export function appsecretProof(token: string): Promise<string> {
  return hmacHex(META_APP_SECRET, token);
}

export type ErrorGraph = { message?: string; code?: number; error_subcode?: number; type?: string };

// deno-lint-ignore no-explicit-any
export async function graph(ruta: string, token: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<{ ok: boolean; data: any; error?: ErrorGraph }> {
  const url = new URL(`${GRAPH}${ruta}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  if (META_APP_SECRET) url.searchParams.set("appsecret_proof", await appsecretProof(token));
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    const data = await res.json().catch(() => ({}));
    return res.ok && !data?.error ? { ok: true, data } : { ok: false, data, error: data?.error ?? { message: `HTTP ${res.status}` } };
  } catch (error) {
    return { ok: false, data: null, error: { message: String((error as Error)?.message || error) } };
  }
}

/** Mensaje entendible para los errores de Meta más comunes al responder. */
export function errorMetaLegible(e: ErrorGraph | undefined): string {
  if (!e) return "Meta no aceptó el mensaje.";
  // 10 / 2018278: fuera de la ventana de 24 h desde el último mensaje del cliente.
  if (e.error_subcode === 2018278 || (e.code === 10 && /window|ventana|24/i.test(e.message ?? ""))) {
    return "Pasaron más de 24 horas desde el último mensaje del cliente. Meta no permite responder hasta que vuelva a escribir.";
  }
  if (e.code === 190) return "La conexión con la página venció o fue revocada. Vuelve a conectarla en Conversaciones → Conectar canal.";
  if (e.code === 551 || e.error_subcode === 1545041) return "Esta persona no está disponible para recibir mensajes.";
  if (e.code === 200 || e.code === 10) return "La app de Meta no tiene permiso para enviar este mensaje. Si la app sigue en modo desarrollo, solo puede escribir a personas con un rol en ella.";
  return `Meta rechazó el mensaje: ${e.message ?? "error desconocido"}`;
}
