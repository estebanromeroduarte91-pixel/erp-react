// Cliente del gateway de correo (services/mail-gateway). Mismo protocolo que
// usa send-email: cuerpo JSON firmado con HMAC sobre `timestamp.requestId.body`
// con el secreto compartido SMTP_GATEWAY_SECRET.

function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bytesAHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function firmar(secret: string, timestamp: string, requestId: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${timestamp}.${requestId}.${rawBody}`);
  return `v1=${bytesAHex(await crypto.subtle.sign("HMAC", key, data))}`;
}

// deno-lint-ignore no-explicit-any
export async function llamarGateway(ruta: "/v1/send" | "/v1/fetch", payload: Record<string, unknown>): Promise<any> {
  const baseUrl = texto(Deno.env.get("SMTP_GATEWAY_URL")).replace(/\/+$/, "");
  const secret = texto(Deno.env.get("SMTP_GATEWAY_SECRET"));
  if (!baseUrl || secret.length < 32) {
    return { ok: false, error: "El gateway de correo de Pixit aún no está configurado." };
  }

  const requestId = String(payload.requestId);
  const timestamp = String(Date.now());
  const rawBody = JSON.stringify(payload);
  try {
    const response = await fetch(`${baseUrl}${ruta}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pixit-Timestamp": timestamp,
        "X-Pixit-Request-Id": requestId,
        "X-Pixit-Signature": await firmar(secret, timestamp, requestId, rawBody),
      },
      body: rawBody,
      signal: AbortSignal.timeout(55_000),
    });
    const result = await response.json().catch(() => ({ ok: false, error: "Respuesta no válida del gateway de correo." }));
    if (response.status === 404 && ruta === "/v1/fetch") {
      return { ok: false, error: "El gateway de correo todavía no tiene la lectura de casillas. Hay que actualizarlo en el VPS." };
    }
    return response.ok ? result : { ok: false, error: result.error || `El gateway de correo respondió HTTP ${response.status}.` };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}

export type CredencialCorreo = {
  host: string;
  port: number;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

// Lee la casilla configurada en Configuración > Correo (contraseña desde
// Vault). Solo sirve en modo "smtp": en modo administrado los correos salen
// desde Pixit y no hay casilla propia que leer.
// deno-lint-ignore no-explicit-any
export async function credencialCorreo(admin: any, empresaId: string): Promise<CredencialCorreo | { error: string }> {
  const { data, error } = await admin.rpc("get_smtp_config_for_delivery", { p_empresa: empresaId });
  if (error) return { error: `No se pudo abrir la credencial de correo: ${error.message}` };
  const cfg = (data ?? {}) as Record<string, unknown>;
  if (cfg.mode !== "smtp") return { error: "Para recibir correos, configura tu casilla en Configuración > Correo (modo SMTP propio)." };
  const user = texto(cfg.user) || texto(cfg.from_email);
  const password = typeof cfg.password === "string" ? cfg.password : "";
  const host = texto(cfg.host);
  if (!host || !user || !password) return { error: "Faltan servidor, usuario o contraseña en Configuración > Correo." };

  const { data: taller } = await admin
    .from("erp_data").select("datos").eq("empresa_id", empresaId).eq("clave", "tp_config").maybeSingle();
  return {
    host,
    port: Number(cfg.port || 465),
    user,
    password,
    fromEmail: (texto(cfg.from_email) || user).toLowerCase(),
    fromName: texto(cfg.from_name) || texto((taller?.datos as Record<string, unknown> | undefined)?.nombre) || "Pixit",
  };
}
