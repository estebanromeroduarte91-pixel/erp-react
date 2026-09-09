import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("SUBSCRIPTION_CRON_TOKEN") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const PIXIT_FROM_EMAIL = Deno.env.get("PIXIT_FROM_EMAIL") ?? "";
const PIXIT_BILLING_EMAIL = Deno.env.get("PIXIT_BILLING_EMAIL") || PIXIT_FROM_EMAIL;

type EmpresaPorVencer = {
  id: string;
  nombre: string;
  owner_id: string;
  plan_estado: "trial" | "activo";
  trial_termina: string | null;
  suscripcion_termina: string | null;
};

function respuesta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escaparHtml(valor: string) {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fechaChile(fecha: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(fecha));
}

function plantilla(nombreEmpresa: string, vencimiento: string) {
  const empresa = escaparHtml(nombreEmpresa);
  const fecha = escaparHtml(fechaChile(vencimiento));
  const contacto = escaparHtml(PIXIT_BILLING_EMAIL);
  const enlaceContacto = `mailto:${encodeURIComponent(PIXIT_BILLING_EMAIL)}?subject=${encodeURIComponent(`Renovar Pixit — ${nombreEmpresa}`)}`;

  return {
    subject: `Tu acceso a Pixit vence el ${fechaChile(vencimiento)}`,
    text: `Hola ${nombreEmpresa},\n\nTu acceso a Pixit vence el ${fechaChile(vencimiento)}. Contáctanos antes de esa fecha para coordinar el pago y mantener tu cuenta activa.\n\nContacto: ${PIXIT_BILLING_EMAIL}\n\nEquipo Pixit`,
    html: `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">
          <tr><td style="padding:28px 30px 14px;font-size:28px;font-weight:800;letter-spacing:-1px;color:#111827">Pixit</td></tr>
          <tr><td style="padding:8px 30px 30px">
            <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff7ed;color:#c2410c;font-size:12px;font-weight:700">Aviso de vencimiento</div>
            <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.25;color:#111827">Tu acceso vence pronto</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4b5563">Hola <strong>${empresa}</strong>, quedan 3 días para que finalice tu acceso a Pixit.</p>
            <div style="margin:20px 0;padding:18px;border-radius:14px;background:#eff6ff;border:1px solid #dbeafe">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Fecha de vencimiento</div>
              <div style="margin-top:6px;font-size:20px;font-weight:800;color:#1d4ed8">${fecha}</div>
            </div>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#4b5563">Ponte en contacto con nosotros antes de esa fecha para coordinar el pago y mantener tu cuenta activa sin interrupciones.</p>
            <a href="${enlaceContacto}" style="display:inline-block;padding:12px 18px;border-radius:11px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">Contactar a Pixit</a>
            <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">También puedes escribirnos a ${contacto}.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return respuesta({ ok: false, error: "Método no permitido" }, 405);

  const token = req.headers.get("x-cron-token") ?? "";
  if (!CRON_TOKEN || token !== CRON_TOKEN) {
    return respuesta({ ok: false, error: "No autorizado" }, 401);
  }
  if (!RESEND_API_KEY || !PIXIT_FROM_EMAIL || !PIXIT_BILLING_EMAIL) {
    return respuesta({ ok: false, error: "Falta configurar el correo comercial de Pixit" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + 3 * 24 * 60 * 60 * 1000);
  const { data, error } = await admin
    .from("empresas")
    .select("id,nombre,owner_id,plan_estado,trial_termina,suscripcion_termina")
    .not("owner_id", "is", null)
    .or([
      `and(plan_estado.eq.trial,trial_termina.gt.${ahora.toISOString()},trial_termina.lte.${hasta.toISOString()})`,
      `and(plan_estado.eq.activo,suscripcion_termina.gt.${ahora.toISOString()},suscripcion_termina.lte.${hasta.toISOString()})`,
    ].join(","));

  if (error) return respuesta({ ok: false, error: error.message }, 500);

  let enviados = 0;
  let omitidos = 0;
  const errores: Array<{ empresa_id: string; error: string }> = [];

  for (const empresa of (data ?? []) as EmpresaPorVencer[]) {
    const esTrial = empresa.plan_estado === "trial";
    const vencimiento = esTrial ? empresa.trial_termina : empresa.suscripcion_termina;
    if (!vencimiento) continue;
    const tipo = esTrial ? "trial_3_dias" : "plan_3_dias";
    const { data: reserva, error: reservaError } = await admin
      .from("avisos_vencimiento_suscripcion")
      .insert({
        empresa_id: empresa.id,
        tipo,
        vencimiento,
        destinatario: "pendiente",
      })
      .select("id")
      .maybeSingle();

    if (reservaError?.code === "23505") {
      omitidos++;
      continue;
    }
    if (reservaError || !reserva) {
      errores.push({ empresa_id: empresa.id, error: reservaError?.message || "No se pudo reservar el aviso" });
      continue;
    }

    try {
      const { data: usuario, error: usuarioError } = await admin.auth.admin.getUserById(empresa.owner_id);
      const destinatario = usuario?.user?.email;
      if (usuarioError || !destinatario) throw new Error(usuarioError?.message || "El propietario no tiene correo");

      const mensaje = plantilla(empresa.nombre, vencimiento);
      const envio = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Pixit <${PIXIT_FROM_EMAIL}>`,
          reply_to: PIXIT_BILLING_EMAIL,
          to: [destinatario],
          subject: mensaje.subject,
          html: mensaje.html,
          text: mensaje.text,
          tags: [
            { name: "tipo", value: esTrial ? "vencimiento_trial" : "vencimiento_plan" },
            { name: "empresa_id", value: empresa.id },
          ],
        }),
      });
      const envioData = await envio.json().catch(() => ({}));
      if (!envio.ok) throw new Error(envioData.message || `Resend respondió HTTP ${envio.status}`);

      await admin.from("avisos_vencimiento_suscripcion").update({
        destinatario,
        estado: "enviado",
        enviado_en: new Date().toISOString(),
      }).eq("id", reserva.id);

      await admin.from("email_log").insert({
        empresa_id: empresa.id,
        user_id: empresa.owner_id,
        canal: "resend-pixit",
        destinatario,
        asunto: mensaje.subject,
        ok: true,
      });
      enviados++;
    } catch (e) {
      const motivo = String((e as Error)?.message || e);
      // Si falló el proveedor o faltó el correo, se libera la reserva para
      // que el próximo proceso diario pueda reintentar.
      await admin.from("avisos_vencimiento_suscripcion").delete().eq("id", reserva.id);
      await admin.from("email_log").insert({
        empresa_id: empresa.id,
        user_id: empresa.owner_id,
        canal: "resend-pixit",
        destinatario: "—",
        asunto: "Aviso de vencimiento de Pixit",
        ok: false,
        error: motivo,
      });
      errores.push({ empresa_id: empresa.id, error: motivo });
    }
  }

  return respuesta({ ok: errores.length === 0, revisados: data?.length ?? 0, enviados, omitidos, errores });
});
