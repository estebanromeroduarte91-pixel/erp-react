// Vista privada de un viaje para el motoboy. Se despliega con --no-verify-jwt:
// el acceso depende de un token aleatorio de 256 bits, enviado solo por POST.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey);
const origins = new Set(["https://pixit.cl", "https://www.pixit.cl", "http://localhost:5173"]);

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": origins.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Type": "application/json; charset=utf-8",
  };
}

async function hash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async req => {
  const origin = req.headers.get("origin") ?? "";
  const h = headers(origin);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return reply({ ok: false, error: "Método no permitido" }, 405);
  if (!origins.has(origin)) return reply({ ok: false, error: "Origen no autorizado" }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > 1024) return reply({ ok: false }, 413);

  let token = "";
  try {
    const body = await req.json() as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch { return reply({ ok: false, error: "Enlace inválido" }, 400); }
  if (!/^[a-f0-9]{64}$/.test(token)) return reply({ ok: false, error: "Enlace inválido o vencido" }, 404);

  const { data: viaje, error } = await admin.from("delivery_viajes")
    .select("id,empresa_id,solicitud_id,tipo,estado,motoboy_id,sucursal_nombre,sucursal_direccion,cliente_direccion,fecha,bloque,distancia_km,tarifa_km,monto,acceso_expira")
    .eq("acceso_hash", await hash(token))
    .gt("acceso_expira", new Date().toISOString())
    .neq("estado", "cancelado")
    .maybeSingle();
  if (error) return reply({ ok: false, error: "No pudimos cargar el viaje" }, 500);
  if (!viaje) return reply({ ok: false, error: "Enlace inválido o vencido" }, 404);

  const [{ data: solicitud }, { data: motoboy }, { data: modulo }] = await Promise.all([
    admin.from("delivery_solicitudes").select("numero,nombre,apellido,telefono")
      .eq("id", viaje.solicitud_id).eq("empresa_id", viaje.empresa_id).maybeSingle(),
    admin.from("delivery_motoboys").select("nombre,activo")
      .eq("id", viaje.motoboy_id).eq("empresa_id", viaje.empresa_id).maybeSingle(),
    admin.from("empresa_modulos").select("activo")
      .eq("empresa_id", viaje.empresa_id).eq("modulo", "delivery").maybeSingle(),
  ]);
  if (!solicitud || !motoboy?.activo || !modulo?.activo) return reply({ ok: false, error: "Viaje no disponible" }, 404);

  return reply({ ok: true, viaje: {
    numero: solicitud.numero, tipo: viaje.tipo, estado: viaje.estado,
    cliente: `${solicitud.nombre} ${solicitud.apellido}`, telefono: solicitud.telefono,
    motoboy: motoboy.nombre, sucursal_nombre: viaje.sucursal_nombre,
    sucursal_direccion: viaje.sucursal_direccion, cliente_direccion: viaje.cliente_direccion,
    fecha: viaje.fecha, bloque: viaje.bloque,
    distancia_km: viaje.distancia_km, tarifa_km: viaje.tarifa_km, monto: viaje.monto,
  } });
});
