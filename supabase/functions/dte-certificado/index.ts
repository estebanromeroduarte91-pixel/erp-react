// Recibe el certificado digital (.pfx) de un taller y lo deja guardado para
// poder emitir documentos tributarios.
//
// Por qué esto es una Edge Function y no una subida directa desde el navegador:
// el bucket `dte-privado` no tiene ninguna policy, así que `authenticated` no
// puede escribir en él. Es a propósito. El certificado es la firma legal del
// contribuyente; que el navegador nunca pueda leerlo ni escribirlo es la
// garantía de que no se filtra por un bug de la app.
//
// Además valida el archivo ANTES de guardarlo. Un .pfx con la clave equivocada
// guardado en silencio se descubre recién cuando falla la primera boleta, con
// un cliente esperando en el mostrador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "https://esm.sh/node-forge@1.3.1";

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

interface Identidad { empresaId: string; userId: string }

// Solo un admin de la empresa puede cargar el certificado. La anon key es
// pública y no vale como sesión, así que se rechaza explícitamente.
async function identificar(req: Request): Promise<Identidad | null> {
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
    .from("user_profiles")
    .select("empresa_id, role, activo")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!perfil?.empresa_id) return null;
  if (perfil.activo === false) return null;
  if (perfil.role !== "admin") return null;

  return { empresaId: perfil.empresa_id, userId: data.user.id };
}

interface DatosCertificado { rut: string; venceEl: string; emitidoPara: string }

// Abre el .pfx con la clave dada. Si la clave está mal, node-forge lanza — y
// eso es exactamente lo que queremos saber en este momento y no después.
// En los certificados chilenos el RUT del firmante viaja en el campo
// `serialNumber` del sujeto.
function leerCertificado(bytes: Uint8Array, clave: string): DatosCertificado {
  const binario = String.fromCharCode(...bytes);
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(binario));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, clave);

  const bolsas = p12.getBags({ bagType: forge.pki.oids.certBag });
  const cert = bolsas[forge.pki.oids.certBag]?.[0]?.cert;
  if (!cert) throw new Error("El archivo no contiene ningún certificado.");

  const serial = cert.subject.getField({ name: "serialNumber" })?.value ?? "";
  const nombre = cert.subject.getField("CN")?.value ?? "";

  return {
    rut: String(serial).replace(/[^0-9kK]/g, "").toUpperCase(),
    venceEl: new Date(cert.validity.notAfter).toISOString().slice(0, 10),
    emitidoPara: String(nombre),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  const quien = await identificar(req);
  if (!quien) return json({ ok: false, error: "Solo un administrador de la empresa puede cargar el certificado" }, 401);

  let archivo: File | null = null;
  let clave = "";
  try {
    const form = await req.formData();
    archivo = form.get("certificado") as File | null;
    clave = String(form.get("clave") ?? "");
  } catch {
    return json({ ok: false, error: "Se esperaba un formulario con el archivo y la clave" }, 400);
  }

  if (!archivo) return json({ ok: false, error: "Falta el archivo del certificado" }, 400);
  if (!clave) return json({ ok: false, error: "Falta la clave del certificado" }, 400);
  // Un .pfx real pesa unos pocos KB. Un tope evita que alguien use este
  // endpoint para subir cualquier cosa al bucket privado.
  if (archivo.size > 512 * 1024) return json({ ok: false, error: "El archivo es demasiado grande para ser un certificado" }, 400);

  const bytes = new Uint8Array(await archivo.arrayBuffer());

  let datos: DatosCertificado;
  try {
    datos = leerCertificado(bytes, clave);
  } catch (e) {
    // El error de node-forge para clave incorrecta no es legible para nadie:
    // se traduce a algo accionable.
    const crudo = (e as Error).message ?? "";
    const claveMala = /invalid password|mac could not be verified|integrity/i.test(crudo);
    return json({
      ok: false,
      error: claveMala
        ? "La clave no corresponde a ese certificado."
        : `No se pudo leer el certificado: ${crudo.slice(0, 200)}`,
    }, 400);
  }

  const hoy = new Date().toISOString().slice(0, 10);
  if (datos.venceEl < hoy) {
    return json({ ok: false, error: `El certificado venció el ${datos.venceEl}. Hay que renovarlo antes de emitir.` }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // El RUT del certificado tiene que ser el mismo de la empresa: firmar con el
  // certificado de otro contribuyente no es un descuido, es un documento
  // emitido a nombre equivocado.
  const { data: empresa } = await admin
    .from("empresas").select("rut").eq("id", quien.empresaId).maybeSingle();
  const rutEmpresa = String(empresa?.rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (!rutEmpresa) {
    return json({ ok: false, error: "Primero completá el RUT de la empresa en Configuración → Tributario." }, 400);
  }
  if (rutEmpresa !== datos.rut) {
    return json({
      ok: false,
      error: `El certificado es del RUT ${datos.rut} y la empresa tiene ${rutEmpresa}. No coinciden.`,
    }, 400);
  }

  const ruta = `${quien.empresaId}/certificado.pfx`;
  const { error: errSubida } = await admin.storage
    .from("dte-privado")
    .upload(ruta, bytes, { contentType: "application/x-pkcs12", upsert: true });
  if (errSubida) return json({ ok: false, error: `No se pudo guardar el archivo: ${errSubida.message}` }, 500);

  const { error: errClave } = await admin.rpc("fn_dte_guardar_clave", {
    p_empresa: quien.empresaId,
    p_clave: clave,
  });
  if (errClave) return json({ ok: false, error: `No se pudo guardar la clave: ${errClave.message}` }, 500);

  const { error: errFicha } = await admin.from("dte_certificados").upsert({
    empresa_id: quien.empresaId,
    ruta,
    rut_firmante: datos.rut,
    vence_el: datos.venceEl,
    subido_en: new Date().toISOString(),
    subido_por: quien.userId,
  });
  if (errFicha) return json({ ok: false, error: `No se pudo guardar la ficha: ${errFicha.message}` }, 500);

  return json({
    ok: true,
    rut_firmante: datos.rut,
    vence_el: datos.venceEl,
    emitido_para: datos.emitidoPara,
  });
});
