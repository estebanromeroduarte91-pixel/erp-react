// Pregunta al SII qué pasó con los sobres ya enviados.
//
// Recibir un TrackID NO significa que el documento esté aceptado: significa que
// el SII recibió el sobre y lo va a revisar. La aceptación o el rechazo llegan
// después, y solo se saben preguntando por ese TrackID.
//
// Sin este paso, `dte_documentos` se quedaría para siempre en "enviado" y no
// habría forma de enterarse de un rechazo — que es justamente lo que hay que
// corregir a tiempo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SIMPLEAPI_KEY = Deno.env.get("SIMPLEAPI_KEY")!;
const CRON_TOKEN = Deno.env.get("DTE_CRON_TOKEN") ?? "";

const URL_CONSULTA = "https://api.simpleapi.cl/api/v1/consulta/envio";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function secretosIguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function autorizado(req: Request): Promise<boolean> {
  const tokenCron = req.headers.get("x-cron-token") ?? "";
  if (CRON_TOKEN && tokenCron && secretosIguales(tokenCron, CRON_TOKEN)) return true;

  const cabecera = req.headers.get("Authorization") ?? "";
  const jwt = cabecera.replace("Bearer ", "").trim();
  if (!jwt || jwt === ANON_KEY) return false;
  if (jwt === SERVICE_ROLE_KEY) return true;

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: cabecera } },
  });
  const { data, error } = await userClient.auth.getUser(jwt);
  if (error || !data?.user) return false;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: perfil } = await admin
    .from("user_profiles").select("empresa_id, activo").eq("id", data.user.id).maybeSingle();
  return !!perfil?.empresa_id && perfil.activo !== false;
}

const rutSii = (v: string) => {
  const limpio = String(v ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  return limpio.length < 2 ? limpio : `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
};

// El formato exacto de la respuesta no está documentado, así que en vez de
// asumir una forma se buscan las señales del SII en el texto crudo. Ante la
// duda NO se cambia el estado: es preferible seguir preguntando a marcar como
// aceptado algo que no lo está.
function interpretar(texto: string): "aceptado" | "rechazado" | null {
  const t = texto.toUpperCase();
  if (/\bRCH\b|RECHAZAD|REPARO/.test(t)) return "rechazado";
  if (/\bEPR\b|\bACEPTADO\b|ACEPTADO CON REPAROS|\bDOK\b/.test(t)) return "aceptado";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  if (!await autorizado(req)) return json({ ok: false, error: "No autorizado" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: enviados } = await admin
    .from("dte_documentos")
    .select("id, empresa_id, track_id, tipo_dte, folio, ambiente")
    .eq("estado", "enviado")
    .not("track_id", "is", null)
    .limit(100);

  if (!enviados?.length) return json({ ok: true, consultados: 0, detalle: "Nada enviado pendiente de respuesta" });

  // Un TrackID cubre todo un sobre, así que se consulta una vez por TrackID y
  // el resultado se aplica a todos los documentos que fueron en él.
  const porTrack = new Map<string, typeof enviados>();
  for (const d of enviados) {
    const k = `${d.empresa_id}|${d.track_id}`;
    porTrack.set(k, [...(porTrack.get(k) ?? []), d]);
  }

  const resultados: unknown[] = [];

  for (const [clave, docs] of porTrack) {
    const [empresaId, trackId] = clave.split("|");
    try {
      const { data: empresa } = await admin
        .from("empresas").select("rut, dte_ambiente").eq("id", empresaId).maybeSingle();
      const { data: cert } = await admin
        .from("dte_certificados").select("ruta, rut_firmante").eq("empresa_id", empresaId).maybeSingle();
      if (!cert) throw new Error("No hay certificado cargado");

      const { data: clavePfx } = await admin.rpc("fn_dte_leer_clave", { p_empresa: empresaId });
      const bin = await admin.storage.from("dte-privado").download(cert.ruta);
      if (bin.error || !bin.data) throw new Error("No se pudo leer el certificado");

      const form = new FormData();
      form.append("input", JSON.stringify({
        Certificado: { Rut: rutSii(String(cert.rut_firmante)), Password: clavePfx },
        RutEmpresa: rutSii(String(empresa?.rut)),
        TrackId: Number(trackId),
        Ambiente: empresa?.dte_ambiente === "produccion" ? 1 : 0,
        // Las boletas viajan por un servidor distinto del SII y hay que
        // declararlo, o la consulta busca en el lugar equivocado.
        ServidorBoletaREST: docs.every(d => d.tipo_dte === 39 || d.tipo_dte === 41),
      }));
      form.append("files", new File([await bin.data.arrayBuffer()], "certificado.pfx"));

      const res = await fetch(URL_CONSULTA, {
        method: "POST", headers: { Authorization: SIMPLEAPI_KEY }, body: form,
      });
      const texto = await res.text();
      if (!res.ok) throw new Error(`SimpleAPI ${res.status}: ${texto.slice(0, 600)}`);

      const veredicto = interpretar(texto);
      if (veredicto) {
        await admin.from("dte_documentos").update({
          estado: veredicto,
          ultimo_error: veredicto === "rechazado" ? texto.slice(0, 2000) : null,
          actualizado_en: new Date().toISOString(),
        }).in("id", docs.map(d => d.id));
      }

      resultados.push({
        track_id: trackId,
        documentos: docs.length,
        veredicto: veredicto ?? "sin resolver todavía",
        respuesta: texto.slice(0, 400),
      });
    } catch (e) {
      resultados.push({ track_id: trackId, ok: false, error: (e as Error).message });
    }
  }

  console.log("dte-consultar", JSON.stringify(resultados));
  return json({ ok: true, resultados });
});
