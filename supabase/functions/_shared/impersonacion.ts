// Mismo criterio que is_platform_admin() en Postgres y que las RPCs de las
// migraciones 47-49 (fn_ventas_resumen, fn_confirmar_venta, etc.): una Edge
// Function SIEMPRE resuelve su propia empresa real desde la sesión (JWT), y
// SOLO usa una empresa distinta si además quien llama figura en
// platform_admins. Cualquier otro caller la ignora por completo — pedir una
// empresa inventada en el body nunca alcanza otra empresa si no sos platform
// admin de verdad.
//
// Existe porque el Panel Pixit impersona del lado del navegador (cambia qué
// empresa_id mandan las consultas), pero las Edge Functions de DTE, dominio y
// correo resolvían la empresa solo desde `user_profiles.empresa_id` de la
// sesión real — un platform admin impersonando a un cliente terminaba
// emitiendo boletas, subiendo certificados o mandando correos con los datos
// de SU PROPIA empresa, no la del cliente que estaba mirando.

// deno-lint-ignore no-explicit-any
type ClienteAdmin = any;

export async function empresaPermitida(
  admin: ClienteAdmin,
  userId: string,
  empresaPropia: string,
  empresaSolicitada: unknown,
): Promise<{ empresaId: string; impersonando: boolean }> {
  const solicitada = typeof empresaSolicitada === "string" && empresaSolicitada.trim()
    ? empresaSolicitada.trim()
    : null;
  if (!solicitada || solicitada === empresaPropia) {
    return { empresaId: empresaPropia, impersonando: false };
  }

  const { data } = await admin
    .from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) return { empresaId: empresaPropia, impersonando: false };

  return { empresaId: solicitada, impersonando: true };
}
