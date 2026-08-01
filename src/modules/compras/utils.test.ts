import { describe, it, expect } from 'vitest'
import { calcularEstadoOC } from './utils'
import type { OC, OCItem, OCRecepcion } from '@/types'

function item(overrides: Partial<OCItem> = {}): OCItem {
  return {
    id: 'item-1', producto_id: 'prod-1', producto_nombre: 'Producto',
    cantidad: 10, precio_neto: 1000, precio_iva: 1190, precio_unitario: 1000,
    subtotal: 10000, bodega_id: 'bod-1', bodega_nombre: 'Bodega',
    ...overrides,
  }
}

function oc(overrides: Partial<OC> = {}): OC {
  return {
    id: 'oc-1', numero: 'OC-00001', estado: 'borrador', proveedor_id: 'prov-1',
    proveedor_nombre: 'Proveedor', fecha: '2026-01-01', items: [item()],
    total: 10000, fecha_creacion: '2026-01-01', recepciones: [],
    ...overrides,
  }
}

function recepcion(prodItemId: string, cantidad: number): OCRecepcion {
  return {
    id: 'rec-' + Math.random(), fecha: '2026-01-01', bodega_id: 'bod-1', bodega_nombre: 'Bodega',
    items: [{ prod_item_id: prodItemId, producto_id: 'prod-1', producto_nombre: 'Producto', cantidad }],
  }
}

describe('calcularEstadoOC', () => {
  it('respeta estados finales (cancelada/confirmada) sin importar las recepciones', () => {
    expect(calcularEstadoOC(oc({ estado: 'cancelada', recepciones: [recepcion('item-1', 10)] }))).toBe('cancelada')
    expect(calcularEstadoOC(oc({ estado: 'confirmada' }))).toBe('confirmada')
  })

  it('es "borrador" sin items o sin recepciones', () => {
    expect(calcularEstadoOC(oc({ items: [] }))).toBe('borrador')
    expect(calcularEstadoOC(oc({ recepciones: [] }))).toBe('borrador')
  })

  it('es "parcial" cuando se recibió menos de lo pedido', () => {
    expect(calcularEstadoOC(oc({ recepciones: [recepcion('item-1', 4)] }))).toBe('parcial')
  })

  it('es "recibida" cuando la suma de recepciones cubre lo pedido', () => {
    expect(calcularEstadoOC(oc({ recepciones: [recepcion('item-1', 10)] }))).toBe('recibida')
  })

  // El caso que hace atómica a fn_recibir_oc: dos recepciones parciales que en
  // conjunto completan el total. La suma de ambas debe dar "recibida", igual
  // que hace la función SQL sobre el array ya fusionado.
  it('suma varias recepciones parciales de la misma OC', () => {
    const conDosRecepciones = oc({ recepciones: [recepcion('item-1', 4), recepcion('item-1', 6)] })
    expect(calcularEstadoOC(conDosRecepciones)).toBe('recibida')
  })

  it('no cuenta de más si una recepción excede lo pedido en un item', () => {
    // 15 recibidas de 10 pedidas — el excedente no debe hacer que otro item
    // parezca completo por error; el total recibido se capa a lo pedido.
    const dosItems = oc({
      items: [item({ id: 'a', cantidad: 10 }), item({ id: 'b', cantidad: 10 })],
      recepciones: [recepcion('a', 15)],
    })
    expect(calcularEstadoOC(dosItems)).toBe('parcial')
  })

  it('es "parcial" cuando un item de dos se recibió completo y el otro no', () => {
    const dosItems = oc({
      items: [item({ id: 'a', cantidad: 5 }), item({ id: 'b', cantidad: 5 })],
      recepciones: [recepcion('a', 5)],
    })
    expect(calcularEstadoOC(dosItems)).toBe('parcial')
  })
})
