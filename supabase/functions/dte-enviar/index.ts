// Manda al SII los documentos ya emitidos.
//
// Son dos llamadas encadenadas a SimpleAPI:
//   1. POST /api/v1/envio/generar  → arma un "sobre" con varios DTE
//   2. POST /api/v1/envio/enviar   → lo manda al SII y devuelve un TrackID
//
// Va por tandas y no por documento porque así lo recomienda SimpleAPI (una vez
// por hora). Eso además separa dos cosas que conviene tener separadas: el
// cliente se lleva su boleta en el momento —ya está timbrada y firmada— y el
// trámite con el SII ocurre después, sin hacer esperar a nadie en el mostrador.
//
// La llama el cron con `x-cron-token`, igual que woo-push.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SIMPLEAPI_KEY = Deno.env.get("SIMPLEAPI_KEY")!;
const CRON_TOKEN = Deno.env.get("DTE_CRON_TOKEN") ?? "";

const URL_SOBRE = "https://api.simpleapi.cl/api/v1/envio/generar";
const URL_ENVIAR = "https://api.simpleapi.cl/api/v1/envio/enviar";
// Valida un XML contra el esquema del SII y dice QUÉ está mal. Ojo: acá `input`
// es un ARCHIVO, no el JSON de texto que usan los demás endpoints.
const URL_VALIDADOR = "https://api.simpleapi.cl/api/v1/consulta/validador";

// RUT del SII como receptor del sobre. Es fijo para todo Chile.
const RUT_SII = "60803000-K";

// Cuántos documentos entran en un sobre. Un sobre gigante tarda más de lo que
// dura la función y además, si el SII lo rechaza, se cae la tanda entera.
const POR_SOBRE = 50;

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

// Devuelve los BYTES tal cual, sin decodificar.
//
// Esto no es un detalle: los documentos del SII vienen en ISO-8859-1
// (`<?xml version="1.0" encoding="ISO-8859-1"?>`). Si se los pasa por
// `res.text()` se decodifican como UTF-8 y al volver a codificarlos cada
// carácter acentuado se convierte en dos bytes distintos. El XML deja de
// coincidir con su firma y con su esquema, y el SII lo rechaza con un mensaje
// que no menciona la codificación por ningún lado ("extra data at end of
// complex element"). Pasó exactamente eso con el giro "Reparación de artículos
// electrónicos".
async function llamarBytes(url: string, input: unknown, archivos: { nombre: string; datos: ArrayBuffer }[]) {
  const form = new FormData();
  form.append("input", JSON.stringify(input));
  // Mismo orden que en la emisión: certificado primero, después el resto.
  for (const a of archivos) form.append("files", new File([a.datos], a.nombre));
  const res = await fetch(url, { method: "POST", headers: { Authorization: SIMPLEAPI_KEY }, body: form });
  const bytes = await res.arrayBuffer();
  if (!res.ok) {
    const texto = new TextDecoder("iso-8859-1").decode(bytes);
    throw new Error(`${url.split("/").pop()} ${res.status}: ${texto.slice(0, 800)}`);
  }
  return bytes;
}

