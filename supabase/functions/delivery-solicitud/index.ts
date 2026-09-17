// Endpoint público del formulario de delivery (ej. stevedocs.cl/delivery).
//
//   GET  ?formulario=<slug>  → configuración pública: comunas, bloques, Turnstile.
//   POST { formulario, ... } → registra la solicitud y devuelve DEL-000123.
//
// Se despliega sin verificación de JWT (WordPress no tiene ni debe tener
// claves de Supabase):
//
//   supabase functions deploy delivery-solicitud --no-verify-jwt
//
// La protección real está acá: formulario activo, origen permitido, módulo
// habilitado para la empresa, Turnstile (si hay secreto configurado), límite
// por IP y validación de cada campo. Solo esta función inserta, con service_role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

const MAX_BODY = 8 * 1024 * 1024;
const MAX_FOTOS = 3;
const MAX_FOTO_BYTES = 3 * 1024 * 1024;
const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface Formulario {
  empresa_id: string;
  activo: boolean;
  origenes_permitidos: string[] | null;
  configuracion: Record<string, unknown> | null;
}

// El navegador solo recibe permiso CORS si el origen está en la lista de algún
// formulario activo. Antes se reflejaba cualquier origen.
function cors(origin: string, permitido: boolean) {
  return {
    "Access-Control-Allow-Origin": permitido ? origin : "null",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function origenPermitido(origin: string) {
  if (!origin) return false;
  const { data } = await admin.from("delivery_formularios")
    .select("id").eq("activo", true).contains("origenes_permitidos", [origin]).limit(1);
  return (data?.length ?? 0) > 0;
}

function texto(value: unknown, max = 200) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function textoLargo(value: unknown, max: number) {
  return String(value ?? "").trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, max);
}

function rutValido(rut: string) {
  const limpio = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 8 || limpio.length > 9) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

function formatearRut(rut: string) {
  const limpio = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpo}-${limpio.slice(-1)}`;
}

function listaTextos(value: unknown): string[] {
  return Array.isArray(value) ? value.map(v => String(v)).filter(Boolean) : [];
}

function hoySantiago() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

async function hashIp(ip: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`delivery:${ip}`));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function turnstileValido(token: string, ip: string) {
  if (!TURNSTILE_SECRET) return true; // aún no configurado: no bloquea
  if (!token) return false;
  const body = new FormData();
  body.append("secret", TURNSTILE_SECRET);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = await res.json() as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

function decodificarFoto(dataUrl: unknown) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  if (bytes.length === 0 || bytes.length > MAX_FOTO_BYTES) return null;
  return { tipo: m[1], ext: TIPOS_FOTO[m[1]], bytes };
}

Deno.serve(async req => {
  const origin = req.headers.get("origin") ?? "";
  const permitido = await origenPermitido(origin);
  const headers = { ...cors(origin, permitido), "Content-Type": "application/json", "Cache-Control": "no-store" };
  const responder = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin, permitido) });

  async function cargarFormulario(slug: string) {
    const { data } = await admin.from("delivery_formularios")
      .select("empresa_id,activo,origenes_permitidos,configuracion")
      .eq("slug", slug).maybeSingle();
    const formulario = data as Formulario | null;
    if (!formulario?.activo) return { error: responder({ ok: false, error: "Formulario no disponible" }, 404) };

    // Un navegador siempre manda Origin en fetch cross-site. Si el formulario
    // tiene lista, se exige; sin Origin (curl, bots) no se acepta.
    const origenes = formulario.origenes_permitidos ?? [];
    if (origenes.length && !origenes.includes(origin)) {
      return { error: responder({ ok: false, error: "Origen no autorizado" }, 403) };
    }

    const { data: modulo } = await admin.from("empresa_modulos")
      .select("activo").eq("empresa_id", formulario.empresa_id).eq("modulo", "delivery").maybeSingle();
    if (!modulo?.activo) return { error: responder({ ok: false, error: "Servicio temporalmente deshabilitado" }, 403) };

    return { formulario };
  }

  if (req.method === "GET") {
    const slug = texto(new URL(req.url).searchParams.get("formulario"), 64).toLowerCase();
    const { formulario, error } = await cargarFormulario(slug);
    if (error) return error;
    const cfg = formulario!.configuracion ?? {};
    return responder({
      ok: true,
      comunas: listaTextos(cfg.comunas),
      bloques: listaTextos(cfg.bloques),
      whatsapp: texto(cfg.whatsapp, 20) || null,
      turnstile_site_key: texto(cfg.turnstile_site_key, 100) || null,
    });
  }

  if (req.method !== "POST") return responder({ ok: false, error: "Método no permitido" }, 405);

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return responder({ ok: false, error: "Las fotos son demasiado pesadas" }, 413);
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return responder({ ok: false, error: "Solicitud inválida" }, 400); }

  // Campo trampa invisible para bots. Se responde como si hubiese funcionado
  // para que no aprendan a saltarlo.
  if (texto(payload.website, 100)) return responder({ ok: true, codigo: "DEL-000000" });

  const slug = texto(payload.formulario, 64).toLowerCase();
  const { formulario, error: errorFormulario } = await cargarFormulario(slug);
  if (errorFormulario) return errorFormulario;
  const cfg = formulario!.configuracion ?? {};

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!(await turnstileValido(texto(payload.turnstile_token, 4096), ip))) {
    return responder({ ok: false, error: "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo." }, 403);
  }

  const row = {
    empresa_id: formulario!.empresa_id,
    nombre: texto(payload.nombre, 80),
    apellido: texto(payload.apellido, 80),
    rut: texto(payload.rut, 20),
    telefono: texto(payload.telefono, 30),
    email: texto(payload.email, 120).toLowerCase() || null,
    direccion: texto(payload.direccion, 180),
    comuna: texto(payload.comuna, 80),
    region: texto(payload.region, 80) || null,
    referencia_direccion: texto(payload.referencia_direccion, 180) || null,
    tipo_equipo: texto(payload.tipo_equipo, 80),
    marca: texto(payload.marca, 80) || null,
    modelo: texto(payload.modelo, 100) || null,
    falla: textoLargo(payload.falla, 1500),
    fecha_preferida: texto(payload.fecha_preferida, 10) || null,
    bloque_horario: texto(payload.bloque_horario, 40) || null,
    observaciones: textoLargo(payload.observaciones, 1000) || null,
    origen: "web",
    ip_hash: await hashIp(ip || "sin-ip"),
    acepto_privacidad: payload.acepto_privacidad === true,
  };

  if (!row.nombre || !row.apellido || !row.rut || !row.telefono || !row.direccion ||
      !row.comuna || !row.tipo_equipo || !row.falla) {
    return responder({ ok: false, error: "Completa todos los campos obligatorios" }, 422);
  }
  if (!row.acepto_privacidad) return responder({ ok: false, error: "Debes aceptar el uso de tus datos para coordinar el retiro" }, 422);
  if (!rutValido(row.rut)) return responder({ ok: false, error: "El RUT no es válido" }, 422);
  row.rut = formatearRut(row.rut);
  if (!/^\+?[0-9\s()-]{8,20}$/.test(row.telefono)) return responder({ ok: false, error: "El teléfono no es válido" }, 422);
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) return responder({ ok: false, error: "El correo no es válido" }, 422);

  const comunas = listaTextos(cfg.comunas);
  if (comunas.length && !comunas.includes(row.comuna)) {
    return responder({ ok: false, error: "Por ahora no hacemos retiros en esa comuna" }, 422);
  }
  const bloques = listaTextos(cfg.bloques);
  if (row.bloque_horario && bloques.length && !bloques.includes(row.bloque_horario)) {
    return responder({ ok: false, error: "Elige un bloque horario válido" }, 422);
  }
  if (row.fecha_preferida) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_preferida) || row.fecha_preferida < hoySantiago()) {
      return responder({ ok: false, error: "Elige una fecha de retiro desde hoy en adelante" }, 422);
    }
  }

  const fotosEntrada = Array.isArray(payload.fotos) ? payload.fotos.slice(0, MAX_FOTOS) : [];
  const fotos = fotosEntrada.map(decodificarFoto);
  if (fotos.some(f => f === null)) {
    return responder({ ok: false, error: "Una de las fotos no es válida (usa JPG o PNG de menos de 3 MB)" }, 422);
  }

  // Máximo tres solicitudes por IP y formulario dentro de una hora.
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("delivery_solicitudes")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", row.empresa_id).eq("ip_hash", row.ip_hash).gte("creado_en", desde);
  if ((count ?? 0) >= 3) return responder({ ok: false, error: "Ya recibimos varias solicitudes desde tu conexión. Intenta más tarde o escríbenos por WhatsApp." }, 429);

  const { data, error } = await admin.from("delivery_solicitudes")
    .insert(row).select("id,numero").single();
  if (error || !data) {
    console.error("delivery-solicitud insert", error?.message);
    return responder({ ok: false, error: "No pudimos registrar la solicitud. Intenta de nuevo." }, 500);
  }

  // Las fotos son opcionales: si alguna falla al subir, la solicitud igual queda.
  if (fotos.length) {
    const rutas: string[] = [];
    for (const [i, foto] of fotos.entries()) {
      const ruta = `${row.empresa_id}/${data.id}/${i + 1}.${foto!.ext}`;
      const { error: errFoto } = await admin.storage.from("delivery-fotos")
        .upload(ruta, foto!.bytes, { contentType: foto!.tipo, upsert: true });
      if (errFoto) console.error("delivery-solicitud foto", errFoto.message);
      else rutas.push(ruta);
    }
    if (rutas.length) await admin.from("delivery_solicitudes").update({ fotos: rutas }).eq("id", data.id);
  }

  return responder({ ok: true, codigo: `DEL-${String(data.numero).padStart(6, "0")}` }, 201);
});
