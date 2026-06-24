import type { Gasto, Asiento, AsientoLinea, CuentaContable } from '@/types'

// Método de pago → cuenta de contrapartida (Haber) del asiento de un gasto.
// Efectivo sale de Caja; transferencia/tarjeta/cheque del Banco; "Crédito" es
// una compra al fiado, por lo que se reconoce como Cuentas por Pagar (pasivo).
export function cuentaHaberDeMetodo(metodo?: string): string {
  switch (metodo) {
    case 'Efectivo': return 'pc-110' // Caja
    case 'Crédito':  return 'pc-210' // Cuentas por Pagar (Proveedores)
    case 'Transferencia':
    case 'Tarjeta':
    case 'Cheque':
    default:         return 'pc-120' // Banco
  }
}

// Siguiente número correlativo para un asiento nuevo.
export function nextNumeroAsiento(asientos: Asiento[]): number {
  return asientos.reduce((max, a) => Math.max(max, a.numero ?? 0), 0) + 1
}

// id determinístico del asiento generado por un gasto (permite editar/eliminar en sincronía).
export function asientoIdDeGasto(gastoId: string): string {
  return `as-gasto-${gastoId}`
}

// Construye el asiento de partida doble correspondiente a un gasto:
//   Debe  = cuenta de la categoría del gasto (vía catCuentaMap; fallback Otros Gastos)
//   Haber = cuenta según el método de pago
export function asientoDeGasto(
  gasto: Gasto,
  plan: CuentaContable[],
  catCuentaMap: Record<string, string>,
  numero?: number,
): Asiento {
  const find = (id: string) => plan.find((c) => c.id === id)
  const fallbackGasto = find('pc-595') ?? plan[0]
  const fallbackPago = find('pc-110') ?? plan[0]

  const cuentaDebe = find(catCuentaMap[gasto.categoria] ?? 'pc-595') ?? fallbackGasto
  const cuentaHaber = find(cuentaHaberDeMetodo(gasto.metodo)) ?? fallbackPago

  const linea = (c: CuentaContable, debe: number, haber: number): AsientoLinea => ({
    cuenta_id: c.id, cuenta_codigo: c.codigo, cuenta_nombre: c.nombre, debe, haber,
  })

  return {
    id: asientoIdDeGasto(gasto.id),
    numero,
    fecha: gasto.fecha,
    descripcion: gasto.descripcion?.trim() || gasto.categoria || 'Gasto',
    ref_tipo: 'gasto',
    ref_id: gasto.id,
    lineas: [
      linea(cuentaDebe, gasto.monto, 0),
      linea(cuentaHaber, 0, gasto.monto),
    ],
  }
}

// ── Órdenes de compra ────────────────────────────────────────

// Método de pago de una OC → cuenta de contrapartida (Haber).
export function cuentaHaberDeMetodoOC(metodo?: string): string {
  switch (metodo) {
    case 'caja':    return 'pc-110' // Caja (efectivo)
    case 'credito': return 'pc-210' // Cuentas por Pagar (a crédito)
    case 'banco':
    default:        return 'pc-120' // Banco (transferencia)
  }
}

export function asientoIdDeOC(ocId: string): string {
  return `as-oc-${ocId}`
}

type OCParaAsiento = {
  id: string
  numero?: string
  total?: number
  fecha?: string
  proveedor_nombre?: string
  folio_factura?: string
  metodo_pago?: string
}

// Construye el asiento de partida doble de una orden de compra al confirmarla.
//   Con factura:  Debe Inventario (neto) + Debe IVA Crédito Fiscal (19%) / Haber pago (total c/IVA)
//   Sin factura:  Debe Inventario (total pagado)                          / Haber pago (mismo total)
// `sinFactura` se determina desde el folio ("SIN FACTURA" o vacío): sin documento no hay IVA recuperable.
export function asientoDeOC(
  oc: OCParaAsiento,
  metodo: string,
  sinFactura: boolean,
  plan: CuentaContable[],
  numero?: number,
): Asiento {
  const find = (id: string) => plan.find((c) => c.id === id)
  const neto = oc.total ?? 0
  const totalPagar = sinFactura ? neto : Math.round(neto * 1.19)
  const iva = totalPagar - neto // 0 cuando es sin factura

  const inventario = find('pc-140') ?? plan[0]
  const ivaCredito = find('pc-150') ?? plan[0]
  const contrapartida = find(cuentaHaberDeMetodoOC(metodo)) ?? find('pc-120') ?? plan[0]

  const linea = (c: CuentaContable, debe: number, haber: number): AsientoLinea => ({
    cuenta_id: c.id, cuenta_codigo: c.codigo, cuenta_nombre: c.nombre, debe, haber,
  })

  const lineas: AsientoLinea[] = [linea(inventario, neto, 0)]
  if (iva > 0) lineas.push(linea(ivaCredito, iva, 0))
  lineas.push(linea(contrapartida, 0, totalPagar))

  const sufijo = sinFactura ? ' · Sin factura' : oc.folio_factura ? ` · Fact. ${oc.folio_factura}` : ''
  return {
    id: asientoIdDeOC(oc.id),
    numero,
    fecha: oc.fecha || new Date().toISOString().split('T')[0],
    descripcion: `Compra ${oc.numero ?? ''}${oc.proveedor_nombre ? ` · ${oc.proveedor_nombre}` : ''}${sufijo}`.trim(),
    ref_tipo: 'oc',
    ref_id: oc.id,
    ref_numero: oc.numero ? String(oc.numero) : undefined,
    lineas,
  }
}
