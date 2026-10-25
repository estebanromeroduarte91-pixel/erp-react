import { describe, expect, it } from 'vitest'
import { comprasPorProveedor, secciones, trasladosPorRuta, type FilaReposicion } from './reposicion'

// Casos reales de la prueba del 2026-10-25 (Steve Docs).
const LD = { id: 'ld', nombre: 'Los Dominicos' }
function fila(p: Partial<FilaReposicion>): FilaReposicion {
  return {
    bodega_id: 'dh', bodega_nombre: 'La Dehesa', producto_id: 'p', nombre: 'Producto',
    sku: null, categoria: null, estado: 'agotado', stock: 0, ya_viene: 0, ocs_pendientes: null,
    vendidas_periodo: 0, ventas_distintas: 0, venta_diaria: 0, cobertura_dias: null,
    punto_reorden: 0, objetivo: 0, stock_min_manual: 0, sugerido: 0, costo_unitario: 0,
    costo_registrado: true, motivo_bajo_pedido: null, trasladar: 0, trasladar_desde: null,
    comprar: 0, costo_compra_estimado: 0, proveedor: null, ...p,
  }
}

const cable = fila({ producto_id: 'cable', nombre: 'Cable Hoco X37', sugerido: 4, trasladar: 4, trasladar_desde: LD,
  costo_unitario: 790, proveedor: { id: 'cdc', nombre: 'CDC Tecno ' } })
const bateria11 = fila({ producto_id: 'b11', nombre: 'iPhone 11 Batería', sugerido: 2, trasladar: 1, trasladar_desde: LD,
  comprar: 1, costo_unitario: 13445, proveedor: { id: 'pm', nombre: 'ProMobile SpA' } })
const bateria13 = fila({ producto_id: 'b13', nombre: 'iPhone 13 Batería', sugerido: 2, comprar: 2,
  costo_unitario: 15126, proveedor: { id: 'pm', nombre: 'ProMobile SpA' } })
const lamina = fila({ bodega_id: 'ld', bodega_nombre: 'Los Dominicos', producto_id: 'lam', nombre: 'Lámina Hidrogel',
  estado: 'stock_negativo', stock: -7, sugerido: 7, comprar: 7, costo_unitario: 924 })
const pantalla = fila({ producto_id: 'pant', nombre: 'iPhone 15 Pro Pantalla', estado: 'bajo_pedido',
  motivo_bajo_pedido: 'caro', costo_unitario: 184874 })
const vidrio = fila({ bodega_id: 'ld', bodega_nombre: 'Los Dominicos', producto_id: 'vid', nombre: 'Vidrio Cámara',
  sugerido: 2, comprar: 2, costo_unitario: 1681 })

describe('secciones', () => {
  const todas = [cable, bateria11, bateria13, lamina, pantalla]

  it('el stock negativo va a corregir, nunca a la lista de compra', () => {
    const s = secciones(todas, null)
    expect(s.corregir.map(f => f.producto_id)).toEqual(['lam'])
    expect(s.pedir.map(f => f.producto_id)).not.toContain('lam')
  })

  it('lo bajo pedido no pide acción', () => {
    const s = secciones(todas, null)
    expect(s.bajoPedido.map(f => f.producto_id)).toEqual(['pant'])
    expect(s.pedir.map(f => f.producto_id)).toEqual(['cable', 'b11', 'b13'])
  })

  it('filtra por sucursal', () => {
    expect(secciones(todas, 'ld').pedir).toHaveLength(0)
    expect(secciones(todas, 'ld').corregir).toHaveLength(1)
  })
})

describe('comprasPorProveedor', () => {
  it('agrupa por proveedor y deja fuera lo que solo se traslada', () => {
    const compras = comprasPorProveedor([cable, bateria11, bateria13])
    expect(compras).toHaveLength(1)
    expect(compras[0].proveedor_nombre).toBe('ProMobile SpA')
    expect(compras[0].unidades).toBe(3)
    expect(compras[0].total_neto).toBe(13445 + 2 * 15126)
  })

  it('lo que no tiene proveedor va en su propia OC, al final', () => {
    const compras = comprasPorProveedor([vidrio, bateria13])
    expect(compras.map(c => c.proveedor_id)).toEqual(['pm', ''])
    expect(compras[1].lineas[0].bodega_id).toBe('ld')
  })

  it('limpia espacios del nombre del proveedor', () => {
    const conEspacio = fila({ comprar: 1, proveedor: { id: 'cc', nombre: 'Clinic Cel ' } })
    expect(comprasPorProveedor([conEspacio])[0].proveedor_nombre).toBe('Clinic Cel')
  })
})

describe('trasladosPorRuta', () => {
  it('junta en un solo traslado todo lo que va por la misma ruta', () => {
    const t = trasladosPorRuta([cable, bateria11, bateria13])
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ origen_id: 'ld', destino_id: 'dh', unidades: 5 })
    expect(t[0].lineas.map(l => l.cantidad)).toEqual([4, 1])
  })
})
