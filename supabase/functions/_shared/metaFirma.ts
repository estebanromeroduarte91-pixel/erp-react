// Criptografía independiente de Deno y de las credenciales del servidor.
// Se comparte entre las Edge Functions y las pruebas de firma del webhook.
function bytesAHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret: string, data: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  // Copiar la vista respeta byteOffset/byteLength y proporciona un ArrayBuffer
  // propio, compatible con BufferSource en TypeScript y Web Crypto.
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  return bytesAHex(await crypto.subtle.sign("HMAC", key, bytes));
}

function igualesSinFiltrarTiempo(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verificarFirmaMeta(
  secret: string, rawBody: Uint8Array, cabecera: string | null,
): Promise<boolean> {
  if (!secret || !cabecera?.startsWith("sha256=")) return false;
  return igualesSinFiltrarTiempo(cabecera.slice(7).toLowerCase(), await hmacHex(secret, rawBody));
}
