import { describe, expect, it } from 'vitest'
import type { OC } from '@/types'
import { folioConFactura, grupoFactura, resumenFactura } from './facturaOC'

const oc = (folio: string | undefined, neto: number, estado: OC['estado'] = 'confirmada') => ({
  folio_factura: folio, estado, total: Math.round(neto * 1.19),
  items: [{ id: 'l', producto_id: 'p', producto_nombre: 'x', cantidad: 1, precio_neto: neto, precio_iva: Math.round(neto * 1.19), precio_unitario: neto, subtotal: 0, bodega_id: 'b', bodega_nombre: 'B' }],
})

describe('factura de la OC', () => {
  it('solo un folio con números es factura', () => {
    expect(folioConFactura('5521')).toBe(true)
    expect(folioConFactura('F-5521')).toBe(true)
    expect(folioConFactura('SIN FACTURA')).toBe(false)
    expect(folioConFactura('sin factura 2')).toBe(false)
    expect(folioConFactura(null)).toBe(false)
  })

  it('separa con factura, sin factura y folio vacío', () => {
    expect(grupoFactura({ folio_factura: '88301' })).toBe('con')
    expect(grupoFactura({ folio_factura: 'SIN FACTURA' })).toBe('sin')
    expect(grupoFactura({ folio_factura: '  ' })).toBe('vacio')
    expect(grupoFactura({ folio_factura: undefined })).toBe('vacio')
  })

  it('suma totales por grupo, con IVA solo en las con factura, sin las canceladas', () => {
    const r = resumenFactura([oc('5521', 100_000), oc('SIN FACTURA', 50_000), oc('', 10_000), oc('777', 999_999, 'cancelada')])
    expect(r.con).toEqual({ cantidad: 1, neto: 100_000, iva: 19_000, total: 119_000 })
    expect(r.sin).toEqual({ cantidad: 1, neto: 50_000, iva: 0, total: 59_500 })
    expect(r.vacio.cantidad).toBe(1)
    expect(r.todas.cantidad).toBe(3)
    expect(r.todas.total).toBe(119_000 + 59_500 + 11_900)
  })
})
