import type { Venta } from '@/types'
import { fechaLocal } from './fecha'

export type RangoComparacion = 'hoy' | 'mes' | 'año' | 'rango'

export interface ResumenVentas {
  ventasBrutas: number
  ventasNetas: number
  costoVentas: number
  cantidadVentas: number
  ticketPromedio: number
}

/** Sólo una venta pagada representa un ingreso realizado. */
export function esVentaPagada(venta: Venta): boolean {
  return venta.estado === 'pagada'
}

export function filtrarVentasPagadas(ventas: Venta[]): Venta[] {
  return ventas.filter(esVentaPagada)
}

/**
 * Costo de ventas: prioriza el costo FIFO congelado al confirmar la venta.
 * El mapa es únicamente una compatibilidad para registros históricos que aún
 * no tienen costo_total; nunca reemplaza un costo congelado, incluso si es 0.
 */
export function calcularCostoVentas(
  ventas: Venta[],
  costosActuales: ReadonlyMap<string, number> = new Map(),
): number {
  return ventas.reduce((total, venta) => total + (venta.items ?? []).reduce((subtotal, item) => {
    if (item.costo_total != null) return subtotal + (+item.costo_total || 0)
    if (!item.producto_id) return subtotal
    return subtotal + (+item.cantidad || 0) * (costosActuales.get(item.producto_id) ?? 0)
  }, 0), 0)
}

/**
 * Ventas, costo vendido y ticket del período. El resultado (gastos de tienda,
 * corporativo, fuera de operación) NO se calcula acá: sale de
 * fn_rentabilidad_sucursales — ver src/lib/rentabilidad.ts.
 */
export function calcularResumenVentas(
  ventas: Venta[],
  costosActuales: ReadonlyMap<string, number> = new Map(),
): ResumenVentas {
  const pagadas = filtrarVentasPagadas(ventas)
  const ventasBrutas = pagadas.reduce((s, venta) => s + (+venta.total_iva || 0), 0)
  const ventasNetas = pagadas.reduce((s, venta) => s + (+venta.total || 0), 0)
  const cantidadVentas = pagadas.length

  return {
    ventasBrutas,
    ventasNetas,
    costoVentas: calcularCostoVentas(pagadas, costosActuales),
    cantidadVentas,
    ticketPromedio: cantidadVentas > 0 ? Math.round(ventasBrutas / cantidadVentas) : 0,
  }
}

function parseFecha(fecha: string): Date {
  const [year, month, day] = fecha.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function moverDias(fecha: string, dias: number): string {
  const d = parseFecha(fecha)
  d.setDate(d.getDate() + dias)
  return fechaLocal(d)
}

/** Período anterior comparable: MTD contra MTD y YTD contra YTD. */
export function periodoAnteriorEquivalente(
  rango: RangoComparacion,
  desde: string,
  hasta: string,
): { desde: string; hasta: string } {
  if (rango === 'hoy') {
    const anterior = moverDias(hasta, -1)
    return { desde: anterior, hasta: anterior }
  }

  if (rango === 'mes') {
    const finActual = parseFecha(hasta)
    const inicioAnterior = new Date(finActual.getFullYear(), finActual.getMonth() - 1, 1)
    const ultimoDiaAnterior = new Date(finActual.getFullYear(), finActual.getMonth(), 0).getDate()
    const finAnterior = new Date(
      inicioAnterior.getFullYear(),
      inicioAnterior.getMonth(),
      Math.min(finActual.getDate(), ultimoDiaAnterior),
    )
    return { desde: fechaLocal(inicioAnterior), hasta: fechaLocal(finAnterior) }
  }

  if (rango === 'año') {
    const finActual = parseFecha(hasta)
    const year = finActual.getFullYear() - 1
    const ultimoDiaMes = new Date(year, finActual.getMonth() + 1, 0).getDate()
    const finAnterior = new Date(year, finActual.getMonth(), Math.min(finActual.getDate(), ultimoDiaMes))
    return { desde: `${year}-01-01`, hasta: fechaLocal(finAnterior) }
  }

  const inicio = parseFecha(desde)
  const fin = parseFecha(hasta)
  const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1
  const finAnterior = moverDias(desde, -1)
  return { desde: moverDias(finAnterior, -(dias - 1)), hasta: finAnterior }
}

/**
 * Fecha en que una orden de compra se convierte de verdad en una compra.
 *
 * `fecha` es la de creación, y una OC puede crearse en julio y recibirse en
 * agosto: contarla por la fecha de creación la deja en el mes equivocado.
 * Se usa la recepción cuando existe, la confirmación si no, y recién al final
 * la creación — que es lo único que tienen las OC antiguas.
 */
export function fechaEfectivaOC(oc: {
  fecha: string
  fecha_recepcion?: string
  fecha_primera_recepcion?: string
  fecha_confirmacion?: string
}): string {
  const fecha = oc.fecha_primera_recepcion || oc.fecha_recepcion || oc.fecha_confirmacion || oc.fecha
  return String(fecha).slice(0, 10)
}

/**
 * Cuántos días hacia atrás se piden las órdenes de compra.
 *
 * Se cuentan por fecha de recepción, pero la consulta filtra por fecha de
 * creación: sin este margen, una OC creada antes del período y recibida dentro
 * de él nunca llegaría al navegador para poder contarla.
 */
export const MARGEN_OC_DIAS = 120

export function restarDias(fecha: string, dias: number): string {
  return moverDias(fecha, -dias)
}

/** Neto e IVA a partir de un monto con IVA incluido. */
export function separarIva(montoTotal: number, tasa = 0.19): { neto: number; iva: number } {
  const neto = Math.round(montoTotal / (1 + tasa))
  return { neto, iva: Math.round(montoTotal) - neto }
}
