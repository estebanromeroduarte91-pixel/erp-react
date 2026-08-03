import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "erp-assets";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function errorResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse("Método no permitido", 405);

  const url = new URL(req.url);
  const token = url.searchParams.get("t")?.trim() ?? "";
  const path = url.searchParams.get("p")?.trim() ?? "";

  // El token es criptográficamente aleatorio (40 caracteres hex). Además, el
  // objeto debe vivir exactamente dentro de su propia carpeta qr/{token}/.
  if (!/^[a-f0-9]{40}$/i.test(token)) return errorResponse("Enlace inválido", 400);
  if (!path.startsWith(`qr/${token}/`) || path.includes("..") || path.includes("\\")) {
    return errorResponse("Ruta inválida", 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: qr, error: tokenError } = await admin
    .from("orden_qr_tokens")
    .select("id")
    .eq("token", token)
    .eq("revocado", false)
    .maybeSingle();

  // La lectura histórica sigue funcionando después de las 48 horas. La
  // expiración limita nuevas cargas; revocar el token sí corta también lectura.
  if (tokenError || !qr) return errorResponse("Foto no disponible", 404);

  const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(path);
  if (downloadError || !file) return errorResponse("Foto no encontrada", 404);
  if (file.type && !file.type.startsWith("image/")) return errorResponse("Archivo no permitido", 415);

  return new Response(file, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
});
