import { describe, expect, it } from 'vitest'
import { calcularPagoViaje } from './calcularPagoViaje'

describe('calcularPagoViaje', () => {
  it('calcula el pago por kilómetros', () => {
    expect(calcularPagoViaje(12, 700, 0)).toBe(8400)
    expect(calcularPagoViaje(12.5, 700, 0)).toBe(8750)
  })

  it('respeta el mínimo pactado', () => {
    expect(calcularPagoViaje(3, 700, 3000)).toBe(3000)
  })

  it('no muestra monto con distancia inválida', () => {
    expect(calcularPagoViaje(null, 700, 0)).toBeNull()
    expect(calcularPagoViaje(0, 700, 0)).toBeNull()
    expect(calcularPagoViaje(-1, 700, 0)).toBeNull()
    expect(calcularPagoViaje(Infinity, 700, 0)).toBeNull()
  })
})
