import type { Gasto, Bodega } from '@/types'

export const GASTO_GENERAL_ID = 'general'

export interface DistribucionGastos {
  porSucursal: Record<string, number>
  noAsignado: number
}

// Gastos directos de una sucursal + prorrateo de los gastos "General/Compartido"
// según el % de ventas netas de cada sucursal sobre el total del período.
// Los gastos sin bodega_id (registros antiguos) se tratan como generales.
export function gastosPorSucursal(
  gastos: Gasto[],
  bodegas: Bodega[],
  ventasNetasPorSucursal: Record<string, number>,
): Record<string, number> {
  return distribuirGastosPorSucursal(gastos, bodegas, ventasNetasPorSucursal).porSucursal
}

// Igual que gastosPorSucursal, pero conserva explícitamente todo monto que no
// se puede repartir. Así la suma por sucursales siempre puede reconciliarse con
// el resultado global, incluso si no hubo ventas o se eliminó una sucursal.
export function distribuirGastosPorSucursal(
  gastos: Gasto[],
  bodegas: Bodega[],
  ventasNetasPorSucursal: Record<string, number>,
): DistribucionGastos {
  const esGeneral = (g: Gasto) => !g.bodega_id || g.bodega_id === GASTO_GENERAL_ID
  const totalGenerales = gastos.filter(esGeneral).reduce((s, g) => s + (+g.monto || 0), 0)
  const totalVentas = Object.values(ventasNetasPorSucursal).reduce((s, v) => s + v, 0)
  const idsValidos = new Set(bodegas.map(b => b.id))
  const directosSinSucursal = gastos
    .filter(g => !esGeneral(g) && !idsValidos.has(g.bodega_id!))
    .reduce((s, g) => s + (+g.monto || 0), 0)

  const resultado: Record<string, number> = {}
  for (const b of bodegas) {
    const directos = gastos
      .filter(g => g.bodega_id === b.id)
      .reduce((s, g) => s + (+g.monto || 0), 0)
    const parte = totalVentas > 0 ? (ventasNetasPorSucursal[b.id] ?? 0) / totalVentas : 0
    resultado[b.id] = directos + totalGenerales * parte
  }
  return {
    porSucursal: resultado,
    noAsignado: directosSinSucursal + (totalVentas > 0 ? 0 : totalGenerales),
  }
}
