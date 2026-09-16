import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function texto(value: unknown, max = 200) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function rutValido(rut: string) {
  const limpio = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 8) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
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

async function hashIp(ip: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async req => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return response(origin, { ok: false, error: "Metodo no permitido" }, 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return response(origin, { ok: false, error: "Solicitud invalida" }, 400); }

  // Campo trampa invisible para bots. Se responde como si hubiese funcionado
  // para que no puedan aprender a saltarlo.
  if (texto(payload.website, 100)) return response(origin, { ok: true, codigo: "RECIBIDA" });

  const slug = texto(payload.formulario, 64).toLowerCase();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: formulario } = await admin.from("delivery_formularios")
    .select("empresa_id,activo,origenes_permitidos")
    .eq("slug", slug).maybeSingle();

  if (!formulario?.activo) return response(origin, { ok: false, error: "Formulario no disponible" }, 404);
  const permitidos = (formulario.origenes_permitidos ?? []) as string[];
  if (origin && permitidos.length && !permitidos.includes(origin)) {
    return response(origin, { ok: false, error: "Origen no autorizado" }, 403);
  }

  const { data: modulo } = await admin.from("empresa_modulos")
    .select("activo").eq("empresa_id", formulario.empresa_id).eq("modulo", "delivery").maybeSingle();
  if (!modulo?.activo) return response(origin, { ok: false, error: "Servicio temporalmente deshabilitado" }, 403);

  const row = {
    empresa_id: formulario.empresa_id,
    nombre: texto(payload.nombre, 80),
    apellido: texto(payload.apellido, 80),
    rut: texto(payload.rut, 20),
    telefono: texto(payload.telefono, 30),
    email: texto(payload.email, 120) || null,
    direccion: texto(payload.direccion, 180),
    comuna: texto(payload.comuna, 80),
    region: texto(payload.region, 80) || null,
    referencia_direccion: texto(payload.referencia_direccion, 180) || null,
    tipo_equipo: texto(payload.tipo_equipo, 80),
    marca: texto(payload.marca, 80) || null,
    modelo: texto(payload.modelo, 100) || null,
    falla: texto(payload.falla, 1500),
    fecha_preferida: texto(payload.fecha_preferida, 10) || null,
    bloque_horario: texto(payload.bloque_horario, 40) || null,
    observaciones: texto(payload.observaciones, 1000) || null,
    origen: "web",
    ip_hash: await hashIp(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip"),
    acepto_privacidad: payload.acepto_privacidad === true,
  };

  if (!row.nombre || !row.apellido || !row.rut || !row.telefono || !row.direccion ||
      !row.comuna || !row.tipo_equipo || !row.falla || !row.acepto_privacidad) {
    return response(origin, { ok: false, error: "Completa todos los campos obligatorios" }, 422);
  }
  if (!rutValido(row.rut)) return response(origin, { ok: false, error: "El RUT no es valido" }, 422);
  if (!/^\+?[0-9\s()-]{8,20}$/.test(row.telefono)) {
    return response(origin, { ok: false, error: "El telefono no es valido" }, 422);
  }

  // Maximo tres solicitudes por IP y formulario dentro de una hora.
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("delivery_solicitudes")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", formulario.empresa_id).eq("ip_hash", row.ip_hash).gte("creado_en", desde);
  if ((count ?? 0) >= 3) return response(origin, { ok: false, error: "Intenta nuevamente mas tarde" }, 429);

  const { data, error } = await admin.from("delivery_solicitudes")
    .insert(row).select("numero").single();
  if (error) {
    console.error("delivery-solicitud", error.message);
    return response(origin, { ok: false, error: "No pudimos registrar la solicitud" }, 500);
  }

  return response(origin, { ok: true, codigo: `DEL-${String(data.numero).padStart(6, "0")}` }, 201);
});
