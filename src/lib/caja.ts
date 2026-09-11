import type { CajaMetodoPagoResumen, MetodoPago, Venta } from '@/types'
import { nombreMetodoPago } from '@/lib/metodoPago'

export interface TotalesCaja {
  efectivo: number
  debito: number
  credito: number
  transferencia: number
  otro: number
  _total: number
  _count: number
  desgloseMetodos: CajaMetodoPagoResumen[]
}

/**
 * Resume las ventas de una caja conservando el método configurado real.
 * Los acumulados genéricos se mantienen para la cuadratura de efectivo y
 * compatibilidad con la UI existente; `desgloseMetodos` es el detalle visible
 * y persistido en cada cierre.
 */
export function calcularTotalesCaja(ventas: Venta[], metodos: MetodoPago[]): TotalesCaja {
  const desglose = new Map<string, CajaMetodoPagoResumen>()

  // Mostrar todos los métodos activos en el cierre, incluso si quedaron en $0.
  for (const metodo of metodos) {
    desglose.set(metodo.id, {
      metodoId: metodo.id,
      nombre: metodo.label,
      cantidad: 0,
      monto: 0,
    })
  }

  const totales: TotalesCaja = {
    efectivo: 0,
    debito: 0,
    credito: 0,
    transferencia: 0,
    otro: 0,
    _total: 0,
    _count: 0,
    desgloseMetodos: [],
  }

  for (const venta of ventas) {
    if (venta.estado === 'anulada') continue

    const metodoId = venta.metodo_pago || 'sin-metodo'
    const nombre = nombreMetodoPago(venta.metodo_pago, metodos)
    const monto = Number(venta.total_iva) || 0
    const actual = desglose.get(metodoId) ?? {
      metodoId,
      nombre,
      cantidad: 0,
      monto: 0,
    }

    actual.cantidad += 1
    actual.monto += monto
    desglose.set(metodoId, actual)

    totales._total += monto
    totales._count += 1

    const etiqueta = nombre.toLowerCase()
    if (etiqueta.includes('efect')) totales.efectivo += monto
    else if (etiqueta.includes('debit') || etiqueta.includes('débito')) totales.debito += monto
    else if (etiqueta.includes('credit') || etiqueta.includes('crédito')) totales.credito += monto
    else if (etiqueta.includes('transf')) totales.transferencia += monto
    else totales.otro += monto
  }

  totales.desgloseMetodos = [...desglose.values()]
  return totales
}
