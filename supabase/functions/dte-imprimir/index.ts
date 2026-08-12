// Devuelve la representación impresa de un documento ya emitido, en el formato
// de una impresora térmica de 80 mm.
//
// La genera SimpleAPI a partir del XML del DTE. Se usa su generador y no uno
// propio porque la boleta impresa lleva el TIMBRE ELECTRÓNICO —el código PDF417
// que el SII exige— y equivocarse ahí es un problema de fiscalización, no de
// estética.
//
// El PDF se guarda la primera vez y después se sirve desde el bucket: reimprimir
// es algo que pasa seguido (se corta el papel, el cliente lo pide de nuevo) y no
// tiene sentido gastar una llamada a la API cada vez, sobre todo con su límite
// de 3 por segundo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SIMPLEAPI_KEY = Deno.env.get("SIMPLEAPI_KEY")!;

// Hay versiones para 58 mm, 80 mm y carta. 80 mm es el ancho habitual de las
// impresoras de punto de venta.
const URL_IMPRESION = "https://api.simpleapi.cl/api/v1/impresion/base64/80mm";

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
    .from("user_profiles").select("empresa_id, activo, nombre").eq("id", data.user.id).maybeSingle();
  if (!perfil?.empresa_id || perfil.activo === false) return null;
  return { empresaId: perfil.empresa_id as string, nombre: String(perfil.nombre ?? "") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  const quien = await identificar(req);
  if (!quien) return json({ ok: false, error: "No autorizado" }, 401);

  let entrada: { folio?: number; tipo_dte?: number; regenerar?: boolean; forma_pago?: string };
  try { entrada = await req.json(); } catch { return json({ ok: false, error: "Cuerpo inválido" }, 400); }
  if (!entrada?.folio || !entrada?.tipo_dte) {
    return json({ ok: false, error: "Faltan folio y tipo de documento" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // El filtro por empresa es lo que impide que alguien pida la boleta de otro
  // taller pasando un folio cualquiera.
  const { data: doc } = await admin
    .from("dte_documentos")
    .select("id, xml_ruta, pdf_ruta, ambiente, estado")
    .eq("empresa_id", quien.empresaId)
    .eq("folio", entrada.folio)
    .eq("tipo_dte", entrada.tipo_dte)
    .maybeSingle();

  if (!doc) return json({ ok: false, error: "No existe ese documento" }, 404);
  if (!doc.xml_ruta) return json({ ok: false, error: "Ese documento no llegó a generarse" }, 400);

  // Ya impreso antes: se sirve el guardado.
  if (doc.pdf_ruta && !entrada.regenerar && !entrada.forma_pago) {
    const guardado = await admin.storage.from("dte-privado").download(doc.pdf_ruta);
    if (!guardado.error && guardado.data) {
      const bytes = new Uint8Array(await guardado.data.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return json({ ok: true, pdf_base64: btoa(bin), desde_cache: true });
    }
  }

  const { data: empresa } = await admin
    .from("empresas")
    .select("numero_resolucion, fecha_resolucion, unidad_sii")
    .eq("id", quien.empresaId).maybeSingle();

  const xml = await admin.storage.from("dte-privado").download(doc.xml_ruta);
  if (xml.error || !xml.data) return json({ ok: false, error: "No se pudo leer el documento" }, 500);

  const form = new FormData();
  // Solo los campos que declara el contrato de este endpoint. `Ejecutivo` es
  // quien atendió: sale impreso y ayuda a rastrear una venta.
  // `FormaPago` y `CondicionVenta` NO están declarados para 80 mm — sí para el
  // formato carta. Se mandan igual porque probarlo no cuesta nada: imprimir no
  // gasta folios ni toca al SII. Si la plantilla los ignora, no hacen daño.
  form.append("input", JSON.stringify({
    NumeroResolucion: empresa?.numero_resolucion ?? 0,
    FechaResolucion: empresa?.fecha_resolucion ?? "",
    UnidadSII: empresa?.unidad_sii ?? "",
    Ejecutivo: quien.nombre,
    Hora: new Date().toTimeString().slice(0, 5),
    ...(entrada.forma_pago
      ? { FormaPago: entrada.forma_pago, CondicionVenta: entrada.forma_pago }
      : {}),
  }));
  // Ojo: acá el archivo se llama `fileEnvio`, no `files` como en los otros
  // endpoints, y no lleva certificado — imprimir no requiere firmar nada.
  form.append("fileEnvio", new File([await xml.data.arrayBuffer()], "dte.xml"));

  const res = await fetch(URL_IMPRESION, {
    method: "POST", headers: { Authorization: SIMPLEAPI_KEY }, body: form,
  });
  const texto = await res.text();
  if (!res.ok) return json({ ok: false, error: `SimpleAPI ${res.status}: ${texto.slice(0, 600)}` }, 502);

  // La respuesta puede venir como base64 pelado o dentro de un JSON.
  let base64 = texto.trim().replace(/^"|"$/g, "");
  try {
    const j = JSON.parse(texto);
    base64 = String(j?.pdf ?? j?.base64 ?? j?.archivo ?? base64);
  } catch { /* vino como texto plano */ }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64) || base64.length < 100) {
    return json({ ok: false, error: `Respuesta inesperada al imprimir: ${texto.slice(0, 300)}` }, 502);
  }

  const limpio = base64.replace(/\s/g, "");
  const binario = atob(limpio);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  const ruta = `${quien.empresaId}/pdf/${doc.ambiente}-${entrada.tipo_dte}-${entrada.folio}.pdf`;
  await admin.storage.from("dte-privado")
    .upload(ruta, bytes, { contentType: "application/pdf", upsert: true });
  await admin.from("dte_documentos")
    .update({ pdf_ruta: ruta, actualizado_en: new Date().toISOString() })
    .eq("id", doc.id);

  return json({ ok: true, pdf_base64: limpio, desde_cache: false });
});
