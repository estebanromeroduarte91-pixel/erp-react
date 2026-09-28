import { describe, expect, it } from 'vitest'
import { coincideAsignacion, SIN_ASIGNACION } from './gastoFiltros'

describe('coincideAsignacion', () => {
  it('agrupa variantes de nombre y tildes', () => {
    const filtro = { clave: 'esteban romero', nombre: 'Esteban Romero' }
    expect(coincideAsignacion('esteban', filtro)).toBe(true)
    expect(coincideAsignacion('ESTEBAN ROMERO', filtro)).toBe(true)
    expect(coincideAsignacion('Juan Quinteros', filtro)).toBe(false)
  })

  it('permite filtrar gastos sin persona asignada', () => {
    const filtro = { clave: SIN_ASIGNACION, nombre: 'Sin subcategoría' }
    expect(coincideAsignacion(undefined, filtro)).toBe(true)
    expect(coincideAsignacion('', filtro)).toBe(true)
    expect(coincideAsignacion('Esteban Romero', filtro)).toBe(false)
  })
})
