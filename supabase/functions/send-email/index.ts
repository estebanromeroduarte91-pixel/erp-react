import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaPermitida } from "../_shared/impersonacion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type SmtpConfig = {
  mode?: "pixit" | "smtp";
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
};

type TallerConfig = { nombre?: string; from_email?: string; email?: string };
function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function smtpErrorLegible(error: unknown): string {
  const raw = String((error as Error)?.message || error);
  if (/\b535\b|incorrect authentication|authentication failed|username and password not accepted/i.test(raw)) {
    return `El servidor SMTP rechazó el usuario o la contraseña (535). Revisa la clave, usa el correo completo como usuario y confirma con tu hosting que la IP de Pixit no esté bloqueada. Detalle técnico: ${raw}`;
  }
  if (/timeout|timed out|tiempo agotado/i.test(raw)) {
    return `El servidor SMTP no respondió dentro de 10 segundos. Revisa host, puerto y cifrado; algunos hostings también bloquean conexiones externas. Detalle técnico: ${raw}`;
  }
  if (/certificate|certificado|tls|ssl|starttls/i.test(raw)) {
    return `No se pudo establecer una conexión segura con el SMTP. El puerto 465 requiere SSL/TLS inmediato y el 587 usa STARTTLS. Detalle técnico: ${raw}`;
  }
  if (/\b550\b|sender verify|sender rejected|from address/i.test(raw)) {
    return `El servidor rechazó el remitente. El correo remitente debe pertenecer a la cuenta SMTP autorizada. Detalle técnico: ${raw}`;
  }
  return raw;
}

function bytesAHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function firmarGateway(secret: string, timestamp: string, requestId: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${timestamp}.${requestId}.${rawBody}`);
  return `v1=${bytesAHex(await crypto.subtle.sign("HMAC", key, data))}`;
}

async function enviarViaGateway(payload: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  const baseUrl = texto(Deno.env.get("SMTP_GATEWAY_URL")).replace(/\/+$/, "");
  const secret = texto(Deno.env.get("SMTP_GATEWAY_SECRET"));
  if (!baseUrl || secret.length < 32) {
    return { ok: false, error: "El gateway SMTP de Pixit aún no está configurado." };
  }

  const requestId = String(payload.requestId);
  const timestamp = String(Date.now());
  const rawBody = JSON.stringify(payload);
  const signature = await firmarGateway(secret, timestamp, requestId, rawBody);
  try {
    const response = await fetch(`${baseUrl}/v1/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pixit-Timestamp": timestamp,
        "X-Pixit-Request-Id": requestId,
        "X-Pixit-Signature": signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => ({ ok: false, error: "Respuesta no válida del gateway SMTP." }));
    return response.ok ? result : { ok: false, error: result.error || `Gateway SMTP respondió HTTP ${response.status}.` };
  } catch (error) {
    return { ok: false, error: smtpErrorLegible(error) };
  }
}

