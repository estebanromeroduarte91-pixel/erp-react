/**
 * Base comisionable de una orden.
 *
 * Acuerdo con el técnico: al bruto cobrado se le descuenta un 19% y sobre ese
 * resultado se aplica el porcentaje de comisión.
 *     $100.000 → base $81.000 → 20% = $16.200
 *
 * OJO: no es lo mismo que quitar el IVA. Dividir por 1,19 daría $84.034 y una
 * comisión de $16.807 — $607 más por orden. El sistema lo hacía así hasta la
 * migración 62; se corrigió a la regla acordada.
 *
 * Debe coincidir con `fn_comision_base` en SQL, que es la autoridad: acá solo
 * se estima para mostrar en pantalla antes de que el servidor lo persista.
 */
export const FACTOR_BASE_COMISION = 0.81

export function baseComisionable(bruto: number): number {
  return Math.round((bruto || 0) * FACTOR_BASE_COMISION)
}

export function montoComision(bruto: number, porcentaje: number): number {
  return Math.round(baseComisionable(bruto) * (porcentaje || 0) / 100)
}
