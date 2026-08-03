import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const { to, subject, html, from_name } = body;
    if (!to || !subject) {
      return new Response(
        JSON.stringify({ ok: false, error: "Faltan parámetros: to, subject" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Resolver la empresa del usuario autenticado (nunca desde el body)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from("user_profiles")
      .select("empresa_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    const empresaId = profile?.empresa_id;
    if (!empresaId) {
      return new Response(JSON.stringify({ ok: false, error: "Usuario sin empresa" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const fromName = from_name || "Pixit";
    const fromEmail = body.from || "onboarding@resend.dev";
    // Versión de texto de la parte HTML, para que el correo viaje como
    // multipart/alternative (ver htmlATexto arriba). Si el HTML viene vacío,
    // se manda el asunto como cuerpo antes que una parte de texto en blanco.
    const textoPlano = htmlATexto(html || "") || subject;

    // 4) SMTP: la config viene del servidor (erp_data de ESA empresa), nunca del body
    const { data: smtpRow } = await admin
      .from("erp_data")
      .select("datos")
      .eq("empresa_id", empresaId)
      .eq("clave", "tp_smtp_config")
      .maybeSingle();
    const smtpCfg = smtpRow?.datos as
      | { host?: string; port?: number; secure?: boolean; user?: string; password?: string }
      | undefined;

    let sendError: string | null = null;
    let usedChannel: "smtp" | "resend" = "resend";

    if (smtpCfg?.host && smtpCfg?.user && smtpCfg?.password) {
      usedChannel = "smtp";
      const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
      const client = new SMTPClient({
        connection: {
          hostname: smtpCfg.host,
          port: Number(smtpCfg.port || 465),
          tls: smtpCfg.secure !== false,
          auth: { username: smtpCfg.user, password: smtpCfg.password },
        },
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout: el servidor SMTP no respondió en 10s")), 10000)
      );
      try {
        await Promise.race([
          // denomailer manda multipart/alternative cuando recibe `content`
          // (texto) y `html` juntos.
          client.send({ from: `${fromName} <${fromEmail}>`, to, subject, content: textoPlano, html: html || "" }),
          timeout,
        ]);
        await client.close();
      } catch (smtpErr) {
        await client.close().catch(() => {});
        sendError = String(smtpErr?.message || smtpErr);
      }
    } else {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        sendError = "Sin configuración de correo (SMTP ni Resend)";
      } else {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html: html || "", text: textoPlano }),
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
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: String(error?.message || error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});