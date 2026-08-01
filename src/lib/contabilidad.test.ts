import { describe, it, expect } from 'vitest'
import { cuentaHaberDeMetodo } from './contabilidad'

describe('cuentaHaberDeMetodo', () => {
  it('efectivo sale de Caja', () => {
    expect(cuentaHaberDeMetodo('Efectivo')).toBe('pc-110')
  })

  it('crédito se reconoce como Cuentas por Pagar (pasivo), no como pago', () => {
    expect(cuentaHaberDeMetodo('Crédito')).toBe('pc-210')
  })

  it('transferencia, tarjeta y cheque salen de Banco', () => {
    expect(cuentaHaberDeMetodo('Transferencia')).toBe('pc-120')
    expect(cuentaHaberDeMetodo('Tarjeta')).toBe('pc-120')
    expect(cuentaHaberDeMetodo('Cheque')).toBe('pc-120')
  })

  it('un método desconocido o vacío cae a Banco por defecto', () => {
    expect(cuentaHaberDeMetodo(undefined)).toBe('pc-120')
    expect(cuentaHaberDeMetodo('otro-metodo-raro')).toBe('pc-120')
  })
})
