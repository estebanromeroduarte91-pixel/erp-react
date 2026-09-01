import { describe, it, expect } from 'vitest'
import { resumenProductos, nombresProductos } from './venta'
import type { VentaItem } from '@/types'

const item = (nombre: string): VentaItem => ({
  id: nombre, producto_id: null, producto_nombre: nombre,
  cantidad: 1, precio_neto: 0, precio_iva: 0, descuento: 0, subtotal: 0,
})

describe('resumenProductos', () => {
  it('sin artículos devuelve null', () => {
    expect(resumenProductos([])).toBeNull()
    expect(resumenProductos(undefined)).toBeNull()
  })

  it('un artículo no anuncia extras', () => {
    expect(resumenProductos([item('Lámina Hidrogel')])).toEqual({ primero: 'Lámina Hidrogel', extra: 0 })
  })

  it('varios artículos cuentan los que faltan', () => {
    expect(resumenProductos([item('Batería'), item('Cable'), item('Mica')]))
      .toEqual({ primero: 'Batería', extra: 2 })
  })

  it('un nombre vacío no deja la celda en blanco', () => {
    expect(resumenProductos([item('   ')])).toEqual({ primero: 'Sin nombre', extra: 0 })
  })
})

describe('nombresProductos', () => {
  it('une todos los nombres para el tooltip', () => {
    expect(nombresProductos([item('Batería'), item('Cable')])).toBe('Batería, Cable')
  })
  it('sin artículos devuelve cadena vacía', () => {
    expect(nombresProductos(undefined)).toBe('')
  })
})
