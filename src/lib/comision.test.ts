import { describe, it, expect } from 'vitest'
import { baseComisionable, montoComision } from './comision'

describe('base comisionable', () => {
  it('descuenta 19% del bruto, no divide por 1,19', () => {
    expect(baseComisionable(100000)).toBe(81000)
    // La regla anterior daba 84.034; si alguien la reintroduce, esto falla.
    expect(baseComisionable(100000)).not.toBe(Math.round(100000 / 1.19))
  })

  it('caso real de la OT #3924', () => {
    expect(baseComisionable(79990)).toBe(64792)
    expect(montoComision(79990, 20)).toBe(12958)
  })

  it('el ejemplo acordado con el técnico', () => {
    expect(montoComision(100000, 20)).toBe(16200)
  })

  it('sin bruto o sin porcentaje no hay comisión', () => {
    expect(montoComision(0, 20)).toBe(0)
    expect(montoComision(100000, 0)).toBe(0)
  })
})
