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
import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "https://esm.sh/pdf-lib@1.17.1";
import { XMLParser } from "https://esm.sh/fast-xml-parser@5.2.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SIMPLEAPI_KEY = Deno.env.get("SIMPLEAPI_KEY")!;

// Hay versiones para 58 mm, 80 mm y carta. 80 mm es el ancho habitual de las
// impresoras de punto de venta.
const URL_IMPRESION = "https://api.simpleapi.cl/api/v1/impresion/base64/80mm";

type ConfigBoleta = {
  logoUrl?: string;
  boletaEstilo?: "moderna" | "clasica";
  boletaMostrarLogo?: boolean;
  boletaColor?: string;
  boletaContacto?: string;
  boletaPie?: string;
};

const aLista = <T>(valor: T | T[] | undefined): T[] => valor === undefined ? [] : Array.isArray(valor) ? valor : [valor];
const numero = (valor: unknown) => Number(valor ?? 0) || 0;
const dinero = (valor: unknown) => `$${Math.round(numero(valor)).toLocaleString("es-CL")}`;
const seguro = (valor: unknown) => String(valor ?? "").replace(/[^\x20-\xFF]/g, " ").replace(/\s+/g, " ").trim();

function colorHex(valor?: string): RGB {
  const hex = /^#[0-9a-f]{6}$/i.test(valor ?? "") ? valor!.slice(1) : "2563eb";
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

function lineas(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const palabras = seguro(texto).split(" ").filter(Boolean);
  if (!palabras.length) return [""];
  const salida: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const candidato = actual ? `${actual} ${palabra}` : palabra;
    if (fuente.widthOfTextAtSize(candidato, tamano) <= ancho) {
      actual = candidato;
      continue;
    }
    if (actual) salida.push(actual);
    actual = palabra;
  }
  if (actual) salida.push(actual);
  return salida;
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function pdfBoletaModerna(
  xmlBytes: ArrayBuffer,
  config: ConfigBoleta,
  resolucion: number,
  fechaResolucion: string,
  ejecutivo: string,
  formaPago: string,
): Promise<Uint8Array> {
  const xml = new TextDecoder("iso-8859-1").decode(xmlBytes);
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
  const parsed = parser.parse(xml);
  const dte = parsed?.DTE ?? parsed?.EnvioBOLETA?.SetDTE?.DTE;
  const documento = dte?.Documento;
  const encabezado = documento?.Encabezado;
  if (!encabezado) throw new Error("El XML no contiene un DTE imprimible");

  const id = encabezado.IdDoc ?? {};
  const emisor = encabezado.Emisor ?? {};
  const receptor = encabezado.Receptor ?? {};
  const totales = encabezado.Totales ?? {};
  const detalles = aLista<Record<string, unknown>>(documento.Detalle);

  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ancho = 80 / 25.4 * 72;
  const margen = 15;
  const contenido = ancho - margen * 2;
  const nombreAncho = contenido - 65;
  const altoDetalles = detalles.reduce((s, d) => s + Math.max(18, lineas(String(d.NmbItem ?? d.DscItem ?? "Item"), normal, 7.4, nombreAncho).length * 9 + 7), 0);
  const mostrarReceptor = seguro(receptor.RUTRecep) && seguro(receptor.RUTRecep) !== "66666666-6";
  const mostrarLogo = config.boletaMostrarLogo !== false && !!config.logoUrl;
  const alto = Math.max(470, 390 + altoDetalles + (mostrarLogo ? 35 : 0) + (mostrarReceptor ? 25 : 0));
  const page = pdf.addPage([ancho, alto]);
  const acento = colorHex(config.boletaColor);
  const gris = rgb(0.38, 0.42, 0.48);
  const claro = rgb(0.88, 0.9, 0.93);
  let y = alto - 18;

  const centrado = (texto: string, fuente: PDFFont, tamano: number, yy: number, color = rgb(0.06, 0.08, 0.12)) => {
    const limpio = seguro(texto);
    page.drawText(limpio, { x: (ancho - fuente.widthOfTextAtSize(limpio, tamano)) / 2, y: yy, size: tamano, font: fuente, color });
  };
  const separador = (yy: number, punteado = false) => page.drawLine({
    start: { x: margen, y: yy }, end: { x: ancho - margen, y: yy }, thickness: 0.6, color: punteado ? claro : rgb(0.16, 0.18, 0.22),
    dashArray: punteado ? [2, 2] : undefined,
  });

  if (mostrarLogo) {
    try {
      const respuestaLogo = await fetch(config.logoUrl!, { signal: AbortSignal.timeout(8_000) });
      if (respuestaLogo.ok) {
        const logoBytes = new Uint8Array(await respuestaLogo.arrayBuffer());
        const tipo = respuestaLogo.headers.get("content-type") ?? "";
        const imagen = tipo.includes("jpeg") || tipo.includes("jpg")
          ? await pdf.embedJpg(logoBytes)
          : await pdf.embedPng(logoBytes);
        const escala = Math.min(95 / imagen.width, 30 / imagen.height);
        const dims = imagen.scale(escala);
        page.drawImage(imagen, { x: (ancho - dims.width) / 2, y: y - dims.height, width: dims.width, height: dims.height });
        y -= dims.height + 8;
      }
    } catch { /* Un logo incompatible no puede impedir imprimir una boleta. */ }
  }

  if (!mostrarLogo) {
    centrado(seguro(emisor.RznSocEmisor) || "Comprobante de venta", negrita, 12, y - 4);
    y -= 18;
  }
  page.drawRectangle({ x: margen, y: y - 2, width: contenido, height: 2.5, color: acento });
  y -= 19;
  centrado(Number(id.TipoDTE) === 41 ? "BOLETA EXENTA ELECTRÓNICA" : "BOLETA ELECTRÓNICA", negrita, 8.5, y);
  y -= 25;
  centrado(`N° ${seguro(id.Folio)}`, negrita, 20, y, acento);
  y -= 18;
  centrado(`RUT ${seguro(emisor.RUTEmisor)}`, negrita, 8, y);
  y -= 12;
  for (const l of lineas(seguro(emisor.RznSocEmisor), negrita, 8, contenido)) {
    centrado(l, negrita, 8, y); y -= 10;
  }
  for (const l of lineas(seguro(emisor.GiroEmisor), normal, 7, contenido)) {
    centrado(l, normal, 7, y, gris); y -= 9;
  }
  const direccion = [emisor.DirOrigen, emisor.CmnaOrigen].map(seguro).filter(Boolean).join(", ");
  if (direccion) { centrado(direccion, normal, 7, y, gris); y -= 10; }
  y -= 3;
  separador(y, true);
  y -= 15;
  page.drawText("FECHA", { x: margen, y, size: 6.5, font: negrita, color: gris });
  page.drawText(seguro(id.FchEmis), { x: margen, y: y - 11, size: 8, font: normal });
  const hora = new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" });
  const horaAncho = normal.widthOfTextAtSize(hora, 8);
  page.drawText("HORA", { x: ancho - margen - Math.max(horaAncho, 24), y, size: 6.5, font: negrita, color: gris });
  page.drawText(hora, { x: ancho - margen - horaAncho, y: y - 11, size: 8, font: normal });
  y -= 28;

  if (mostrarReceptor) {
    page.drawText("CLIENTE", { x: margen, y, size: 6.5, font: negrita, color: gris });
    y -= 10;
    page.drawText(`${seguro(receptor.RznSocRecep)} · ${seguro(receptor.RUTRecep)}`, { x: margen, y, size: 7.5, font: normal });
    y -= 15;
  }

  page.drawText("DETALLE", { x: margen, y, size: 6.5, font: negrita, color: gris });
  page.drawText("TOTAL", { x: ancho - margen - negrita.widthOfTextAtSize("TOTAL", 6.5), y, size: 6.5, font: negrita, color: gris });
  y -= 7;
  separador(y);
  y -= 13;

  for (const d of detalles) {
    const cantidad = numero(d.QtyItem) || 1;
    const nombre = seguro(d.NmbItem ?? d.DscItem ?? "Item");
    const monto = dinero(d.MontoItem);
    const nombreLineas = lineas(`${cantidad} × ${nombre}`, normal, 7.4, nombreAncho);
    const inicio = y;
    for (const l of nombreLineas) { page.drawText(l, { x: margen, y, size: 7.4, font: normal }); y -= 9; }
    page.drawText(monto, { x: ancho - margen - negrita.widthOfTextAtSize(monto, 7.6), y: inicio, size: 7.6, font: negrita });
    y -= 8;
  }

  separador(y);
  y -= 15;
  const filaTotal = (etiqueta: string, valor: unknown, tamano = 8, fuerte = false, color = rgb(0.08, 0.1, 0.14)) => {
    const f = fuerte ? negrita : normal;
    const v = dinero(valor);
    page.drawText(etiqueta, { x: margen, y, size: tamano, font: f, color });
    page.drawText(v, { x: ancho - margen - f.widthOfTextAtSize(v, tamano), y, size: tamano, font: f, color });
    y -= tamano + 7;
  };
  if (numero(totales.MntNeto)) filaTotal("Neto", totales.MntNeto, 7.5);
  if (numero(totales.IVA)) filaTotal("IVA 19%", totales.IVA, 7.5);
  y -= 2;
  filaTotal("TOTAL", totales.MntTotal, 13, true, acento);

  if (formaPago || ejecutivo) {
    y -= 3; separador(y, true); y -= 14;
    if (formaPago) { page.drawText(`Medio de pago: ${seguro(formaPago)}`, { x: margen, y, size: 7, font: normal, color: gris }); y -= 10; }
    if (ejecutivo) { page.drawText(`Atendido por: ${seguro(ejecutivo)}`, { x: margen, y, size: 7, font: normal, color: gris }); y -= 10; }
  }

  y -= 4; separador(y, true); y -= 17;
  centrado(config.boletaPie || "Gracias por preferirnos", negrita, 8, y);
  y -= 12;
  if (config.boletaContacto) { centrado(config.boletaContacto, normal, 7, y, gris); y -= 11; }
  const anoResolucion = fechaResolucion ? String(fechaResolucion).slice(0, 4) : "";
  centrado(`Res. SII N° ${resolucion} ${anoResolucion ? `de ${anoResolucion}` : ""}`, normal, 6.4, y, gris);
  y -= 10;
  centrado("Verifique documento en www.sii.cl", normal, 6.4, y, gris);

  pdf.setTitle(`Boleta electrónica ${seguro(id.Folio)}`);
  pdf.setProducer("Pixit ERP");
  return await pdf.save();
}

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
  if (jwt === SERVICE_ROLE_KEY) {
    const empresaId = req.headers.get("x-empresa-id") ?? "";
    return empresaId ? { empresaId, nombre: "Prueba Pixit" } : null;
  }

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

  let entrada: { folio?: number; tipo_dte?: number; venta_id?: string; regenerar?: boolean; forma_pago?: string };
  try { entrada = await req.json(); } catch { return json({ ok: false, error: "Cuerpo inválido" }, 400); }
  if ((!entrada?.folio || !entrada?.tipo_dte) && !entrada?.venta_id) {
    return json({ ok: false, error: "Falta identificar el documento o la venta" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // El filtro por empresa es lo que impide que alguien pida la boleta de otro
  // taller pasando un folio cualquiera.
  let consultaDoc = admin
    .from("dte_documentos")
    .select("id, xml_ruta, pdf_ruta, ambiente, estado, folio, tipo_dte")
    .eq("empresa_id", quien.empresaId);
  consultaDoc = entrada.venta_id
    ? consultaDoc.eq("venta_id", entrada.venta_id)
    : consultaDoc.eq("folio", entrada.folio!).eq("tipo_dte", entrada.tipo_dte!);
  const { data: doc } = await consultaDoc.maybeSingle();

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

  const { data: filaConfig } = await admin
    .from("erp_data").select("datos")
    .eq("empresa_id", quien.empresaId).eq("clave", "tp_seg_config").maybeSingle();
  let config: ConfigBoleta = {};
  if (filaConfig?.datos && typeof filaConfig.datos === "object") config = filaConfig.datos as ConfigBoleta;
  else if (typeof filaConfig?.datos === "string") {
    try { config = JSON.parse(filaConfig.datos); } catch { /* configuración antigua inválida */ }
  }

  const xml = await admin.storage.from("dte-privado").download(doc.xml_ruta);
  if (xml.error || !xml.data) return json({ ok: false, error: "No se pudo leer el documento" }, 500);
  const xmlBytes = await xml.data.arrayBuffer();

  // Desde el 1 de enero de 2026 la Res. Ex. SII N° 207 dejó opcional el
  // PDF417 en la representación impresa de boletas. El timbre sigue intacto
  // dentro del XML firmado. Eso permite usar una plantilla clara y propia sin
  // modificar el DTE ni su validez tributaria. Facturas y el estilo clásico
  // continúan usando la representación de SimpleAPI.
  if ((doc.tipo_dte === 39 || doc.tipo_dte === 41) && config.boletaEstilo !== "clasica") {
    try {
      const bytes = await pdfBoletaModerna(
        xmlBytes,
        config,
        empresa?.numero_resolucion ?? 0,
        empresa?.fecha_resolucion ?? "",
        quien.nombre,
        entrada.forma_pago ?? "",
      );
      const ruta = `${quien.empresaId}/pdf/${doc.ambiente}-${doc.tipo_dte}-${doc.folio}.pdf`;
      await admin.storage.from("dte-privado").upload(ruta, bytes, { contentType: "application/pdf", upsert: true });
      await admin.from("dte_documentos").update({ pdf_ruta: ruta, actualizado_en: new Date().toISOString() }).eq("id", doc.id);
      return json({ ok: true, pdf_base64: base64(bytes), desde_cache: false, plantilla: "moderna" });
    } catch (e) {
      return json({ ok: false, error: `No se pudo construir la boleta: ${(e as Error).message}` }, 500);
    }
  }

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
  form.append("fileEnvio", new File([xmlBytes], "dte.xml"));

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

  const ruta = `${quien.empresaId}/pdf/${doc.ambiente}-${doc.tipo_dte}-${doc.folio}.pdf`;
  await admin.storage.from("dte-privado")
    .upload(ruta, bytes, { contentType: "application/pdf", upsert: true });
  await admin.from("dte_documentos")
    .update({ pdf_ruta: ruta, actualizado_en: new Date().toISOString() })
    .eq("id", doc.id);

  return json({ ok: true, pdf_base64: limpio, desde_cache: false });
});
