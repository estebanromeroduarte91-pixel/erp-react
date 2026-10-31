// Recibe los mensajes de Messenger que Meta envía a Pixit.
//
// GET: Meta comprueba la URL una vez al configurar el webhook
// (hub.verify_token debe ser igual a META_VERIFY_TOKEN).
// POST: cada mensaje, firmado con el secreto de la app. Se responde 200
// siempre que la firma sea válida: si Meta recibe errores seguidos, deja de
// enviar eventos y desactiva el webhook.
//
// También llegan los "echo": lo que la página envía desde otro lado (Meta
// Business Suite, la app de Messenger). Se guardan como mensajes salientes,
// así el hilo en Pixit queda completo aunque se responda desde el teléfono.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firmaMetaValida, graph } from "../_shared/meta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "";

// deno-lint-ignore no-explicit-any
type Admin = any;

type Adjunto = { type?: string; payload?: { url?: string; title?: string } };
type EventoMessenger = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Adjunto[]; reply_to?: { mid?: string } };
  postback?: { title?: string; payload?: string; mid?: string };
};

type Credencial = { empresa_id: string; cuenta_id: string; cuenta_nombre: string | null; token: string };

const nombresCache = new Map<string, string>();

async function nombreDe(psid: string, token: string): Promise<string> {
  if (nombresCache.has(psid)) return nombresCache.get(psid)!;
  const r = await graph(`/${psid}`, token, { query: { fields: "name,first_name,last_name" } });
  const nombre = r.ok ? (r.data.name || [r.data.first_name, r.data.last_name].filter(Boolean).join(" ")) : "";
  if (nombre) nombresCache.set(psid, nombre);
  return nombre;
}

function textoDe(ev: EventoMessenger): string {
  if (ev.message?.text) return ev.message.text;
  if (ev.postback?.title) return ev.postback.title;
  const tipos = (ev.message?.attachments ?? []).map((a) =>
    ({ image: "📷 Foto", video: "🎥 Video", audio: "🎤 Audio", file: "📎 Archivo", location: "📍 Ubicación", sticker: "👍" } as Record<string, string>)[a.type ?? ""] ?? "📎 Adjunto");
  return tipos.join(" · ");
}

async function procesar(admin: Admin, ev: EventoMessenger, credenciales: Map<string, Credencial | null>) {
  const esEcho = !!ev.message?.is_echo;
  // En un echo el remitente es la página y el destinatario el cliente.
  const paginaId = esEcho ? ev.sender?.id : ev.recipient?.id;
  const clienteId = esEcho ? ev.recipient?.id : ev.sender?.id;
  const mid = ev.message?.mid ?? ev.postback?.mid;
  if (!paginaId || !clienteId || !mid) return;

  if (!credenciales.has(paginaId)) {
    const { data } = await admin.rpc("fn_canal_meta_credencial", { p_canal: "messenger", p_cuenta_id: paginaId });
    credenciales.set(paginaId, (data?.[0] as Credencial | undefined) ?? null);
  }
  const cred = credenciales.get(paginaId);
  // Página que no está conectada (o fue desconectada): se ignora.
  if (!cred) return;

  const nombre = esEcho ? "" : await nombreDe(clienteId, cred.token);
  const adjuntos = (ev.message?.attachments ?? []).map((a) => ({
    filename: a.payload?.title ?? null,
    contentType: a.type ?? null,
    size: null,
    url: a.payload?.url ?? null,
  }));

  const { error } = await admin.rpc("fn_conversacion_registrar_mensaje", {
    p_empresa: cred.empresa_id,
    p_canal: "messenger",
    p_contacto: clienteId,
    p_contacto_nombre: nombre,
    p_direccion: esEcho ? "saliente" : "entrante",
    p_mensaje: {
      id_externo: mid,
      en_respuesta_a: ev.message?.reply_to?.mid ?? null,
      de_nombre: esEcho ? cred.cuenta_nombre : nombre,
      de_direccion: esEcho ? paginaId : clienteId,
      texto: textoDe(ev),
      adjuntos,
      enviado_en: new Date(ev.timestamp ?? Date.now()).toISOString(),
    },
  });
  await admin.from("canales_meta").update({
    ultimo_evento: new Date().toISOString(),
    ultimo_error: error ? `No se pudo guardar un mensaje: ${error.message}` : null,
  }).eq("canal", "messenger").eq("cuenta_id", paginaId);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe"
      && !!VERIFY_TOKEN
      && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN;
    return ok
      ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
      : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = new Uint8Array(await req.arrayBuffer());
  if (!(await firmaMetaValida(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("Firma no válida", { status: 401 });
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response("ok", { status: 200 });
  }
  if (body?.object !== "page") return new Response("ok", { status: 200 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const credenciales = new Map<string, Credencial | null>();
  for (const entry of body.entry ?? []) {
    for (const ev of (entry.messaging ?? []) as EventoMessenger[]) {
      try {
        await procesar(admin, ev, credenciales);
      } catch (error) {
        console.error(JSON.stringify({ evento: "meta_webhook_error", error: String((error as Error)?.message || error) }));
      }
    }
  }
  return new Response("ok", { status: 200 });
});
