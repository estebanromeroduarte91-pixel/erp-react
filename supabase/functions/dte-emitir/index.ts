// Emite un documento tributario electrónico a través de SimpleAPI.
//
// Contrato real de SimpleAPI (POST /api/v1/dte/generar), que NO es un JSON
// normal: es multipart/form-data con
//   - un campo `input` que lleva el JSON del documento COMO TEXTO
//   - dos campos `files`, con el MISMO nombre, en orden estricto:
//     primero el certificado .pfx y después el CAF.
// El orden importa: la API los toma por posición, no por nombre de archivo.
//
// El RUT del certificado y el del emisor son DISTINTOS y así debe ser: el
// certificado es de la persona natural que firma (el representante legal) y el
// emisor es la empresa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SIMPLEAPI_KEY = Deno.env.get("SIMPLEAPI_KEY")!;

const URL_GENERAR = "https://api.simpleapi.cl/api/v1/dte/generar";
const TASA_IVA = 19;

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

interface ItemEntrada {
  nombre: string
  descripcion?: string
  cantidad: number
  unidad?: string
  precio: number
  descuento?: number
  exento?: boolean
}

interface Entrada {
  tipo_dte: number
  venta_id?: string
  receptor?: {
    rut?: string; razon_social?: string; direccion?: string
    comuna?: string; giro?: string; contacto?: string
  }
  items: ItemEntrada[]
}

