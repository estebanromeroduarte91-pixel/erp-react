import { describe, it, expect } from 'vitest'
import { gastosPorSucursal, GASTO_GENERAL_ID } from './gastos'
import type { Gasto, Bodega } from '@/types'

// Esta función decide cuánto gasto carga cada sucursal, y de ahí sale la
// "Utilidad por sucursal" de Estadísticas. Un error acá no se ve: los números
// siguen pareciendo plausibles, solo que mal repartidos.

const bodegas = [
  { id: 'suc-a', nombre: 'La Dehesa' },
  { id: 'suc-b', nombre: 'Los Dominicos' },
] as Bodega[]

function gasto(monto: number, bodega_id?: string): Gasto {
  return { id: Math.random().toString(36), monto, bodega_id } as Gasto
}

describe('gastosPorSucursal', () => {
  it('asigna los gastos directos a su propia sucursal', () => {
    const r = gastosPorSucursal(
      [gasto(1000, 'suc-a'), gasto(500, 'suc-b')],
      bodegas,
      { 'suc-a': 100, 'suc-b': 100 },
    )
    expect(r['suc-a']).toBe(1000)
    expect(r['suc-b']).toBe(500)
  })

  it('prorratea los gastos generales según el % de ventas netas', () => {
    // 900 de gasto general, con 75% / 25% de las ventas → 675 / 225.
    const r = gastosPorSucursal(
      [gasto(900, GASTO_GENERAL_ID)],
      bodegas,
      { 'suc-a': 750, 'suc-b': 250 },
    )
    expect(r['suc-a']).toBe(675)
    expect(r['suc-b']).toBe(225)
  })

  it('trata los gastos sin bodega_id como generales (registros antiguos)', () => {
    const r = gastosPorSucursal([gasto(100)], bodegas, { 'suc-a': 50, 'suc-b': 50 })
    expect(r['suc-a']).toBe(50)
    expect(r['suc-b']).toBe(50)
  })

  it('suma lo directo y la parte prorrateada', () => {
    const r = gastosPorSucursal(
      [gasto(200, 'suc-a'), gasto(1000, GASTO_GENERAL_ID)],
      bodegas,
      { 'suc-a': 300, 'suc-b': 700 },
    )
    expect(r['suc-a']).toBe(200 + 300)   // 200 directos + 30% de 1000
    expect(r['suc-b']).toBe(700)         // 70% de 1000
  })

  it('sin ventas en el período no reparte los generales (no divide por cero)', () => {
    const r = gastosPorSucursal(
      [gasto(500, GASTO_GENERAL_ID)],
      bodegas,
      { 'suc-a': 0, 'suc-b': 0 },
    )
    expect(r['suc-a']).toBe(0)
    expect(r['suc-b']).toBe(0)
    expect(Number.isNaN(r['suc-a'])).toBe(false)
  })

  it('reparte el total de generales sin perder ni inventar plata', () => {
    const total = 1234
    const r = gastosPorSucursal(
      [gasto(total, GASTO_GENERAL_ID)],
      bodegas,
      { 'suc-a': 411, 'suc-b': 589 },
    )
    expect(r['suc-a'] + r['suc-b']).toBeCloseTo(total, 6)
  })

  it('una sucursal sin ventas no recibe parte de los gastos generales', () => {
    const r = gastosPorSucursal(
      [gasto(800, GASTO_GENERAL_ID)],
      bodegas,
      { 'suc-a': 1000, 'suc-b': 0 },
    )
    expect(r['suc-a']).toBe(800)
    expect(r['suc-b']).toBe(0)
  })

  it('ignora montos no numéricos en vez de propagar NaN', () => {
    const r = gastosPorSucursal(
      [{ id: 'x', monto: undefined, bodega_id: 'suc-a' } as unknown as Gasto],
      bodegas,
      { 'suc-a': 100, 'suc-b': 0 },
    )
    expect(r['suc-a']).toBe(0)
  })
})
