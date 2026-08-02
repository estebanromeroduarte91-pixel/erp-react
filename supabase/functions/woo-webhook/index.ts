import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EMPRESA_ID = Deno.env.get('EMPRESA_ID') ?? 'default';
const WOO_SECRET = Deno.env.get('WOO_WEBHOOK_SECRET') ?? '';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function verificarFirma(req: Request, body: string): Promise<boolean> {
  if (!WOO_SECRET) return true;
  const firma = req.headers.get('X-WC-Webhook-Signature');
  if (!firma) return false;
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(WOO_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(body));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  return signatureBase64 === firma;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const bodyText = await req.text();
  if (!(await verificarFirma(req, bodyText))) return new Response('Unauthorized', { status: 401 });

  let order: any;
  try { order = JSON.parse(bodyText); } catch { return new Response('Bad JSON', { status: 400 }); }

  const evento = req.headers.get('X-WC-Webhook-Topic') ?? '';
  const orderId = order.id ?? '?';
  console.log(`Webhook: ${evento} | Pedido: ${orderId}`);

  let delta = 0;
  let tipo: string;
  if (evento === 'order.completed') { delta = -1; tipo = 'woocommerce'; }
  else if (evento === 'order.cancelled' || evento === 'order.refunded') { delta = +1; tipo = 'devolucion'; }
  else return new Response(JSON.stringify({ ok: true, msg: 'evento ignorado' }), { headers: { 'Content-Type': 'application/json' } });

  const lineItems: any[] = order.line_items ?? [];
  const resultados: any[] = [];

  for (const item of lineItems) {
    const wooId = item.product_id;
    const cantidad = item.quantity ?? 1;

    const { data: productos, error: fetchErr } = await sb
      .from('productos')
      .select('id, nombre, stock')
      .eq('woocommerce_product_id', wooId)
      .eq('empresa_id', EMPRESA_ID)
      .limit(1);

    if (fetchErr || !productos?.length) {
      console.warn(`Producto WC ${wooId} no encontrado en ERP`);
      resultados.push({ wooId, ok: false, error: 'no encontrado' });
      continue;
    }

    const prod = productos[0];
    const stockAntes = prod.stock ?? 0;
    const cambio = delta * cantidad;
    const stockDespues = Math.max(0, stockAntes + cambio);

    await sb.from('productos').update({ stock: stockDespues, updated_at: new Date().toISOString() }).eq('id', prod.id);
    await sb.from('movimientos_stock').insert({
      empresa_id: EMPRESA_ID, producto_id: prod.id, tipo,
      cantidad: cambio, stock_antes: stockAntes, stock_despues: stockDespues,
      referencia: `Pedido WC #${orderId}`, notas: `${item.name} × ${cantidad}`,
    });

    console.log(`✓ ${prod.nombre}: ${stockAntes} → ${stockDespues}`);
    resultados.push({ wooId, nombre: prod.nombre, ok: true, stockAntes, stockDespues });
  }

  return new Response(JSON.stringify({ ok: true, orderId, evento, resultados }), { headers: { 'Content-Type': 'application/json' } });
});