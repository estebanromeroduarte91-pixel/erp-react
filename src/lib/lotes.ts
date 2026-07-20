import type { LoteInventario } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export function stockDeLotes(lotes: LoteInventario[], productoId: string, bodegaId: string): number {
  return lotes
    .filter(l => l.producto_id === productoId && l.bodega_id === bodegaId)
    .reduce((s, l) => s + (l.cantidad_restante || 0), 0)
}

// Deja las capas de costo (lotes) calzando con una cantidad de stock fijada a mano.
// Si sobra stock en los lotes, se consumen los más antiguos primero (FIFO).
// Si falta, se crea un lote de ajuste con el costo actual del producto.
// No genera ningún asiento contable: la diferencia no afecta la utilidad.
export function reconciliarLotes(
  lotes: LoteInventario[],
  productoId: string,
  bodegaId: string,
  nuevaCantidad: number,
  costoUnitario: number,
): LoteInventario[] {
  const objetivo = Math.max(0, Math.round(nuevaCantidad))
  const actual = stockDeLotes(lotes, productoId, bodegaId)
  const diff = objetivo - actual
  if (diff === 0) return lotes

  // Falta stock en los lotes → nueva capa con el costo actual.
  if (diff > 0) {
    return [...lotes, {
      id: uid(),
      producto_id: productoId,
      bodega_id: bodegaId,
      cantidad_inicial: diff,
      cantidad_restante: diff,
      costo_unitario: costoUnitario,
      origen: 'apertura',
      fecha: new Date().toISOString().split('T')[0],
      creado_en: new Date().toISOString(),
    }]
  }

  // Sobra stock en los lotes → consumir de los más antiguos primero.
  let porQuitar = -diff
  const candidatos = lotes
    .filter(l => l.producto_id === productoId && l.bodega_id === bodegaId && l.cantidad_restante > 0)
    .sort((a, b) => (a.creado_en || a.fecha).localeCompare(b.creado_en || b.fecha))

  let resultado = lotes
  for (const lote of candidatos) {
    if (porQuitar <= 0) break
    const quita = Math.min(lote.cantidad_restante, porQuitar)
    porQuitar -= quita
    resultado = resultado.map(l => l.id === lote.id ? { ...l, cantidad_restante: l.cantidad_restante - quita } : l)
  }
  return resultado
}
