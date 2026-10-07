import { describe, expect, it } from 'vitest'
import { tipoSugeridoPorCategoria } from './tipoProducto'
import type { Producto } from '@/types'

const p = (categoria: string, tipo: 'producto' | 'servicio'): Producto =>
  ({ id: Math.random().toString(36), nombre: 'x', categoria, tipo }) as Producto

describe('tipoSugeridoPorCategoria', () => {
  it('sugiere servicio cuando la categoría es de mano de obra', () => {
    // El caso real: todas las "Microsoldadura" del catálogo son servicios.
    const catalogo = Array.from({ length: 6 }, () => p('Microsoldadura', 'servicio'))
    expect(tipoSugeridoPorCategoria(catalogo, 'Microsoldadura')).toBe('servicio')
  })

  it('sugiere producto cuando la categoría es de mercadería', () => {
    const catalogo = Array.from({ length: 10 }, () => p('Accesorios', 'producto'))
    expect(tipoSugeridoPorCategoria(catalogo, 'Accesorios')).toBe('producto')
  })

  it('tolera una excepción dentro de la categoría', () => {
    const catalogo = [...Array.from({ length: 9 }, () => p('Microsoldadura', 'servicio')),
      p('Microsoldadura', 'producto')]
    expect(tipoSugeridoPorCategoria(catalogo, 'Microsoldadura')).toBe('servicio')
  })

  it('no adivina en una categoría mezclada', () => {
    const catalogo = [...Array.from({ length: 5 }, () => p('Servicios', 'servicio')),
      ...Array.from({ length: 5 }, () => p('Servicios', 'producto'))]
    expect(tipoSugeridoPorCategoria(catalogo, 'Servicios')).toBeNull()
  })

  it('no sugiere con muy pocos datos', () => {
    expect(tipoSugeridoPorCategoria([p('Nueva', 'servicio'), p('Nueva', 'servicio')], 'Nueva')).toBeNull()
  })

  it('ignora mayúsculas, espacios y categoría vacía', () => {
    const catalogo = Array.from({ length: 4 }, () => p('Microsoldadura', 'servicio'))
    expect(tipoSugeridoPorCategoria(catalogo, '  MICROSOLDADURA ')).toBe('servicio')
    expect(tipoSugeridoPorCategoria(catalogo, '')).toBeNull()
    expect(tipoSugeridoPorCategoria(catalogo, undefined)).toBeNull()
  })
})
