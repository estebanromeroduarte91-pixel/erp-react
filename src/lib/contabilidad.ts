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
