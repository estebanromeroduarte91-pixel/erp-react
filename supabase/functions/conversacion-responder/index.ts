// Responde una conversación de correo desde Pixit.
//
// Sale por la casilla del taller (gateway SMTP, igual que send-email) y con
// In-Reply-To/References del último correo del cliente, así la respuesta le
// llega en el mismo hilo de su Gmail. Queda guardada en la conversación.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaPermitida } from "../_shared/impersonacion.ts";
import { credencialCorreo, llamarGateway } from "../_shared/mailGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function responder(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function asuntoRespuesta(asunto: string | null): string {
  const base = (asunto ?? "").trim();
  if (!base) return "Re: tu mensaje";
  return /^(re|rv|fwd?)\s*:/i.test(base) ? base : `Re: ${base}`;
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
      .from("user_profiles").select("empresa_id,activo").eq("id", userData.user.id).maybeSingle();
    if (!perfil?.empresa_id || perfil.activo === false) return responder({ ok: false, error: "Usuario sin empresa" }, 403);

    const body = await req.json();
    const { empresaId } = await empresaPermitida(admin, userData.user.id, perfil.empresa_id, body?.empresa_id);
    const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
    if (!body?.conversacion_id || !texto) return responder({ ok: false, error: "Escribe un mensaje." }, 400);
    if (texto.length > 20_000) return responder({ ok: false, error: "El mensaje es demasiado largo." }, 400);

    // La conversación se busca filtrando por la empresa resuelta en el
    // servidor: un id de otra empresa simplemente no aparece.
    const { data: conv } = await admin
      .from("conversaciones")
      .select("id,canal,contacto_externo,asunto")
      .eq("id", body.conversacion_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (!conv) return responder({ ok: false, error: "Conversación no encontrada." }, 404);
    if (conv.canal !== "email") return responder({ ok: false, error: "Por ahora solo se puede responder correo." }, 400);

    // Mismo tope que send-email: 60 correos por empresa por hora.
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("email_log").select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId).gte("creado_en", haceUnaHora);
    if ((count ?? 0) >= 60) return responder({ ok: false, error: "Límite de envíos por hora alcanzado" }, 429);

    const cred = await credencialCorreo(admin, empresaId);
    if ("error" in cred) return responder({ ok: false, error: cred.error }, 400);

    const { data: ultimo } = await admin
      .from("conversacion_mensajes")
      .select("id_externo,referencias,asunto")
      .eq("conversacion_id", conv.id)
      .eq("direccion", "entrante")
      .order("enviado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    const inReplyTo = ultimo?.id_externo && !ultimo.id_externo.startsWith("<imap-") ? ultimo.id_externo : null;
    const references = [ultimo?.referencias, inReplyTo].filter(Boolean).join(" ").slice(-3900) || null;
    const asunto = asuntoRespuesta(ultimo?.asunto ?? conv.asunto);
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">${escaparHtml(texto).replace(/\n/g, "<br>")}</div>`;

    const resultado = await llamarGateway("/v1/send", {
      requestId: crypto.randomUUID(),
      tenantId: empresaId,
      smtp: {
        host: cred.host,
        port: cred.port,
        secure: cred.port === 465,
        user: cred.user,
        password: cred.password,
        fromName: cred.fromName,
        fromEmail: cred.fromEmail,
        replyTo: cred.fromEmail,
      },
      message: { to: conv.contacto_externo, subject: asunto, text: texto, html, inReplyTo, references },
    });

    await admin.from("email_log").insert({
      empresa_id: empresaId,
      user_id: userData.user.id,
      canal: "conversaciones",
      destinatario: conv.contacto_externo,
      asunto,
      ok: !!resultado.ok,
      error: resultado.ok ? null : resultado.error,
    });
    if (!resultado.ok) return responder({ ok: false, error: resultado.error || "No se pudo enviar." }, 502);

    const { error: rpcError } = await admin.rpc("fn_conversacion_registrar_mensaje", {
      p_empresa: empresaId,
      p_canal: "email",
      p_contacto: conv.contacto_externo,
      p_contacto_nombre: "",
      p_direccion: "saliente",
      p_mensaje: {
        id_externo: resultado.messageId || `<pixit-${crypto.randomUUID()}@pixit>`,
        en_respuesta_a: inReplyTo,
        referencias: references,
        de_nombre: cred.fromName,
        de_direccion: cred.fromEmail,
        para: conv.contacto_externo,
        asunto,
        texto,
        html,
        autor_id: userData.user.id,
      },
    });
    // El correo ya salió: si falla el registro se avisa, pero no como si no
    // se hubiera enviado (el cliente sí lo va a recibir).
    if (rpcError) return responder({ ok: true, aviso: `Enviado, pero no quedó guardado en la conversación: ${rpcError.message}` });
    return responder({ ok: true });
  } catch (error) {
    return responder({ ok: false, error: String((error as Error)?.message || error) }, 400);
  }
});
