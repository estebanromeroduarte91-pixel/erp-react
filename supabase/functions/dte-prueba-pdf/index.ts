const TOKEN = "pixit-pdf-20260812-77b1f0d10fe94283";

Deno.serve(async (req) => {
  if (req.headers.get("x-test-token") !== TOKEN) {
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const respuesta = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dte-imprimir`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "x-empresa-id": "f347f086-d2ba-40b0-ab70-95a7c02c8781",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ folio: 155, tipo_dte: 39, regenerar: true, forma_pago: "Efectivo" }),
  });
  return new Response(await respuesta.text(), {
    status: respuesta.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
