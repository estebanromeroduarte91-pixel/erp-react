// Recibe un archivo CAF del SII (el XML que autoriza un rango de folios) y lo
// deja disponible para emitir.
//
// Mismo motivo que el certificado para ser una Edge Function: el bucket
// `dte-privado` no tiene policies y el navegador no puede escribir en él.
//
// Y misma idea de validar antes de guardar. Un CAF cargado con el tipo de
// documento equivocado, o de otro RUT, o del ambiente que no es, produce
// documentos que el SII rechaza — y para entonces el folio ya se consumió.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

// Los tipos que Pixit sabe emitir hoy. Aceptar cualquier número dejaría cargar
// un CAF de un documento que la app no arma, y el folio quedaría inutilizable.
const TIPOS_SOPORTADOS: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta",
  39: "Boleta electrónica",
  41: "Boleta exenta",
  61: "Nota de crédito",
  56: "Nota de débito",
};

async function identificar(req: Request) {
  const cabecera = req.headers.get("Authorization") ?? "";
  const jwt = cabecera.replace("Bearer ", "").trim();
  if (!jwt || jwt === ANON_KEY) return null;

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: cabecera } },
  });
  const { data, error } = await userClient.auth.getUser(jwt);
  if (error || !data?.user) return null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: perfil } = await admin
    .from("user_profiles").select("empresa_id, role, activo").eq("id", data.user.id).maybeSingle();

  if (!perfil?.empresa_id || perfil.activo === false || perfil.role !== "admin") return null;
  return { empresaId: perfil.empresa_id as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  const quien = await identificar(req);
  if (!quien) return json({ ok: false, error: "Solo un administrador de la empresa puede cargar folios" }, 401);

  let archivo: File | null = null;
  try {
    const form = await req.formData();
    archivo = form.get("caf") as File | null;
  } catch {
    return json({ ok: false, error: "Se esperaba un formulario con el archivo CAF" }, 400);
  }
  if (!archivo) return json({ ok: false, error: "Falta el archivo CAF" }, 400);
  if (archivo.size > 256 * 1024) return json({ ok: false, error: "El archivo es demasiado grande para ser un CAF" }, 400);

  const xml = await archivo.text();

  let da: Record<string, unknown>;
  try {
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
    const doc = parser.parse(xml);
    // El SII entrega <AUTORIZACION><CAF><DA>…</DA></CAF></AUTORIZACION>.
    const caf = doc?.AUTORIZACION?.CAF ?? doc?.CAF;
    da = caf?.DA;
    if (!da) throw new Error("sin nodo DA");
  } catch {
    return json({
      ok: false,
      error: "Ese archivo no parece un CAF del SII. Tiene que ser el XML tal como lo descargaste, sin abrirlo ni volver a guardarlo.",
    }, 400);
  }

  const rutCaf = String(da.RE ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  const tipo = Number(da.TD);
  const rango = da.RNG as { D?: unknown; H?: unknown } | undefined;
  const desde = Number(rango?.D);
  const hasta = Number(rango?.H);

  if (!TIPOS_SOPORTADOS[tipo]) {
    return json({
      ok: false,
      error: `El CAF es del tipo de documento ${tipo}, que Pixit todavía no emite.`,
    }, 400);
  }
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta < desde) {
    return json({ ok: false, error: "El CAF no trae un rango de folios legible." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: empresa } = await admin
    .from("empresas").select("rut, dte_ambiente").eq("id", quien.empresaId).maybeSingle();

  const rutEmpresa = String(empresa?.rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (!rutEmpresa) {
    return json({ ok: false, error: "Primero completá el RUT de la empresa en Configuración → Tributario." }, 400);
  }
  if (rutEmpresa !== rutCaf) {
    return json({ ok: false, error: `El CAF es del RUT ${rutCaf} y la empresa tiene ${rutEmpresa}. No coinciden.` }, 400);
  }

  // El ambiente no viene dentro del archivo: un CAF de certificación y uno de
  // producción se ven igual. Se etiqueta con el ambiente en que está la empresa
  // AHORA, y por eso la pantalla avisa cuál es antes de cargar.
  const ambiente = String(empresa?.dte_ambiente ?? "certificacion");

  // Un rango que pisa a otro ya cargado significa folios repetidos ante el SII.
  const { data: choques } = await admin
    .from("dte_caf")
    .select("folio_desde, folio_hasta")
    .eq("empresa_id", quien.empresaId)
    .eq("tipo_dte", tipo)
    .eq("ambiente", ambiente)
    .lte("folio_desde", hasta)
    .gte("folio_hasta", desde);

  if (choques && choques.length > 0) {
    const c = choques[0];
    return json({
      ok: false,
      error: `Ese rango (${desde}-${hasta}) se cruza con uno ya cargado (${c.folio_desde}-${c.folio_hasta}). Cargar folios repetidos genera documentos duplicados ante el SII.`,
    }, 400);
  }

  const ruta = `${quien.empresaId}/caf/${ambiente}-${tipo}-${desde}-${hasta}.xml`;
  const { error: errSubida } = await admin.storage
    .from("dte-privado")
    .upload(ruta, new TextEncoder().encode(xml), { contentType: "application/xml", upsert: true });
  if (errSubida) return json({ ok: false, error: `No se pudo guardar el archivo: ${errSubida.message}` }, 500);

  const { error: errFila } = await admin.from("dte_caf").insert({
    empresa_id: quien.empresaId,
    tipo_dte: tipo,
    ambiente,
    folio_desde: desde,
    folio_hasta: hasta,
    ruta,
  });
  if (errFila) return json({ ok: false, error: `No se pudo registrar el CAF: ${errFila.message}` }, 500);

  return json({
    ok: true,
    tipo_dte: tipo,
    documento: TIPOS_SOPORTADOS[tipo],
    ambiente,
    folio_desde: desde,
    folio_hasta: hasta,
    cantidad: hasta - desde + 1,
  });
});
