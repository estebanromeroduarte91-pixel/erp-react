// `supabase.functions.invoke()` devuelve un mensaje genérico cuando la función
// responde con error: "Edge Function returned a non-2xx status code". El motivo
// real (credenciales mal, timeout, límite alcanzado, lo que responda un
// servicio externo) viaja en el CUERPO de esa respuesta, no en `error.message`.
//
// La propia librería lo documenta: `FunctionsHttpError.context` es el
// `Response` sin consumir, y hay que leerlo con `await error.context.json()`.
//
// Sin esto, cualquier fallo de una Edge Function se ve igual en pantalla y no
// da ninguna pista de qué corregir. Pasó dos veces —con el envío de correo y
// con la sincronización de la tienda—, por eso vive acá y no dentro de uno de
// los dos módulos.
export async function extraerMensajeError(error: unknown, fallback: string): Promise<string> {
  const contexto = (error as { context?: unknown } | null)?.context
  if (contexto && typeof contexto === 'object' && 'json' in contexto) {
    try {
      const cuerpo = await (contexto as Response).clone().json()
      if (cuerpo?.error) return String(cuerpo.error)
    } catch {
      try {
        const texto = await (contexto as Response).text()
        if (texto) return texto
      } catch { /* sigue al fallback */ }
    }
  }
  return error instanceof Error ? error.message : fallback
}