// Los correos salían SOLO en HTML. Los filtros anti-spam penalizan eso: un
// correo legítimo casi siempre viaja en multipart/alternative, con una versión
// de texto plano junto a la HTML. Un correo sin parte de texto suma puntaje de
// spam en Gmail y Outlook aunque el dominio esté bien autenticado.
//
// Se deriva acá, en el servidor, y no en cada plantilla del cliente: así cubre
// todos los envíos de la app (órdenes, cotizaciones, aprobaciones, pruebas)
// sin tener que tocarlas una por una ni que se olviden en las próximas.
function htmlATexto(html: string): string {
  return html
    // Los enlaces conservan la URL entre paréntesis: en texto plano, un
    // "haz clic aquí" sin destino no sirve de nada.
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, url, texto) => `${String(texto).replace(/<[^>]+>/g, "").trim()} (${url})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "")
    // Entidades numéricas (&#241; / &#xF1;) de forma genérica.
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    // Entidades con nombre que aparecen de verdad en plantillas en español.
    .replace(/&(aacute|eacute|iacute|oacute|uacute|ntilde|uuml|Aacute|Eacute|Iacute|Oacute|Uacute|Ntilde|Uuml);/g,
      (_m, e) => ({
        aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
        Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
      } as Record<string, string>)[e] ?? _m)
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    // &amp; va AL FINAL: si se decodifica primero, un "&amp;lt;" terminaría
    // convertido en "<" en vez de quedar como el texto "&lt;".
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    // Primero se recorta cada línea (una línea con solo espacios cuenta como
    // vacía), y recién después se colapsan los saltos: al revés quedaban
    // huecos de 3 y 4 líneas en blanco.
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) Exigir un usuario real logueado (la anon key sola ya NO alcanza)
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to, subject, html, empresa_id: empresaSolicitada } = body;
    if (!to || !subject) {
      return new Response(
        JSON.stringify({ ok: false, error: "Faltan parámetros: to, subject" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Resolver la empresa del usuario autenticado. La única excepción es
    // un platform admin impersonando desde el Panel Pixit — empresaPermitida
    // solo la honra si confirma que es platform admin de verdad.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from("user_profiles")
      .select("empresa_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) {
      return new Response(JSON.stringify({ ok: false, error: "Usuario sin empresa" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { empresaId } = await empresaPermitida(admin, userData.user.id, profile.empresa_id as string, empresaSolicitada);

    // 3) Límite simple: máx 60 correos por empresa por hora
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .gte("creado_en", haceUnaHora);
    if ((count ?? 0) >= 60) {
      return new Response(JSON.stringify({ ok: false, error: "Límite de envíos por hora alcanzado" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Versión de texto de la parte HTML, para que el correo viaje como
    // multipart/alternative (ver htmlATexto arriba). Si el HTML viene vacío,
    // se manda el asunto como cuerpo antes que una parte de texto en blanco.
    const textoPlano = htmlATexto(html || "") || subject;

    // 4) Toda la identidad se resuelve en el servidor. El cliente no puede
    // escoger un From arbitrario manipulando el body.
    const { data: configRows } = await admin
      .from("erp_data")
      .select("clave,datos")
      .eq("empresa_id", empresaId)
      .in("clave", ["tp_smtp_config", "tp_config"]);

    const configPorClave = new Map((configRows ?? []).map((r) => [r.clave, r.datos]));
    let smtpCfg = configPorClave.get("tp_smtp_config") as SmtpConfig | undefined;
    const tallerCfg = configPorClave.get("tp_config") as TallerConfig | undefined;

    // Un SMTP antiguo no se activa por la mera existencia de host/password.
    // Debe haberse seleccionado explícitamente en Configuración > Correo.
    const usarSmtp = smtpCfg?.mode === "smtp";
    if (usarSmtp) {
      // La contraseña se guarda cifrada en Supabase Vault. Solo esta función,
      // usando service_role, puede solicitar una copia descifrada para el
      // envío. Nunca vuelve al navegador ni queda en `erp_data`.
      const { data: deliveryConfig, error: deliveryError } = await admin.rpc(
        "get_smtp_config_for_delivery",
        { p_empresa: empresaId },
      );
      if (deliveryError) throw new Error(`No se pudo abrir la credencial SMTP: ${deliveryError.message}`);
      smtpCfg = deliveryConfig as SmtpConfig | undefined;
    }
    // En modo administrado, el dominio técnico siempre pertenece a Pixit.
    // Ningún tenant puede consumir dominios de la cuenta Resend central ni
    // elegir un From arbitrario. El nombre visible y Reply-To sí son propios.
    const fromName = texto(smtpCfg?.from_name) || texto(tallerCfg?.nombre) || "Pixit";
    const replyTo = texto(smtpCfg?.reply_to)
      || texto(smtpCfg?.from_email)
      || texto(tallerCfg?.from_email)
      || texto(tallerCfg?.email);

    let sendError: string | null = null;
    let usedChannel: "smtp-gateway" | "resend-pixit" = "resend-pixit";

    if (usarSmtp) {
      usedChannel = "smtp-gateway";
      const smtpHost = texto(smtpCfg?.host);
      // Igual que Gestioo: si "Usuario" está vacío, la casilla remitente es
      // también el login. Es la convención habitual en cPanel/Plesk.
      const smtpUser = texto(smtpCfg?.user) || texto(smtpCfg?.from_email);
      const smtpPassword = smtpCfg?.password ?? "";
      const smtpFrom = texto(smtpCfg?.from_email) || smtpUser;

      if (!smtpHost || !smtpUser || !smtpPassword || !smtpFrom) {
        sendError = "SMTP seleccionado, pero faltan servidor, correo/usuario o contraseña.";
      } else {
        const requestId = crypto.randomUUID();
        const result = await enviarViaGateway({
          requestId,
          tenantId: empresaId,
          smtp: {
            host: smtpHost,
            port: Number(smtpCfg?.port || 465),
            secure: smtpCfg?.secure ?? Number(smtpCfg?.port || 465) === 465,
            user: smtpUser,
            password: smtpPassword,
            fromName,
            fromEmail: smtpFrom,
            replyTo: replyTo || smtpFrom,
          },
          message: {
            to,
            subject,
            text: textoPlano,
            html: html || "",
          },
        });
        if (!result.ok) sendError = result.error || "El gateway SMTP no pudo entregar el correo.";
      }
    } else {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = texto(Deno.env.get("PIXIT_FROM_EMAIL"));
      usedChannel = "resend-pixit";
      if (!resendKey) {
        sendError = "RESEND_API_KEY no está configurada en el servidor de Pixit.";
      } else if (!fromEmail) {
        sendError = "PIXIT_FROM_EMAIL no está configurado. Verifica una vez el dominio de Pixit y define su remitente administrado.";
      } else {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            reply_to: replyTo || undefined,
            to: [to],
            subject,
            html: html || "",
            text: textoPlano,
            tags: [{ name: "empresa_id", value: empresaId }],
          }),
        });
        const data = await res.json();
        if (!res.ok) sendError = data.message || "Error en Resend";
      }
    }

    // 5) Log de auditoría (siempre, éxito o error)
    await admin.from("email_log").insert({
      empresa_id: empresaId,
      user_id: userData.user.id,
      canal: usedChannel,
      destinatario: to,
      asunto: subject,
      ok: !sendError,
      error: sendError,
    });

    if (sendError) {
      return new Response(JSON.stringify({ ok: false, error: sendError }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // "accepted" significa que el proveedor aceptó el mensaje para entrega;
    // no permite afirmar que ya llegó a la bandeja del destinatario.
    return new Response(JSON.stringify({ ok: true, status: "accepted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const motivo = String((error as Error)?.message || error);
    // Un fallo acá (antes de llegar al envío) no dejaba ningún rastro: el
    // taller veía "no se pudo enviar" y no había forma de saber por qué,
    // porque email_log solo se escribía después de intentar el envío.
    // Se registra con lo que se haya alcanzado a resolver del contexto.
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: { user } } = await createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      }).auth.getUser();
      if (user) {
        const { data: perfil } = await admin
          .from("user_profiles").select("empresa_id").eq("id", user.id).maybeSingle();
        if (perfil?.empresa_id) {
          await admin.from("email_log").insert({
            empresa_id: perfil.empresa_id,
            user_id: user.id,
            canal: "error",
            destinatario: "—",
            asunto: "(falló antes de enviarse)",
            ok: false,
            error: motivo,
          });
        }
      }
    } catch { /* registrar el fallo nunca debe tapar el fallo original */ }

    return new Response(
      JSON.stringify({ ok: false, error: motivo }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