/** Solo para mirar: nunca para reenviar. */
const comoTexto = (b: ArrayBuffer) => new TextDecoder("iso-8859-1").decode(b);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  if (!await autorizado(req)) return json({ ok: false, error: "No autorizado" }, 401);

  // Modo diagnóstico: arma el sobre y lo devuelve tal como lo entregó
  // SimpleAPI, SIN mandarlo al SII. Sirve para ver si lo que devuelve es XML
  // pelado o viene envuelto en algo — un sobre con datos de más al final es
  // justo lo que el SII rechaza por esquema.
  let soloSobre = false;
  let validar = false;
  try {
    const cuerpo = await req.json();
    soloSobre = cuerpo?.solo_sobre === true;
    validar = cuerpo?.validar === true;
  } catch { /* sin cuerpo, comportamiento normal */ }
  // Validar implica armar el sobre y no mandarlo.
  if (validar) soloSobre = true;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const resultados: unknown[] = [];

  // Se agrupa por empresa: cada una tiene su certificado, su resolución y su
  // ambiente, y un sobre no puede mezclar contribuyentes.
  const { data: pendientes } = await admin
    .from("dte_documentos")
    .select("id, empresa_id, folio, tipo_dte, ambiente, xml_ruta")
    // En diagnóstico también se miran los rechazados: son justamente los que
    // hay que volver a armar para entender qué salió mal.
    .in("estado", soloSobre ? ["generado", "rechazado"] : ["generado"])
    .not("xml_ruta", "is", null)
    .limit(POR_SOBRE * 4);

  if (!pendientes?.length) return json({ ok: true, enviados: 0, detalle: "Nada pendiente de envío" });

  const porEmpresa = new Map<string, typeof pendientes>();
  for (const d of pendientes) {
    const lista = porEmpresa.get(d.empresa_id) ?? [];
    if (lista.length < POR_SOBRE) lista.push(d);
    porEmpresa.set(d.empresa_id, lista);
  }

  for (const [empresaId, docs] of porEmpresa) {
    try {
      const { data: empresa } = await admin
        .from("empresas")
        .select("rut, dte_ambiente, numero_resolucion, fecha_resolucion")
        .eq("id", empresaId).maybeSingle();
      if (!empresa?.fecha_resolucion) throw new Error("Falta la fecha de resolución del SII en Configuración → Tributario");

      const { data: cert } = await admin
        .from("dte_certificados").select("ruta, rut_firmante").eq("empresa_id", empresaId).maybeSingle();
      if (!cert) throw new Error("No hay certificado digital cargado");

      const { data: clave } = await admin.rpc("fn_dte_leer_clave", { p_empresa: empresaId });
      if (!clave) throw new Error("No se pudo leer la clave del certificado");

      const certBin = await admin.storage.from("dte-privado").download(cert.ruta);
      if (certBin.error || !certBin.data) throw new Error("No se pudo leer el certificado");
      const certBuf = await certBin.data.arrayBuffer();

      const xmls: { nombre: string; datos: ArrayBuffer }[] = [];
      for (const d of docs) {
        const bin = await admin.storage.from("dte-privado").download(d.xml_ruta!);
        if (bin.error || !bin.data) throw new Error(`No se pudo leer el XML del folio ${d.folio}`);
        xmls.push({ nombre: `dte-${d.tipo_dte}-${d.folio}.xml`, datos: await bin.data.arrayBuffer() });
      }

      const certificado = { Rut: rutSii(String(cert.rut_firmante)), Password: clave };

      // Paso 1: el sobre.
      const sobre = await llamarBytes(URL_SOBRE, {
        Certificado: certificado,
        Caratula: {
          RutEmisor: rutSii(String(empresa.rut)),
          RutReceptor: RUT_SII,
          FechaResolucion: empresa.fecha_resolucion,
          NumeroResolucion: empresa.numero_resolucion ?? 0,
        },
      }, [{ nombre: "certificado.pfx", datos: certBuf }, ...xmls]);

      if (validar) {
        // Se validan las dos cosas por separado para saber si el problema está
        // en el sobre o en la boleta que va adentro.
        const validarUno = async (nombre: string, datos: ArrayBuffer) => {
          const f = new FormData();
          f.append("input", new File([datos], nombre));
          const res = await fetch(URL_VALIDADOR, {
            method: "POST", headers: { Authorization: SIMPLEAPI_KEY }, body: f,
          });
          return { que: nombre, status: res.status, respuesta: (await res.text()).slice(0, 900) };
        };
        resultados.push(await validarUno("sobre.xml", sobre));
        resultados.push(await validarUno(xmls[0].nombre, xmls[0].datos));
        continue;
      }

      if (soloSobre) {
        const txt = comoTexto(sobre);
        const cierre = txt.lastIndexOf("</EnvioBOLETA>");
        resultados.push({
          documentos: docs.length,
          largo: sobre.byteLength,
          // Un `<?xml` de más adentro del sobre es la causa clásica de
          // "extra data at end of complex element": el DTE se incrustó con su
          // propia declaración en vez de pelada.
          declaraciones_xml: (txt.match(/<\?xml/g) ?? []).length,
          aperturas_dte: (txt.match(/<DTE[ >]/g) ?? []).length,
          cierres_dte: (txt.match(/<\/DTE>/g) ?? []).length,
          sobra_al_final: cierre >= 0 ? JSON.stringify(txt.slice(cierre + 14)) : "no se encontró el cierre",
          caratula: txt.slice(txt.indexOf("<Caratula"), txt.indexOf("</Caratula>") + 11),
          // Cómo empieza el DTE incrustado dentro del sobre.
          tras_caratula: txt.slice(txt.indexOf("</Caratula>") + 11, txt.indexOf("</Caratula>") + 400),
          // Uno por documento: el giro es el campo con acentos, así que es
          // donde se ve si los bytes llegaron sanos o corrompidos.
          por_documento: docs.map((d, i) => {
            const x = comoTexto(xmls[i].datos);
            const g = x.indexOf("<GiroEmisor>");
            return {
              folio: d.folio,
              giro: g >= 0 ? x.slice(g, x.indexOf("</GiroEmisor>") + 13) : "(sin GiroEmisor)",
              sano: g >= 0 ? !x.slice(g, g + 80).includes("\uFFFD") : null,
            };
          }),
        });
        continue;
      }

      const rutaSobre = `${empresaId}/sobres/${Date.now()}.xml`;
      await admin.storage.from("dte-privado")
        .upload(rutaSobre, sobre, { contentType: "application/xml", upsert: true });

      await admin.from("dte_documentos")
        .update({ estado: "en_sobre", actualizado_en: new Date().toISOString() })
        .in("id", docs.map(d => d.id));

      // Paso 2: al SII.
      //
      // `Ambiente` 0 es certificación y 1 producción; `Tipo` 2 es boleta y 1 el
      // resto. Son los tres únicos campos que declara el contrato de este
      // endpoint.
      const esBoleta = docs.every(d => d.tipo_dte === 39 || d.tipo_dte === 41);
      const respuestaBytes = await llamarBytes(URL_ENVIAR, {
        Certificado: certificado,
        Ambiente: empresa.dte_ambiente === "produccion" ? 1 : 0,
        Tipo: esBoleta ? 2 : 1,
        // NO se manda `ServidorBoletaREST` acá: el contrato de este endpoint
        // solo declara Certificado, Ambiente y Tipo. Se probó agregarlo por
        // analogía con la consulta y no cambió nada — el TrackID siguió siendo
        // de 8 dígitos. Mandar campos inventados no ayuda y confunde el
        // diagnóstico.
        //
        // PENDIENTE CONOCIDO: con estos valores SimpleAPI entrega el
        // EnvioBOLETA al receptor tradicional (Palena/Maullín) en vez del REST
        // de boletas. Se detecta por el largo del TrackID: el del SII para
        // boleta tiene 15 dígitos y estos vienen con 8. Allá el sobre se valida
        // contra el esquema de EnvioDTE y se rechaza con "extra data at end of
        // complex element", sin importar qué tenga el documento.
      }, [
        { nombre: "certificado.pfx", datos: certBuf },
        // Los bytes originales, sin pasar por texto. Ver el comentario de
        // `llamarBytes`: recodificar acá fue lo que hizo que el SII rechazara
        // el primer envío.
        { nombre: "sobre.xml", datos: sobre },
      ]);
      const respuesta = comoTexto(respuestaBytes);

      // El TrackID puede venir como número suelto o dentro de un JSON.
      let trackId = respuesta.trim();
      try {
        const j = JSON.parse(respuesta);
        trackId = String(j?.trackId ?? j?.TrackId ?? j?.track_id ?? trackId);
      } catch { /* vino como texto plano */ }

      await admin.from("dte_documentos").update({
        estado: "enviado",
        track_id: trackId.slice(0, 100),
        ultimo_error: null,
        actualizado_en: new Date().toISOString(),
      }).in("id", docs.map(d => d.id));

      resultados.push({ empresa_id: empresaId, enviados: docs.length, track_id: trackId.slice(0, 100) });
    } catch (e) {
      const motivo = (e as Error).message;
      // En diagnóstico no se toca ningún estado: la idea es mirar, no cambiar.
      if (soloSobre || validar) { resultados.push({ empresa_id: empresaId, ok: false, error: motivo }); continue; }
      // Vuelven a `generado` para que el próximo intento los tome: quedaron
      // emitidos y válidos, lo que falló fue el trámite con el SII.
      await admin.from("dte_documentos").update({
        estado: "generado",
        ultimo_error: motivo.slice(0, 2000),
        actualizado_en: new Date().toISOString(),
      }).in("id", docs.map(d => d.id));
      resultados.push({ empresa_id: empresaId, ok: false, error: motivo });
    }
  }

  console.log("dte-enviar", JSON.stringify(resultados));
  return json({ ok: true, resultados });
});