const rutSii = (v: string) => {
  const limpio = String(v ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  return limpio.length < 2 ? limpio : `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
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

  if (!perfil?.empresa_id || perfil.activo === false) return null;
  // Emitir es una tarea de mostrador: la hace quien vende.
  if (!["admin", "encargado", "vendedor"].includes(String(perfil.role))) return null;
  return { empresaId: perfil.empresa_id as string };
}

// En una BOLETA los precios que se muestran ya incluyen IVA — es el precio que
// el cliente ve en la vitrina y el que Pixit guarda en `precio_venta`. En una
// FACTURA, en cambio, las líneas van netas y el IVA se suma aparte.
// Confundir las dos cosas da documentos con totales que no cuadran, así que el
// cálculo vive acá, en el servidor, y no en la pantalla.
function calcular(tipo: number, items: ItemEntrada[]) {
  const esBoleta = tipo === 39 || tipo === 41;
  const exento = tipo === 34 || tipo === 41;

  const detalles = items.map((it) => {
    const cantidad = Number(it.cantidad) || 0;
    const bruto = (Number(it.precio) || 0) * cantidad - (Number(it.descuento) || 0);
    // En boleta el precio trae el IVA adentro; se descuenta para obtener el neto.
    const montoItem = esBoleta && !exento ? Math.round(bruto / (1 + TASA_IVA / 100)) : Math.round(bruto);
    return {
      IndicadorExento: it.exento || exento ? 1 : 0,
      Nombre: String(it.nombre ?? "").slice(0, 80),
      Descripcion: String(it.descripcion ?? "").slice(0, 1000),
      Cantidad: cantidad,
      UnidadMedida: it.unidad ?? "un",
      Precio: Number(it.precio) || 0,
      Descuento: Number(it.descuento) || 0,
      Recargo: 0,
      MontoItem: montoItem,
    };
  });

  const neto = detalles.reduce((s, d) => s + (d.IndicadorExento ? 0 : d.MontoItem), 0);
  const iva = exento ? 0 : Math.round(neto * TASA_IVA / 100);
  const total = neto + iva + detalles.reduce((s, d) => s + (d.IndicadorExento ? d.MontoItem : 0), 0);

  return { detalles, neto, iva, total, esBoleta, exento };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  const quien = await identificar(req);
  if (!quien) return json({ ok: false, error: "No autorizado" }, 401);

  let entrada: Entrada;
  try {
    entrada = await req.json();
  } catch {
    return json({ ok: false, error: "Cuerpo inválido" }, 400);
  }
  if (!entrada?.tipo_dte) return json({ ok: false, error: "Falta el tipo de documento" }, 400);
  if (!entrada?.items?.length) return json({ ok: false, error: "El documento no tiene líneas de detalle" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: empresa } = await admin
    .from("empresas")
    .select("rut, razon_social, giro, direccion_origen, comuna_origen, acteco, dte_ambiente")
    .eq("id", quien.empresaId).maybeSingle();

  const faltan = ["rut", "razon_social", "giro", "direccion_origen", "comuna_origen", "acteco"]
    .filter((k) => !String((empresa as Record<string, unknown> | null)?.[k] ?? "").trim());
  if (faltan.length) {
    return json({ ok: false, error: `Faltan datos tributarios de la empresa: ${faltan.join(", ")}. Completalos en Configuración → Tributario.` }, 400);
  }

  const { data: fichaCert } = await admin
    .from("dte_certificados").select("ruta, rut_firmante, vence_el").eq("empresa_id", quien.empresaId).maybeSingle();
  if (!fichaCert) return json({ ok: false, error: "No hay certificado digital cargado." }, 400);
  if (fichaCert.vence_el < new Date().toISOString().slice(0, 10)) {
    return json({ ok: false, error: `El certificado venció el ${fichaCert.vence_el}.` }, 400);
  }

  const { data: clave, error: errClave } = await admin.rpc("fn_dte_leer_clave", { p_empresa: quien.empresaId });
  if (errClave || !clave) return json({ ok: false, error: "No se pudo leer la clave del certificado." }, 500);

  // El folio se toma acá y no antes: es un recurso que se consume.
  const { data: folios, error: errFolio } = await admin
    .rpc("fn_dte_tomar_folio_srv", { p_empresa: quien.empresaId, p_tipo_dte: entrada.tipo_dte });
  if (errFolio) return json({ ok: false, error: errFolio.message }, 400);
  const asignado = Array.isArray(folios) ? folios[0] : folios;
  if (!asignado?.folio) return json({ ok: false, error: "No se pudo asignar un folio." }, 400);

  const { folio, ruta: rutaCaf, ambiente } = asignado as { folio: number; ruta: string; ambiente: string };

  const { detalles, neto, iva, total, esBoleta, exento } = calcular(entrada.tipo_dte, entrada.items);
  const hoy = new Date().toISOString().slice(0, 10);

  // La boleta y la factura no comparten encabezado: la boleta lleva
  // IndicadorServicio y los datos del emisor en campos propios
  // (RazonSocialBoleta / GiroBoleta); la factura lleva FormaPago y vencimiento.
  const identificacion = esBoleta
    ? {
        TipoDTE: entrada.tipo_dte,
        Folio: folio,
        FechaEmision: hoy,
        IndicadorServicio: 3, // ventas y servicios
        ...(exento ? {} : { IndicadorMontosNetosBoleta: 2 }),
      }
    : {
        TipoDTE: entrada.tipo_dte,
        Folio: folio,
        FechaEmision: hoy,
        FechaVencimiento: hoy,
        FormaPago: 1, // contado
      };

  const emisorBase = {
    Rut: rutSii(String(empresa!.rut)),
    ActividadEconomica: String(empresa!.acteco).split(/[^0-9]+/).filter(Boolean).map(Number),
    DireccionOrigen: empresa!.direccion_origen,
    ComunaOrigen: empresa!.comuna_origen,
    Telefono: [],
  };
  const emisor = esBoleta
    ? { ...emisorBase, RazonSocialBoleta: empresa!.razon_social, GiroBoleta: empresa!.giro }
    : { ...emisorBase, RazonSocial: empresa!.razon_social, Giro: empresa!.giro };

  // 66666666-6 es el RUT genérico para boleta sin datos del cliente.
  const r = entrada.receptor ?? {};
  const receptor = {
    Rut: rutSii(r.rut || "66666666-6"),
    RazonSocial: r.razon_social || "Consumidor final",
    Direccion: r.direccion || "",
    Comuna: r.comuna || "",
    Giro: r.giro || "",
    Contacto: r.contacto || "",
  };

  const documento = {
    Documento: {
      Encabezado: {
        IdentificacionDTE: identificacion,
        Emisor: emisor,
        Receptor: receptor,
        RutSolicitante: "",
        Transporte: null,
        Totales: exento
          ? { MontoTotal: total }
          : { MontoNeto: neto, TasaIVA: TASA_IVA, IVA: iva, MontoTotal: total },
      },
      Detalles: detalles,
      Referencias: [],
      DescuentosRecargos: [],
    },
    Certificado: {
      Rut: rutSii(String(fichaCert.rut_firmante)),
      Password: clave,
    },
  };

  // Deja el rastro ANTES de llamar. Si SimpleAPI falla, el folio ya se consumió
  // y un folio saltado hay que poder explicárselo al SII: sin esta fila, sería
  // un hueco sin causa conocida.
  const { data: filaDte } = await admin.from("dte_documentos").insert({
    empresa_id: quien.empresaId,
    venta_id: entrada.venta_id ?? null,
    tipo_dte: entrada.tipo_dte,
    folio,
    ambiente,
    estado: "error",
    ultimo_error: "Emisión iniciada, sin respuesta todavía",
    neto, iva, total,
    receptor_rut: receptor.Rut,
    receptor_razon_social: receptor.RazonSocial,
  }).select("id").single();

  async function marcarError(motivo: string) {
    if (filaDte?.id) {
      await admin.from("dte_documentos")
        .update({ ultimo_error: motivo.slice(0, 2000), actualizado_en: new Date().toISOString() })
        .eq("id", filaDte.id);
    }
  }

  const [cert, caf] = await Promise.all([
    admin.storage.from("dte-privado").download(fichaCert.ruta),
    admin.storage.from("dte-privado").download(rutaCaf),
  ]);
  if (cert.error || !cert.data) { await marcarError("No se pudo leer el certificado"); return json({ ok: false, error: "No se pudo leer el certificado" }, 500); }
  if (caf.error || !caf.data)   { await marcarError("No se pudo leer el CAF"); return json({ ok: false, error: "No se pudo leer el CAF" }, 500); }

  const form = new FormData();
  form.append("input", JSON.stringify(documento));
  // Los dos van con el MISMO nombre de campo y en este orden exacto:
  // certificado primero, CAF después. La API los toma por posición.
  form.append("files", new File([await cert.data.arrayBuffer()], "certificado.pfx"));
  form.append("files", new File([await caf.data.arrayBuffer()], "caf.xml"));

  let respuesta: Response;
  try {
    respuesta = await fetch(URL_GENERAR, {
      method: "POST",
      headers: { Authorization: SIMPLEAPI_KEY },
      body: form,
    });
  } catch (e) {
    const motivo = `No se pudo contactar a SimpleAPI: ${(e as Error).message}`;
    await marcarError(motivo);
    return json({ ok: false, error: motivo, folio }, 502);
  }

  // Los BYTES tal cual, sin decodificar. El XML del SII viene en ISO-8859-1;
  // pasarlo por `res.text()` y volver a codificarlo convierte cada acentuada en
  // dos bytes, rompe la firma y el esquema, y el SII lo rechaza con un mensaje
  // que no menciona la codificación. Pasó con el giro "Reparación de artículos
  // electrónicos" en el primer envío.
  const bytes = await respuesta.arrayBuffer();
  const texto = new TextDecoder("iso-8859-1").decode(bytes);
  if (!respuesta.ok) {
    const motivo = `SimpleAPI ${respuesta.status}: ${texto.slice(0, 1000)}`;
    await marcarError(motivo);
    return json({ ok: false, error: motivo, folio }, 502);
  }

  // La respuesta es el XML del DTE ya timbrado y firmado.
  const rutaXml = `${quien.empresaId}/dte/${ambiente}-${entrada.tipo_dte}-${folio}.xml`;
  await admin.storage.from("dte-privado")
    .upload(rutaXml, bytes, { contentType: "application/xml", upsert: true });

  await admin.from("dte_documentos").update({
    estado: "generado",
    xml_ruta: rutaXml,
    ultimo_error: null,
    actualizado_en: new Date().toISOString(),
  }).eq("id", filaDte!.id);

  return json({ ok: true, folio, tipo_dte: entrada.tipo_dte, ambiente, neto, iva, total });
});
