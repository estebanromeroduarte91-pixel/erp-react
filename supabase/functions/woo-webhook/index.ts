// Recibe los webhooks de WooCommerce y sincroniza el stock en Pixit.
//
// Reescrita: la versión anterior no podía funcionar contra este esquema
// (buscaba columnas que ya no existen) y además estaba bloqueada por
// `verify_jwt`. WooCommerce autentica con su propia firma HMAC, no con un
// token de Supabase, así que esta función DEBE desplegarse con:
//
//   supabase functions deploy woo-webhook --no-verify-jwt
//
// La seguridad no se pierde: se valida la firma HMAC contra el secreto de ESE
// taller, y sin firma válida no se toca nada.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Compara sin filtrar por dónde difieren las cadenas (evita timing attacks). */
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function firmaEsperada(secret: string, cuerpo: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, enc.encode(cuerpo));
  return btoa(String.fromCharCode(...new Uint8Array(firma)));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  // El token identifica al taller. Antes la empresa venía fija en una variable
  // de entorno, así que una sola función servía a un solo cliente.
  const token = new URL(req.url).searchParams.get("t")?.trim() ?? "";
  if (!/^[a-f0-9]{48}$/i.test(token)) return json({ ok: false, error: "Enlace inválido" }, 400);

  const cuerpo = await req.text();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: conn } = await admin
    .from("woo_conexiones")
    .select("secret,empresa_id")
    .eq("token", token)
    .eq("activa", true)
    .maybeSingle();
  if (!conn) return json({ ok: false, error: "Conexión no encontrada" }, 404);

  const firmaRecibida = req.headers.get("X-WC-Webhook-Signature") ?? "";

  // Al guardar un webhook, WooCommerce prueba la URL con un "ping": llega SIN
  // firma y con el cuerpo `webhook_id=8` como formulario, no como JSON. Exige
  // un 200 exacto para dar la URL por válida; cualquier otra cosa la rechaza y
  // no activa el webhook. Responder 200 acá no abre ninguna puerta: el ping no
  // toca stock ni lee datos, solo confirma que la dirección existe.
  if (!firmaRecibida && /^webhook_id=\d+$/.test(cuerpo.trim())) {
    return json({ ok: true, ping: true, detalle: "Conexión verificada" });
  }

  if (!firmaRecibida || !igualSeguro(firmaRecibida, await firmaEsperada(conn.secret, cuerpo))) {
    return json({ ok: false, error: "Firma inválida" }, 401);
  }

  let pedido: Record<string, unknown> & {
    id?: number | string; number?: string; status?: string; line_items?: unknown[];
  };
  try {
    pedido = JSON.parse(cuerpo);
  } catch {
    return json({ ok: false, error: "El cuerpo no es JSON válido" }, 400);
  }

  const tema = req.headers.get("X-WC-Webhook-Topic") ?? "";

  // Producto eliminado en la tienda: se desmarca en Pixit. Sin esto, el
  // producto seguía marcado "vender online" y la sincronización lo volvía a
  // crear en el siguiente cambio de precio o stock — borrarlo no servía.
  if (tema.startsWith("product.")) {
    if (tema !== "product.deleted") {
      return json({ ok: true, ignorado: `El evento ${tema} no requiere acción` });
    }
    const { data, error: e } = await admin.rpc("fn_woo_producto_eliminado", {
      p_token: token, p_woo_id: Number(pedido.id),
    });
    if (e) return json({ ok: false, error: e.message }, 500);
    console.log("woo-webhook producto eliminado", pedido.id, JSON.stringify(data));
    return json(data);
  }

  const orderId = String(pedido.id ?? pedido.number ?? "");
  if (!orderId) return json({ ok: false, error: "El pedido no trae identificador" }, 400);

  // Lo que decide si se mueve el stock es el ESTADO del pedido, no el nombre del
  // evento: WooCommerce manda todos los cambios como `order.updated` y no existe
  // un evento `order.completed`.
  const estado = String(pedido.status ?? "");
  if (!estado) return json({ ok: true, ignorado: "El pedido no trae estado" });

  // Se manda solo lo necesario: SKU y cantidad. El emparejamiento y la escritura
  // ocurren dentro de fn_woo_aplicar_pedido, en una sola transacción.
  const items = (pedido.line_items ?? []).map((i) => {
    const item = i as { id?: number; product_id?: number; variation_id?: number; sku?: string; quantity?: number; name?: string; price?: number; subtotal?: string; total?: string; image?: { src?: string } };
    return {
      id: item.id, producto_woo_id: item.product_id, variacion_woo_id: item.variation_id,
      sku: item.sku ?? "", cantidad: item.quantity ?? 1, nombre: item.name ?? "",
      precio: Number(item.price ?? 0), subtotal: Number(item.subtotal ?? 0),
      total: Number(item.total ?? 0), imagen: item.image?.src ?? null,
    };
  });

  // La bandeja operativa muestra únicamente pedidos cuyo pago fue confirmado
  // por WooCommerce. Los intentos pendientes, fallidos o cancelados antes del
  // cobro no deben convertirse en trabajo para el equipo.
  const fechaPago = pedido.date_paid_gmt || pedido.date_paid;
  let pedidoGuardado = false;

  // Esta escritura NO crea una venta y NO mueve stock;
  // fn_woo_aplicar_pedido conserva esa responsabilidad exclusiva.
  const billing = (pedido.billing ?? {}) as Record<string, unknown>;
  const shipping = (pedido.shipping ?? {}) as Record<string, unknown>;
  const nombreCliente = [billing.first_name, billing.last_name].filter(Boolean).join(" ")
    || String(billing.company ?? "") || "Cliente ecommerce";
  if (fechaPago) {
    const { error: errorGuardar } = await admin.from("ecommerce_pedidos").upsert({
      empresa_id: conn.empresa_id,
      canal: "woocommerce",
      pedido_externo_id: orderId,
      numero: String(pedido.number ?? orderId),
      estado_origen: estado,
      moneda: String(pedido.currency ?? "CLP"),
      total: Number(pedido.total ?? 0),
      metodo_pago: String(pedido.payment_method ?? ""),
      metodo_pago_titulo: String(pedido.payment_method_title ?? ""),
      cliente_nombre: nombreCliente,
      cliente_email: String(billing.email ?? ""),
      cliente_telefono: String(billing.phone ?? ""),
      facturacion: billing,
      envio: shipping,
      items,
      nota_cliente: String(pedido.customer_note ?? ""),
      pagado_en: pedido.date_paid_gmt ? `${String(pedido.date_paid_gmt)}Z` : String(pedido.date_paid),
      creado_en_origen: pedido.date_created_gmt ? `${String(pedido.date_created_gmt)}Z` : null,
      actualizado_en_origen: pedido.date_modified_gmt ? `${String(pedido.date_modified_gmt)}Z` : null,
      recibido_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "empresa_id,canal,pedido_externo_id", ignoreDuplicates: false });
    // Durante un despliegue escalonado la tabla puede no existir todavía. No
    // se bloquea el webhook ni el stock por una falla de la bandeja.
    if (errorGuardar) console.error("woo-webhook guardar pedido", orderId, errorGuardar.message);
    pedidoGuardado = !errorGuardar;
  } else {
    // Si antes se alcanzó a guardar como intento, deja de aparecer en la
    // bandeja. Esto no elimina el pedido real de WooCommerce.
    const { error: errorQuitar } = await admin.from("ecommerce_pedidos")
      .delete()
      .eq("empresa_id", conn.empresa_id)
      .eq("canal", "woocommerce")
      .eq("pedido_externo_id", orderId)
      .is("pagado_en", null);
    if (errorQuitar) console.error("woo-webhook quitar pedido sin pago", orderId, errorQuitar.message);
  }

  const { data, error } = await admin.rpc("fn_woo_aplicar_pedido", {
    p_token: token,
    p_order_id: orderId,
    p_estado: estado,
    p_items: items,
  });

  if (error) {
    console.error("woo-webhook", orderId, estado, error.message);
    return json({ ok: false, error: error.message }, 500);
  }

  if (pedidoGuardado) {
    await admin.from("ecommerce_pedidos")
      .update({ stock_resultado: data, actualizado_en: new Date().toISOString() })
      .eq("empresa_id", conn.empresa_id)
      .eq("canal", "woocommerce")
      .eq("pedido_externo_id", orderId);
  }

  // Se responde 200 aunque haya productos sin emparejar: para WooCommerce el
  // webhook se entregó bien, y reintentarlo no cambiaría el resultado. Lo que
  // no calzó viaja en la respuesta y queda en el historial de movimientos.
  console.log("woo-webhook", orderId, estado, JSON.stringify(data));
  return json(data);
});
