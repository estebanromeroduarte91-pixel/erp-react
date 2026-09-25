import { describe, expect, it } from 'vitest'
import { deltasDeStock, stockPorBodega } from './stock'

describe('deltasDeStock', () => {
  it('no toca las bodegas que el usuario no editó', () => {
    // La clave del arreglo: guardar un producto sin tocar el stock no genera
    // ningún ajuste, aunque la pantalla tenga un valor viejo en memoria.
    expect(deltasDeStock('p1', {}, { centro: 5, norte: 2 })).toEqual([])
  })

  it('devuelve solo la diferencia, no el valor absoluto', () => {
    expect(deltasDeStock('p1', { centro: 7 }, { centro: 5 }))
      .toEqual([{ producto_id: 'p1', bodega_id: 'centro', delta: 2 }])
    expect(deltasDeStock('p1', { centro: 3 }, { centro: 5 }))
      .toEqual([{ producto_id: 'p1', bodega_id: 'centro', delta: -2 }])
  })

  it('omite las bodegas donde el valor no cambió', () => {
    expect(deltasDeStock('p1', { centro: 5, norte: 9 }, { centro: 5, norte: 2 }))
      .toEqual([{ producto_id: 'p1', bodega_id: 'norte', delta: 7 }])
  })

  it('una bodega sin fila previa parte de cero', () => {
    expect(deltasDeStock('p1', { norte: 4 }, {}))
      .toEqual([{ producto_id: 'p1', bodega_id: 'norte', delta: 4 }])
  })

  it('redondea y tolera basura', () => {
    expect(deltasDeStock('p1', { centro: 2.6 }, { centro: NaN }))
      .toEqual([{ producto_id: 'p1', bodega_id: 'centro', delta: 3 }])
  })

  it('respeta el stock negativo que dejó una venta sin stock', () => {
    // Si la base quedó en -2 y se cuentan 3, hay que sumar 5, no 3.
    expect(deltasDeStock('p1', { centro: 3 }, { centro: -2 }))
      .toEqual([{ producto_id: 'p1', bodega_id: 'centro', delta: 5 }])
  })
})

describe('stockPorBodega', () => {
  it('arma el mapa desde las filas de la base', () => {
    expect(stockPorBodega([{ bodega_id: 'centro', cantidad: 4 }])).toEqual({ centro: 4 })
  })

  it('sin filas devuelve un mapa vacío, no null', () => {
    expect(stockPorBodega(null)).toEqual({})
  })
})
