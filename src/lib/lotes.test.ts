import { describe, it, expect } from 'vitest'
import { stockDeLotes, reconciliarLotes } from './lotes'
import type { LoteInventario } from '@/types'

function lote(overrides: Partial<LoteInventario>): LoteInventario {
  return {
    id: 'lote-1',
    producto_id: 'prod-1',
    bodega_id: 'bod-1',
    cantidad_inicial: 10,
    cantidad_restante: 10,
    costo_unitario: 1000,
    origen: 'apertura',
    fecha: '2026-01-01',
    creado_en: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('stockDeLotes', () => {
  it('suma cantidad_restante solo del producto/bodega pedido', () => {
    const lotes = [
      lote({ id: 'a', cantidad_restante: 3 }),
      lote({ id: 'b', cantidad_restante: 2 }),
      lote({ id: 'c', producto_id: 'otro-prod', cantidad_restante: 100 }),
      lote({ id: 'd', bodega_id: 'otra-bodega', cantidad_restante: 100 }),
    ]
    expect(stockDeLotes(lotes, 'prod-1', 'bod-1')).toBe(5)
  })

  it('devuelve 0 si no hay lotes para ese producto/bodega', () => {
    expect(stockDeLotes([], 'prod-1', 'bod-1')).toBe(0)
  })
})

describe('reconciliarLotes', () => {
  it('no toca nada si la cantidad ya calza', () => {
    const lotes = [lote({ cantidad_restante: 5 })]
    expect(reconciliarLotes(lotes, 'prod-1', 'bod-1', 5, 1000)).toBe(lotes)
  })

  it('crea una capa nueva de "apertura" cuando falta stock en los lotes', () => {
    const lotes = [lote({ cantidad_restante: 5 })]
    const resultado = reconciliarLotes(lotes, 'prod-1', 'bod-1', 8, 1500)
    expect(resultado).toHaveLength(2)
    const nueva = resultado.find(l => l.id !== 'lote-1')!
    expect(nueva.cantidad_inicial).toBe(3)
    expect(nueva.cantidad_restante).toBe(3)
    expect(nueva.costo_unitario).toBe(1500)
    expect(nueva.origen).toBe('apertura')
  })

  it('consume el lote más antiguo primero cuando sobra stock (FIFO)', () => {
    const lotes = [
      lote({ id: 'viejo', cantidad_restante: 4, creado_en: '2026-01-01T00:00:00Z' }),
      lote({ id: 'nuevo', cantidad_restante: 4, creado_en: '2026-02-01T00:00:00Z' }),
    ]
    // Había 8, queda solo 5 → hay que quitar 3, todos del lote más viejo.
    const resultado = reconciliarLotes(lotes, 'prod-1', 'bod-1', 5, 1000)
    const viejo = resultado.find(l => l.id === 'viejo')!
    const nuevo = resultado.find(l => l.id === 'nuevo')!
    expect(viejo.cantidad_restante).toBe(1)
    expect(nuevo.cantidad_restante).toBe(4)
  })

  it('sigue al segundo lote más antiguo si el primero no alcanza', () => {
    const lotes = [
      lote({ id: 'viejo', cantidad_restante: 2, creado_en: '2026-01-01T00:00:00Z' }),
      lote({ id: 'nuevo', cantidad_restante: 4, creado_en: '2026-02-01T00:00:00Z' }),
    ]
    // Había 6, queda 1 → hay que quitar 5: los 2 del viejo + 3 del nuevo.
    const resultado = reconciliarLotes(lotes, 'prod-1', 'bod-1', 1, 1000)
    const viejo = resultado.find(l => l.id === 'viejo')!
    const nuevo = resultado.find(l => l.id === 'nuevo')!
    expect(viejo.cantidad_restante).toBe(0)
    expect(nuevo.cantidad_restante).toBe(1)
  })

  it('la cantidad nunca queda negativa (se redondea a 0 como mínimo)', () => {
    const lotes = [lote({ cantidad_restante: 5 })]
    const resultado = reconciliarLotes(lotes, 'prod-1', 'bod-1', -3, 1000)
    expect(stockDeLotes(resultado, 'prod-1', 'bod-1')).toBe(0)
  })
})
