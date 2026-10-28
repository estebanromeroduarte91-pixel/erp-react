import { describe, expect, it } from 'vitest'
import { buscarEquipoExistente, equiposNuevos, validarDuplicadosEquipos } from './equiposCatalogo'
import type { Equipo } from '@/types'

const catalogo: Equipo[] = [{ id: 'original', marca: 'Apple', modelo: 'iPhone 13' }]

describe('protección del catálogo de equipos', () => {
  it('encuentra el original con diferencias de mayúsculas y espacios', () => {
    expect(buscarEquipoExistente(catalogo, { marca: ' APPLE ', modelo: ' iphone   13 ' })?.id).toBe('original')
  })

  it('permite editar el propio registro, pero no convertir otro en su duplicado', () => {
    expect(buscarEquipoExistente(catalogo, catalogo[0], 'original')).toBeUndefined()
    expect(() => validarDuplicadosEquipos([...catalogo, { id: 'otro', marca: 'apple', modelo: 'IPHONE 13' }], catalogo)).toThrow('ya existe')
  })

  it('conserva variantes y marcas diferentes', () => {
    const variantes = [
      ...catalogo,
      { id: 'pro', marca: 'Apple', modelo: 'iPhone 13 Pro' },
      { id: 'plus', marca: 'Apple', modelo: 'iPhone 13+' },
      { id: 'otra-marca', marca: 'Otra', modelo: 'iPhone 13' },
      { id: '4g', marca: 'Samsung', modelo: 'A26 4G' },
      { id: '5g', marca: 'Samsung', modelo: 'A26 5G' },
    ]
    expect(() => validarDuplicadosEquipos(variantes)).not.toThrow()
  })

  it('omite duplicados existentes y repetidos entre hojas del mismo archivo', () => {
    const candidatos = [
      { id: 'dup', marca: ' apple ', modelo: 'IPHONE  13' },
      { id: 'nuevo', marca: 'Samsung', modelo: 'A26 5G' },
      { id: 'repetido', marca: ' samsung ', modelo: 'a26   5g ' },
    ]
    expect(equiposNuevos(catalogo, candidatos).map(e => e.id)).toEqual(['nuevo'])
  })

  it('permite corregir duplicados antiguos, pero nunca aumentarlos', () => {
    const anteriores = [...catalogo, { ...catalogo[0], id: 'antiguo' }]
    expect(() => validarDuplicadosEquipos(anteriores, anteriores)).not.toThrow()
    expect(() => validarDuplicadosEquipos(catalogo, anteriores)).not.toThrow()
    expect(() => validarDuplicadosEquipos([...anteriores, { ...catalogo[0], id: 'tercero' }], anteriores)).toThrow()
  })
})
