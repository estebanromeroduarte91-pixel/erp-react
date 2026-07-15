import type { Gasto, Bodega } from '@/types'

export const GASTO_GENERAL_ID = 'general'

// Gastos directos de una sucursal + prorrateo de los gastos "General/Compartido"
// según el % de ventas netas de cada sucursal sobre el total del período.
// Los gastos sin bodega_id (registros antiguos) se tratan como generales.
export function gastosPorSucursal(
  gastos: Gasto[],
  bodegas: Bodega[],
  ventasNetasPorSucursal: Record<string, number>,
): Record<string, number> {
  const esGeneral = (g: Gasto) => !g.bodega_id || g.bodega_id === GASTO_GENERAL_ID
  const totalGenerales = gastos.filter(esGeneral).reduce((s, g) => s + (+g.monto || 0), 0)
  const totalVentas = Object.values(ventasNetasPorSucursal).reduce((s, v) => s + v, 0)

  const resultado: Record<string, number> = {}
  for (const b of bodegas) {
    const directos = gastos
      .filter(g => g.bodega_id === b.id)
      .reduce((s, g) => s + (+g.monto || 0), 0)
    const parte = totalVentas > 0 ? (ventasNetasPorSucursal[b.id] ?? 0) / totalVentas : 0
    resultado[b.id] = directos + totalGenerales * parte
  }
  return resultado
}
