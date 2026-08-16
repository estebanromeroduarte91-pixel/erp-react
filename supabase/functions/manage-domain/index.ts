import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaPermitida } from "../_shared/impersonacion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Exigir un usuario real logueado — antes bastaba la anon key (pública)
    // para crear/verificar dominios contra la cuenta de Resend de cualquiera.
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ ok: false, error: "No autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from("user_profiles")
      .select("empresa_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) return json({ ok: false, error: "Usuario sin empresa" }, 403);

    const { action, domain, domainId, empresa_id: empresaSolicitada } = await req.json();
    // Un platform admin impersonando desde el Panel Pixit administra el
    // dominio del cliente que está mirando, no el suyo propio — ver
    // supabase/functions/_shared/impersonacion.ts.
    const { empresaId } = await empresaPermitida(admin, userData.user.id, profile.empresa_id as string, empresaSolicitada);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ ok: false, error: "RESEND_API_KEY no configurada en el servidor" }, 400);
    const headers = { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" };

    // El dominio verificado de esta empresa (si tiene uno) queda guardado en
    // erp_data. Para "verify"/"status" exigimos que el domainId coincida con
    // ese registro — así una empresa no puede consultar/re-verificar el
    // dominio de otra solo adivinando o reusando un domainId ajeno.
    async function domainIdEsDeLaEmpresa(id: string): Promise<boolean> {
      const { data: row } = await admin
        .from("erp_data")
        .select("datos")
        .eq("empresa_id", empresaId)
        .eq("clave", "tp_email_domain")
        .maybeSingle();
      const datos = row?.datos as { domainId?: string } | undefined;
      return !!datos?.domainId && datos.domainId === id;
    }

    // Registrar un dominio nuevo → devuelve los registros DNS
    if (action === "create") {
      if (!domain) return json({ ok: false, error: "Falta el dominio" }, 400);
      const res = await fetch("https://api.resend.com/domains", {
        method: "POST", headers,
        body: JSON.stringify({ name: domain }),
      });
      const data = await res.json();
      if (!res.ok) return json({ ok: false, error: data.message || "Error creando dominio" }, 400);
      return json({ ok: true, id: data.id, name: data.name, status: data.status, records: data.records });
    }

    // Disparar verificación y devolver estado actualizado
    if (action === "verify") {
      if (!domainId) return json({ ok: false, error: "Falta el ID del dominio" }, 400);
      if (!(await domainIdEsDeLaEmpresa(domainId))) return json({ ok: false, error: "Dominio no encontrado" }, 404);
      await fetch(`https://api.resend.com/domains/${domainId}/verify`, { method: "POST", headers });
      const res = await fetch(`https://api.resend.com/domains/${domainId}`, { headers });
      const data = await res.json();
      if (!res.ok) return json({ ok: false, error: data.message || "Error consultando dominio" }, 400);
      return json({ ok: true, id: data.id, name: data.name, status: data.status, records: data.records });
    }

    // Solo consultar estado
    if (action === "status") {
      if (!domainId) return json({ ok: false, error: "Falta el ID del dominio" }, 400);
      if (!(await domainIdEsDeLaEmpresa(domainId))) return json({ ok: false, error: "Dominio no encontrado" }, 404);
      const res = await fetch(`https://api.resend.com/domains/${domainId}`, { headers });
      const data = await res.json();
      if (!res.ok) return json({ ok: false, error: data.message || "Error consultando dominio" }, 400);
      return json({ ok: true, id: data.id, name: data.name, status: data.status, records: data.records });
    }

    return json({ ok: false, error: "Acción no reconocida" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 400);
  }
});