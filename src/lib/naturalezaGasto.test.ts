import { describe, expect, it } from 'vitest'
import {
  bodegaAlCambiarNaturaleza, errorDeClasificacion, naturalezaEfectiva, naturalezaSugerida,
  type ConfigNaturaleza,
} from './naturalezaGasto'
import { GASTO_GENERAL_ID } from './gastos'

const config: ConfigNaturaleza = new Map([
  ['arriendo', 'tienda'],
  ['publicidad y marketing', 'corporativo'],
  ['gastos banco', 'financiero'],
  ['compra equipo', 'inversion'],
  ['sueldos', 'tienda'],
  ['sueldos|esteban romero', 'corporativo'],
])

describe('naturalezaSugerida', () => {
  it('ignora mayúsculas y espacios', () => {
    expect(naturalezaSugerida('  ARRIENDO ', config)).toBe('tienda')
  })
  it('la persona manda sobre la categoría', () => {
    expect(naturalezaSugerida('Sueldos', config, 'Esteban Romero')).toBe('corporativo')
    expect(naturalezaSugerida('Sueldos', config, ' esteban ROMERO ')).toBe('corporativo')
  })
  it('sin regla para la persona, vale la de la categoría', () => {
    expect(naturalezaSugerida('Sueldos', config, 'Candela Rodriguez')).toBe('tienda')
    expect(naturalezaSugerida('Sueldos', config, '')).toBe('tienda')
  })
  it('no inventa nada para una categoría desconocida o sin config', () => {
    expect(naturalezaSugerida('Otros', config)).toBeUndefined()
    expect(naturalezaSugerida('Arriendo', undefined)).toBeUndefined()
    expect(naturalezaSugerida(undefined, config)).toBeUndefined()
  })
})

describe('naturalezaEfectiva', () => {
  it('la decisión del gasto manda sobre la categoría', () => {
    expect(naturalezaEfectiva({ naturaleza: 'inversion', categoria: 'Arriendo', bodega_id: 'suc-a' }, config)).toBe('inversion')
  })
  it('un gasto histórico usa la sugerencia de su categoría', () => {
    expect(naturalezaEfectiva({ categoria: 'Gastos Banco', bodega_id: 'general' }, config)).toBe('financiero')
  })
  it('un sueldo histórico del administrador es corporativo', () => {
    expect(naturalezaEfectiva({ categoria: 'Sueldos', subcategoria: 'Esteban Romero', bodega_id: 'suc-a' }, config)).toBe('corporativo')
  })
  it('sin categoría conocida, deduce por la sucursal', () => {
    expect(naturalezaEfectiva({ categoria: 'Otros', bodega_id: GASTO_GENERAL_ID }, config)).toBe('corporativo')
    expect(naturalezaEfectiva({ categoria: 'Otros', bodega_id: 'suc-a' }, config)).toBe('tienda')
    expect(naturalezaEfectiva({ categoria: 'Otros' }, config)).toBe('corporativo')
  })
})

describe('bodegaAlCambiarNaturaleza', () => {
  it('corporativo siempre es general', () => {
    expect(bodegaAlCambiarNaturaleza('corporativo', 'suc-a')).toBe(GASTO_GENERAL_ID)
  })
  it('tienda conserva la sucursal elegida', () => {
    expect(bodegaAlCambiarNaturaleza('tienda', 'suc-a')).toBe('suc-a')
  })
  it('tienda que venía de general obliga a elegir sucursal', () => {
    expect(bodegaAlCambiarNaturaleza('tienda', GASTO_GENERAL_ID)).toBe('')
  })
  it('financiero e inversión conservan la sucursal o caen en general', () => {
    expect(bodegaAlCambiarNaturaleza('financiero', 'suc-a')).toBe('suc-a')
    expect(bodegaAlCambiarNaturaleza('inversion', '')).toBe(GASTO_GENERAL_ID)
  })
})

describe('errorDeClasificacion', () => {
  it('un gasto de tienda necesita una sucursal concreta', () => {
    expect(errorDeClasificacion('tienda', '')).not.toBeNull()
    expect(errorDeClasificacion('tienda', GASTO_GENERAL_ID)).not.toBeNull()
    expect(errorDeClasificacion('tienda', 'suc-a')).toBeNull()
  })
  it('corporativo, financiero e inversión valen con general', () => {
    expect(errorDeClasificacion('corporativo', GASTO_GENERAL_ID)).toBeNull()
    expect(errorDeClasificacion('financiero', GASTO_GENERAL_ID)).toBeNull()
    expect(errorDeClasificacion('inversion', '')).not.toBeNull()
  })
})
