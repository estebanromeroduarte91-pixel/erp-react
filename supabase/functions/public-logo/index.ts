import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function reply(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return reply("Método no permitido", 405);
  const path = new URL(req.url).searchParams.get("p")?.trim() ?? "";

  // Los logos sí son públicos por diseño, pero esta función no permite leer
  // ninguna otra carpeta del bucket privado.
  if (!/^[a-f0-9-]{36}\/logo\/[a-zA-Z0-9._-]+$/.test(path) || path.includes("..")) {
    return reply("Ruta inválida", 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: file, error } = await admin.storage.from("erp-assets").download(path);
  if (error || !file) return reply("Logo no encontrado", 404);
  if (file.type && !file.type.startsWith("image/")) return reply("Archivo no permitido", 415);

  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
