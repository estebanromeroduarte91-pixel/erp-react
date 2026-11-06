/**
 * Compras con factura y sin factura. El folio de la OC es texto libre: además
 * del número de factura, Steve Docs escribe "SIN FACTURA" cuando compra sin
 * ella a propósito (51 de 126 OC al 2026-11-05). Lo usan Compras (tarjetas
 * Con factura / Sin factura) y Cierres (IVA crédito del mes).
 */
import type { OC } from '@/types'

export type GrupoFactura = 'con' | 'sin' | 'vacio'

/** Solo un folio con números es una factura que da crédito fiscal. */
export function folioConFactura(folio: string | null | undefined): boolean {
  const f = (folio ?? '').trim()
  return /\d/.test(f) && !/^(sin|s\/f|no)\b/i.test(f)
}

/** "vacio" = nadie anotó nada: no se sabe si hubo factura. */
export function grupoFactura(oc: Pick<OC, 'folio_factura'>): GrupoFactura {
  if (folioConFactura(oc.folio_factura)) return 'con'
  return oc.folio_factura?.trim() ? 'sin' : 'vacio'
}

export interface TotalFactura {
  cantidad: number
  /** Suma de cantidad × precio neto de las líneas. */
  neto: number
  /** Solo en las con factura: total − neto, el IVA que se descuenta en el F29. */
  iva: number
  /** El total de la OC tal como lo guarda Pixit. */
  total: number
}

export type ResumenFactura = Record<'todas' | GrupoFactura, TotalFactura>

function netoOC(oc: Pick<OC, 'items'>): number {
  return (oc.items ?? []).reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_neto) || 0), 0)
}

/** Las canceladas no son compras: no suman a ningún total. */
export function resumenFactura(ocs: Pick<OC, 'folio_factura' | 'items' | 'total' | 'estado'>[]): ResumenFactura {
  const vacio = (): TotalFactura => ({ cantidad: 0, neto: 0, iva: 0, total: 0 })
  const r: ResumenFactura = { todas: vacio(), con: vacio(), sin: vacio(), vacio: vacio() }
  for (const oc of ocs) {
    if (oc.estado === 'cancelada') continue
    const g = grupoFactura(oc)
    const neto = netoOC(oc)
    const total = Number(oc.total) || 0
    const iva = g === 'con' ? Math.max(0, total - neto) : 0
    for (const k of ['todas', g] as const) {
      r[k].cantidad++
      r[k].neto += neto
      r[k].iva += iva
      r[k].total += total
    }
  }
  return r
}
