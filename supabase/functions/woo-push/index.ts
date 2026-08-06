// Empuja hacia WooCommerce los productos marcados como "vender online":
// los crea si no existen, y mantiene su precio y su stock al día.
//
// Existe por la sobreventa: sin esto, una venta en el mostrador no baja el
// stock de la tienda, y alguien compra por internet algo que ya no está.
//
// Trabaja sobre una cola (`woo_sync_cola`) que llenan los triggers de la base.
// Así un fallo de red o una tienda caída nunca hacen fallar una venta en el
// POS: el cambio queda encolado y se reintenta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Pendiente {
  empresa_id: string;
  producto_id: string;
  sku: string;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  woo_product_id: number | null;
  site_url: string;
  consumer_key: string;
  consumer_secret: string;
}

// Se llama tanto desde el cron (servidor a servidor) como desde la app en el
// navegador, y para lo segundo hacen falta cabeceras CORS: sin ellas el
// navegador bloquea la respuesta en la comprobación previa.
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

async function llamarWoo(p: Pendiente, ruta: string, metodo: string, cuerpo?: unknown) {
  const base = p.site_url.replace(/\/+$/, "");
  const auth = btoa(`${p.consumer_key}:${p.consumer_secret}`);
  const res = await fetch(`${base}/wp-json/wc/v3${ruta}`, {
    method: metodo,
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(texto); } catch { /* la tienda respondió algo que no es JSON */ }
  if (!res.ok) {
    const msg = (data as { message?: string } | null)?.message ?? texto.slice(0, 200);
    throw new Error(`WooCommerce ${res.status}: ${msg}`);
  }
  return data;
}

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// La anon key es un JWT válido y es PÚBLICA (viaja en el bundle del navegador),
// así que `verify_jwt` sola no autoriza nada: dejaba que cualquiera disparara
// sincronizaciones contra la tienda. Se exige o bien la service_role (la usa el
// cron) o bien una persona con sesión real y perfil de la empresa.
async function autorizado(req: Request): Promise<boolean> {
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
    .from("user_profiles").select("empresa_id").eq("id", data.user.id).maybeSingle();
  return !!perfil?.empresa_id;
}

Deno.serve(async (req) => {
  // La comprobación previa del navegador llega sin credenciales: hay que
  // responderla antes de exigir autorización, o nunca llega la petición real.
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  if (!await autorizado(req)) return json({ ok: false, error: "No autorizado" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // 15 por llamada. La primera vez que se publica un producto hacen falta DOS
  // llamadas a WooCommerce (buscarlo por SKU y luego actualizarlo), y WordPress
  // puede tardar más de un segundo en cada una: con tandas grandes la función
  // se pasaba del tiempo permitido y el botón quedaba girando. Lo que no entra
  // queda en la cola — solo se borra lo que se sincronizó bien.
  const { data: pendientes, error } = await admin.rpc("fn_woo_pendientes", { p_limite: 15 });
  if (error) return json({ ok: false, error: error.message }, 500);

  const lista = (pendientes ?? []) as Pendiente[];
  if (lista.length === 0) return json({ ok: true, procesados: 0, detalle: "Nada pendiente" });

  const resultados: unknown[] = [];

  for (const p of lista) {
    try {
      const cuerpo = {
        name: p.nombre,
        sku: p.sku,
        regular_price: String(p.precio ?? 0),
        description: p.descripcion,
        manage_stock: true,
        stock_quantity: p.stock,
        stock_status: p.stock > 0 ? "instock" : "outofstock",
      };

      let wooId = p.woo_product_id;

      // Si no se conoce el id de la tienda, se busca por SKU antes de crear:
      // el catálogo se cargó por CSV, así que muchos productos YA existen allá
      // y crearlos de nuevo los duplicaría.
      //
      // `status=any` es imprescindible: los productos que entraron por CSV
      // quedaron como BORRADOR, y sin ese parámetro la búsqueda no los ve, así
      // que se intentaba crearlos y WooCommerce respondía "el SKU ya está en la
      // tabla de búsqueda".
      if (!wooId) {
        const sku = encodeURIComponent(p.sku);
        const encontrados = await llamarWoo(p, `/products?sku=${sku}&status=any`, "GET") as { id: number }[];
        if (Array.isArray(encontrados) && encontrados.length > 0) {
          wooId = encontrados[0].id;
        } else {
          // La papelera no entra en `any`, pero SÍ conserva el SKU reservado.
          // Se avisa en vez de crear —que fallaría— y en vez de restaurarlo
          // solo: si alguien lo borró en la tienda, esa decisión es suya.
          const enPapelera = await llamarWoo(p, `/products?sku=${sku}&status=trash`, "GET") as { id: number }[];
          if (Array.isArray(enPapelera) && enPapelera.length > 0) {
            throw new Error(
              `El SKU ${p.sku} está en la papelera de WooCommerce. Restauralo o vaciá la papelera, o desmarcá "vender online" en Pixit.`,
            );
          }
        }
      }

      const guardado = wooId
        ? await llamarWoo(p, `/products/${wooId}`, "PUT", cuerpo) as { id: number }
        // Entra como borrador, igual que la carga por CSV: publicar es una
        // decisión de quien revisa la ficha y le pone foto.
        : await llamarWoo(p, "/products", "POST", { ...cuerpo, status: "draft" }) as { id: number };

      await admin.rpc("fn_woo_sync_ok", {
        p_empresa: p.empresa_id, p_producto: p.producto_id, p_woo_id: guardado.id,
      });
      resultados.push({ sku: p.sku, ok: true, woo_id: guardado.id, creado: !wooId });
    } catch (e) {
      const motivo = (e as Error).message;
      await admin.rpc("fn_woo_sync_error", {
        p_empresa: p.empresa_id, p_producto: p.producto_id, p_error: motivo,
      });
      resultados.push({ sku: p.sku, ok: false, error: motivo });
    }
  }

  console.log("woo-push", JSON.stringify(resultados));
  return json({ ok: true, procesados: resultados.length, resultados });
});
