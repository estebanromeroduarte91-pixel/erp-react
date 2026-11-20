import type { Gasto, Venta } from '@/types'
import { fechaLocal } from './fecha'

export type RangoComparacion = 'hoy' | 'mes' | 'año' | 'rango'

export interface ResumenVentas {
  ventasBrutas: number
  ventasNetas: number
  costoVentas: number
  cantidadVentas: number
  ticketPromedio: number
}

export interface CostoProducto {
  productoId: string | null
  nombre: string
  sucursalId: string | null
  cantidad: number
  costo: number
}

export interface GastoCategoria {
  categoria: string
  sucursalId: string | null
  sucursalNombre: string | null
  cantidad: number
  monto: number
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
 * Mismo costo que calcularCostoVentas, pero desglosado por producto y
 * sucursal — para el drill-down de "Costo de productos vendidos" en el
 * Dashboard. Se agrupa por producto_id (o nombre si no hay id) cruzado con
 * la sucursal de la venta: el mismo producto vendido en dos locales aparece
 * como dos líneas, para poder mostrar a qué sucursal corresponde cada costo.
 */
export function costoPorProducto(
  ventas: Venta[],
  costosActuales: ReadonlyMap<string, number> = new Map(),
): CostoProducto[] {
  const porClave = new Map<string, CostoProducto>()

  for (const venta of filtrarVentasPagadas(ventas)) {
    const sucursalId = venta.branchId ?? null
    for (const item of venta.items ?? []) {
      const costo = item.costo_total != null
        ? (+item.costo_total || 0)
        : item.producto_id
          ? (+item.cantidad || 0) * (costosActuales.get(item.producto_id) ?? 0)
          : 0
      const nombre = item.producto_nombre?.trim() || 'Sin nombre'
      const clave = `${sucursalId ?? 'sin-sucursal'}::${item.producto_id ?? `nombre:${nombre}`}`
      const actual = porClave.get(clave) ?? { productoId: item.producto_id, nombre, sucursalId, cantidad: 0, costo: 0 }
      actual.cantidad += +item.cantidad || 0
      actual.costo += costo
      porClave.set(clave, actual)
    }
  }

  return [...porClave.values()].sort((a, b) => b.costo - a.costo)
}

/**
 * Gastos operacionales agrupados por categoría y sucursal — mismo propósito
 * que costoPorProducto, para el drill-down de "Gastos operacionales" en el
 * Dashboard. `bodega_id` vale 'general' para gastos compartidos entre todas
 * las sucursales (ej. sueldo del dueño); esos quedan sin sucursalId.
 */
export function gastosPorCategoria(gastos: Gasto[]): GastoCategoria[] {
  const porClave = new Map<string, GastoCategoria>()

  for (const g of gastos) {
    const categoria = g.categoria?.trim() || 'Sin categoría'
    const sucursalId = g.bodega_id && g.bodega_id !== 'general' ? g.bodega_id : null
    const clave = `${sucursalId ?? 'general'}::${categoria}`
    const actual = porClave.get(clave) ?? { categoria, sucursalId, sucursalNombre: g.bodega_nombre ?? null, cantidad: 0, monto: 0 }
    actual.cantidad += 1
    actual.monto += +g.monto || 0
    porClave.set(clave, actual)
  }

  return [...porClave.values()].sort((a, b) => b.monto - a.monto)
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
