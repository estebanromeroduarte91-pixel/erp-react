import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// El admin ya verificó el correo del invitado al escribirlo y compartirle el
// link a mano — por eso esta función crea la cuenta YA CONFIRMADA (email_confirm:
// true) en vez de usar el signUp normal del cliente, que dispara un segundo
// correo de confirmación de Supabase y deja a la persona bloqueada si ese
// correo no llega. Requiere service_role — por eso vive en el servidor, nunca
// en el navegador.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { token, password, nombre } = await req.json();
    if (!token || !password || !nombre) {
      return json({ ok: false, error: "Faltan parámetros: token, password, nombre" });
    }
    if (String(password).length < 6) {
      return json({ ok: false, error: "La contraseña debe tener al menos 6 caracteres" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: invite, error: inviteErr } = await admin
      .from("pending_invites")
      .select("empresa_id,email,role,token")
      .eq("token", token)
      .eq("used", false)
      .maybeSingle();

    if (inviteErr || !invite) {
      return json({ ok: false, error: "Invitación inválida o ya utilizada." });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      return json({ ok: false, error: createErr?.message || "No se pudo crear la cuenta" });
    }

    const userId = created.user.id;

    const { error: perfilErr } = await admin.from("user_profiles").insert({
      id: userId, empresa_id: invite.empresa_id, role: invite.role, nombre, activo: true,
    });
    if (perfilErr) {
      return json({ ok: false, error: "Error al crear el perfil: " + perfilErr.message });
    }

    await admin.from("pending_invites").update({ used: true }).eq("token", token);

    // Aplica el cargo/sucursal que quedaron guardados al crear la invitación
    // (misma lógica que antes vivía en el cliente, en Login.tsx).
    const { data: pendingCargoRow } = await admin
      .from("erp_data")
      .select("datos")
      .eq("empresa_id", invite.empresa_id)
      .eq("clave", `pending_cargo_${token}`)
      .maybeSingle();
    if (pendingCargoRow?.datos) {
      let cfg = pendingCargoRow.datos;
      if (typeof cfg === "string") {
        try { cfg = JSON.parse(cfg); } catch { cfg = null; }
      }
      if (cfg) {
        await admin.from("erp_data").upsert(
          { empresa_id: invite.empresa_id, clave: `ucfg_${userId}`, datos: cfg, actualizado_en: new Date().toISOString() },
          { onConflict: "empresa_id,clave" },
        );
      }
    }

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String((error as Error)?.message || error) });
  }
});