import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
          client.send({ from: `${fromName} <${fromEmail}>`, to, subject, html: html || "" }),
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
          body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html: html || "" }),
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