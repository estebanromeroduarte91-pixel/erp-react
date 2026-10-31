// Trae los correos nuevos de la casilla de cada taller a Conversaciones.
//
// La llaman el cron (cada 2 minutos, con `x-cron-token`) para todas las
// empresas con el correo activado, y la app con la sesión de la persona
// (botón "Actualizar") solo para su empresa. La lectura la hace el
// mail-gateway desde su IP fija, la misma que el hosting ya conoce por los
// envíos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaPermitida } from "../_shared/impersonacion.ts";
import { credencialCorreo, llamarGateway } from "../_shared/mailGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_TOKEN = Deno.env.get("CORREO_CRON_TOKEN") ?? "";
// Tope de vueltas por empresa y llamada: 3 × 30 correos. Lo que quede se trae
// en la siguiente revisión.
const MAX_VUELTAS = 3;

function responder(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function secretosIguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

type Estado = { empresa_id: string; imap_host: string | null; imap_port: number; uid_validity: number | null; ultimo_uid: number | null };

type Correo = {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  fromName: string | null;
  fromAddress: string | null;
  replyTo: string | null;
  to: string | null;
  subject: string;
  date: string;
  text: string;
  html: string | null;
  attachments: unknown[];
  automatico: boolean;
};

async function sincronizarEmpresa(admin: Admin, estado: Estado) {
  const empresaId = estado.empresa_id;
  const cred = await credencialCorreo(admin, empresaId);
  if ("error" in cred) {
    await admin.from("correo_entrante").update({ ultimo_error: cred.error, ultima_revision: new Date().toISOString() }).eq("empresa_id", empresaId);
    return { empresaId, ok: false, error: cred.error };
  }

  let uidValidity = estado.uid_validity;
  let ultimoUid = estado.ultimo_uid;
  let nuevos = 0;
  let omitidos = 0;
  let error: string | null = null;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const resultado = await llamarGateway("/v1/fetch", {
      requestId: crypto.randomUUID(),
      tenantId: empresaId,
      imap: { host: estado.imap_host || cred.host, port: estado.imap_port || 993, user: cred.user, password: cred.password },
      uidValidity,
      sinceUid: ultimoUid,
    });
    if (!resultado.ok) {
      error = resultado.error || "No se pudo leer la casilla.";
      break;
    }

    for (const correo of (resultado.messages ?? []) as Correo[]) {
      const contacto = (correo.replyTo || correo.fromAddress || "").toLowerCase();
      // Fuera: boletines y respuestas automáticas, y lo que manda la propia
      // casilla (copias de envíos de Pixit que algunos hostings dejan en INBOX).
      if (correo.automatico || !contacto || contacto === cred.fromEmail || correo.fromAddress === cred.fromEmail) {
        omitidos++;
        continue;
      }
      const { data: id, error: rpcError } = await admin.rpc("fn_conversacion_registrar_mensaje", {
        p_empresa: empresaId,
        p_canal: "email",
        p_contacto: contacto,
        p_contacto_nombre: correo.fromName ?? "",
        p_direccion: "entrante",
        p_mensaje: {
          // Sin Message-ID (raro, pero pasa) se usa uno sintético estable,
          // para que una revisión repetida no lo duplique.
          id_externo: correo.messageId || `<imap-${uidValidity ?? resultado.uidValidity}-${correo.uid}@pixit>`,
          en_respuesta_a: correo.inReplyTo,
          referencias: correo.references,
          de_nombre: correo.fromName,
          de_direccion: correo.fromAddress,
          para: correo.to,
          asunto: correo.subject,
          texto: correo.text,
          html: correo.html,
          adjuntos: correo.attachments ?? [],
          enviado_en: correo.date,
        },
      });
      if (rpcError) {
        error = `No se pudo guardar un correo: ${rpcError.message}`;
        break;
      }
      if (id) nuevos++;
    }
    if (error) break;

    uidValidity = resultado.uidValidity;
    ultimoUid = resultado.lastUid;
    // Se guarda el avance en cada vuelta: si la siguiente falla, no se
    // vuelve a pedir lo que ya entró.
    await admin.from("correo_entrante").update({
      uid_validity: uidValidity,
      ultimo_uid: ultimoUid,
      actualizado_en: new Date().toISOString(),
    }).eq("empresa_id", empresaId);
    if (!resultado.more) break;
  }

  await admin.from("correo_entrante").update({
    ultima_revision: new Date().toISOString(),
    ultimo_error: error,
  }).eq("empresa_id", empresaId);
  return { empresaId, ok: !error, nuevos, omitidos, error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const body = await req.json().catch(() => ({}));
    let soloEmpresa: string | null = null;

    // Va primero: el cron manda la anon key en Authorization solo para pasar
    // el control del gateway de Supabase (mismo esquema que woo-push).
    const tokenCron = req.headers.get("x-cron-token") ?? "";
    const esCron = !!CRON_TOKEN && !!tokenCron && secretosIguales(tokenCron, CRON_TOKEN);
    if (!esCron) {
      const cabecera = req.headers.get("Authorization") ?? "";
      const jwt = cabecera.replace("Bearer ", "").trim();
      if (!jwt || jwt === ANON_KEY) return responder({ ok: false, error: "No autenticado" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: cabecera } } });
      const { data, error } = await userClient.auth.getUser(jwt);
      if (error || !data?.user) return responder({ ok: false, error: "No autenticado" }, 401);
      const { data: perfil } = await admin
        .from("user_profiles").select("empresa_id,activo").eq("id", data.user.id).maybeSingle();
      if (!perfil?.empresa_id || perfil.activo === false) return responder({ ok: false, error: "Usuario sin empresa" }, 403);
      ({ empresaId: soloEmpresa } = await empresaPermitida(admin, data.user.id, perfil.empresa_id, body?.empresa_id));
    }

    let consulta = admin.from("correo_entrante")
      .select("empresa_id,imap_host,imap_port,uid_validity,ultimo_uid")
      .eq("activo", true);
    if (soloEmpresa) consulta = consulta.eq("empresa_id", soloEmpresa);
    const { data: estados, error } = await consulta;
    if (error) throw error;

    const resultados = [];
    // De a una: son pocas casillas y así ningún hosting recibe ráfagas.
    for (const estado of (estados ?? []) as Estado[]) {
      resultados.push(await sincronizarEmpresa(admin, estado));
    }

    if (soloEmpresa) {
      const r = resultados[0];
      if (!r) return responder({ ok: false, error: "El correo no está activado en Conversaciones." }, 400);
      return responder(r, r.ok ? 200 : 502);
    }
    return responder({ ok: true, empresas: resultados.length, resultados });
  } catch (error) {
    return responder({ ok: false, error: String((error as Error)?.message || error) }, 500);
  }
});
