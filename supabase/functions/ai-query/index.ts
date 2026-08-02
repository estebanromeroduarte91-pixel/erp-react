import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Exigir un usuario real logueado — antes bastaba la anon key (pública en
    // el bundle) para gastar el ANTHROPIC_API_KEY del servidor sin límite.
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pregunta, contexto } = await req.json();

    // La API key sale solo del secret del servidor — nunca del body del cliente.
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Falta ANTHROPIC_API_KEY" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!pregunta) {
      return new Response(
        JSON.stringify({ ok: false, error: "Falta la pregunta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Eres un asistente de negocio integrado en un ERP chileno para talleres de reparación de celulares y tiendas de tecnología.
Tu tarea es responder preguntas sobre el negocio usando los datos que te entrega el sistema.

Reglas:
- Responde siempre en español
- Sé directo y conciso — una o dos oraciones para respuestas simples, una lista corta para respuestas complejas
- Los montos son en pesos chilenos (CLP). Usa el formato $1.234.567
- Si los datos no son suficientes para responder, dilo claramente
- No inventes datos que no estén en el contexto
- Las fechas usan formato DD-MM-YYYY o YYYY-MM-DD
- "OT" significa Orden de Trabajo (reparación de equipo)
- "VTA" significa Venta (venta de producto o servicio)
- El IVA en Chile es 19%`;

    const userMessage = `Contexto del ERP (datos actuales):
${contexto}

Pregunta del usuario: ${pregunta}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Error Anthropic API: ${err}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const respuesta = data.content?.[0]?.text || "Sin respuesta";

    return new Response(JSON.stringify({ ok: true, respuesta }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: String(error?.message || error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});