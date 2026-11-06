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
