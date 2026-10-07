/**
 * Respuesta de fn_rentabilidad_sucursales: la única fuente del resultado por
 * sucursal y del consolidado. Las pantallas (Dashboard, Resumen ejecutivo,
 * Reportes BI) no suman gastos por su cuenta; leen de acá.
 */

export interface RentabilidadSucursal {
  branch_id: string
  nombre: string
  ventas_netas: number
  transacciones: number
  costo: number
  costo_estimado: number
  lineas_costo_estimado: number
  margen_bruto: number
  gastos_tienda: number
  resultado_cuatro_paredes: number
  participacion_ventas: number
  corporativo_asignado: number
  resultado_completo: number
}

export interface RentabilidadSucursales {
  periodo: { desde: string | null; hasta: string | null }
  /** true = quien consulta solo ve su sucursal (no hay consolidado). */
  restringido: boolean
  sucursales: RentabilidadSucursal[]
  no_asignado: {
    ventas_netas: number; costo: number; margen_bruto: number
    gastos_tienda: number; corporativo: number; resultado: number
  } | null
  corporativo_total: number | null
  fuera_de_operacion: { financiero: number; inversion: number } | null
  consolidado: {
    ventas_netas: number; costo: number; margen_bruto: number
    gastos_tienda: number; corporativo: number; resultado_operacional: number
  } | null
  cuadratura: { consolidado: number; sucursales_mas_no_asignado: number; diferencia_redondeo: number } | null
  calidad: { lineas_costo_estimado: number; monto_costo_estimado: number; sin_comision_medios_pago: boolean }
}

export interface Cascada {
  ventasNetas: number
  costo: number
  margenBruto: number
  gastosTienda: number
  cuatroParedes: number
  corporativo: number
  resultado: number
  /** Crédito, banco y equipos. Solo a nivel empresa; null en una sucursal. */
  fueraDeOperacion: number | null
}

const CERO: Cascada = {
  ventasNetas: 0, costo: 0, margenBruto: 0, gastosTienda: 0,
  cuatroParedes: 0, corporativo: 0, resultado: 0, fueraDeOperacion: null,
}

function deSucursal(s: RentabilidadSucursal | undefined): Cascada {
  if (!s) return CERO
  return {
    ventasNetas: +s.ventas_netas || 0,
    costo: +s.costo || 0,
    margenBruto: +s.margen_bruto || 0,
    gastosTienda: +s.gastos_tienda || 0,
    cuatroParedes: +s.resultado_cuatro_paredes || 0,
    corporativo: +s.corporativo_asignado || 0,
    resultado: +s.resultado_completo || 0,
    fueraDeOperacion: null,
  }
}

/**
 * Cascada de una sucursal (branchId) o de la empresa (null). Un encargado
 * (respuesta restringida) no tiene consolidado: su "total" es su sucursal.
 */
export function cascada(r: RentabilidadSucursales | undefined, branchId: string | null): Cascada {
  if (!r) return CERO
  if (branchId) return deSucursal(r.sucursales.find(s => s.branch_id === branchId))
  if (!r.consolidado) return deSucursal(r.sucursales[0])
  const c = r.consolidado
  const fuera = r.fuera_de_operacion
  return {
    ventasNetas: +c.ventas_netas || 0,
    costo: +c.costo || 0,
    margenBruto: +c.margen_bruto || 0,
    gastosTienda: +c.gastos_tienda || 0,
    cuatroParedes: (+c.margen_bruto || 0) - (+c.gastos_tienda || 0),
    corporativo: +c.corporativo || 0,
    resultado: +c.resultado_operacional || 0,
    fueraDeOperacion: fuera ? (+fuera.financiero || 0) + (+fuera.inversion || 0) : null,
  }
}

/** branch_id → resultado completo (después del corporativo asignado). */
export function resultadoPorSucursal(r: RentabilidadSucursales | undefined): Map<string, number> {
  return new Map((r?.sucursales ?? []).map(s => [s.branch_id, +s.resultado_completo || 0]))
}
