import { describe, it, expect } from 'vitest'
import { lineaParaDte, TIPO_DTE } from './dte'

describe('lineaParaDte', () => {
  it('sin descuento deja el precio tal cual', () => {
    expect(lineaParaDte(9990, 1, 9990)).toEqual({ precio: 9990, cantidad: 1, descuento: 0 })
  })

  it('convierte el descuento a monto usando el total real de la línea', () => {
    // 2 × 10.000 con 10% aplicado = 18.000 → el descuento son 2.000 pesos.
    expect(lineaParaDte(10000, 2, 18000)).toEqual({ precio: 10000, cantidad: 2, descuento: 2000 })
  })

  // El bug que motivó estos tests: el POS guarda el precio YA descontado y
  // además el porcentaje. Recalcular el porcentaje sobre ese precio lo aplicaba
  // dos veces y la boleta salía por menos de lo que el cliente pagó.
  it('el total de la línea siempre coincide con lo cobrado', () => {
    const casos: [number, number, number][] = [
      [9990, 1, 9990],
      [10000, 2, 18000],
      [3333, 3, 8999],
      [89990, 1, 76492],
    ]
    for (const [precio, cantidad, total] of casos) {
      const l = lineaParaDte(precio, cantidad, total)
      expect(l.precio * l.cantidad - l.descuento).toBe(total)
    }
  })

  it('nunca devuelve un descuento negativo', () => {
    // Un recargo no se expresa como descuento: mejor 0 que un monto inválido.
    expect(lineaParaDte(1000, 1, 1200).descuento).toBe(0)
  })
})

describe('TIPO_DTE', () => {
  it('usa los códigos del SII', () => {
    expect(TIPO_DTE.boleta).toBe(39)
    expect(TIPO_DTE.factura).toBe(33)
    expect(TIPO_DTE.nota_credito).toBe(61)
  })
})
