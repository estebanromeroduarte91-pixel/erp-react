/**
 * Determina si una empresa ya no debe operar por vencimiento de su acceso.
 *
 * La fecha viene como timestamptz desde Supabase. Un valor ausente no se
 * interpreta como vencido porque existen empresas históricas sin fecha.
 */
export function suscripcionExpirada(
  planEstado: string | null,
  suscripcionTermina: string | null,
  ahora = new Date(),
): boolean {
  if (planEstado !== 'activo' || !suscripcionTermina) return false
  const fin = new Date(suscripcionTermina)
  return !Number.isNaN(fin.getTime()) && fin.getTime() < ahora.getTime()
}
