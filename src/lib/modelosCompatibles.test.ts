import { describe, expect, it } from 'vitest'
import { agregarModelos, escribirModelos, leerModelos } from './modelosCompatibles'
import { puntuarBusqueda } from './texto'

describe('modelos compatibles', () => {
  it('lee el texto guardado y quita vacíos, espacios y repetidos', () => {
    expect(leerModelos(' iPhone 12 ,iphone  12, iPhone 12 Pro,, ')).toEqual(['iPhone 12', 'iPhone 12 Pro'])
    expect(leerModelos(null)).toEqual([])
  })

  it('escribe la lista como texto separado por coma', () => {
    expect(escribirModelos(['iPhone 12', 'iPhone 12 Pro'])).toBe('iPhone 12, iPhone 12 Pro')
    expect(escribirModelos([])).toBe('')
  })

  it('agrega varios de una vez sin repetir uno escrito distinto', () => {
    expect(agregarModelos(['iPhone 12'], 'IPHONE 12, iPhone 12 Pro')).toEqual(['iPhone 12', 'iPhone 12 Pro'])
  })

  it('la búsqueda de Inventario encuentra el producto por un modelo compatible', () => {
    const campos = {
      principal: 'Batería iPhone 12',
      secundarios: ['Baterías', 'iPhone 12, iPhone 12 Pro'],
    }
    expect(puntuarBusqueda('bateria 12 pro', campos)).not.toBeNull()
    expect(puntuarBusqueda('bateria 13', campos)).toBeNull()
  })
})

describe('palabras de búsqueda de productos', () => {
  it('quedan sin tildes ni comodines, igual que texto_busqueda', async () => {
    const { palabrasBusquedaProducto } = await import('./texto')
    expect(palabrasBusquedaProducto('  Batería  iPhone 12%_ ')).toEqual(['bateria', 'iphone', '12'])
    expect(palabrasBusquedaProducto('PANTALLA Niño')).toEqual(['pantalla', 'nino'])
    expect(palabrasBusquedaProducto('   ')).toEqual([])
  })
})

describe('orden de la búsqueda de productos', () => {
  it('pone primero el que calza por número completo y deja los demás al final', async () => {
    const { ordenarPorRelevancia } = await import('./queries')
    const p = (id: string, nombre: string, extra = {}) => ({ id, nombre, categoria: 'Batería', ...extra })
    const orden = ordenarPorRelevancia('bateria 12 pro', [
      p('a', 'MacBook Pro A3112 Batería'),
      p('b', 'iPhone 12 Pro Max Batería'),
      p('c', 'iPhone 12', { modelos_compatibles: 'iPhone 12 Pro' }),
    ]).map(x => x.id)
    expect(orden.slice(0, 2).sort()).toEqual(['b', 'c'])
    expect(orden[2]).toBe('a')
  })
})
