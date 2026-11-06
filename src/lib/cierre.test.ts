import { describe, expect, it } from 'vitest'
import type { CajaSesion, Gasto, OC } from '@/types'
import {
  cajaDelMes, cambiosDesdeCierre, comprasDelMes, dteConProblema, flujoDeCaja, gastosPorNaturaleza, ivaDelMes,
  mesAnterior, ordenSinCobrar, rangoMes, revisionCierre, type VentaCierre,
} from './cierre'

const OCT = rangoMes('2026-10')

const oc = (p: Partial<OC>): OC => ({
  id: 'oc1', numero: 'OC-1', estado: 'recibida', proveedor_id: 'p', proveedor_nombre: 'Proveedor',
  fecha: '2026-09-20', items: [
    { id: 'l1', producto_id: 'x', producto_nombre: 'Pantalla', cantidad: 10, precio_neto: 10_000, precio_iva: 11_900, precio_unitario: 10_000, subtotal: 119_000, bodega_id: 'b', bodega_nombre: 'B' },
  ],
  total: 119_000, fecha_creacion: '2026-09-20', ...p,
})

const gasto = (p: Partial<Gasto>): Gasto => ({ id: 'g', fecha: '2026-10-05', descripcion: '', monto: 0, categoria: 'Arriendo', bodega_id: 'b1', ...p })

const venta = (p: Partial<VentaCierre>): VentaCierre => ({
  id: 'v', estado: 'pagada', tipo_doc: 'boleta', total: 100_000, total_iva: 119_000, metodo_pago: 'efectivo', ...p,
})

describe('rango de mes', () => {
  it('conoce el último día de cada mes y el mes anterior', () => {
    expect(rangoMes('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(OCT.hasta).toBe('2026-10-31')
    expect(mesAnterior('2026-01')).toBe('2025-12')
  })
})

describe('compras del mes', () => {
  it('cuenta cada recepción en el mes en que llegó', () => {
    const parcial = oc({
      estado: 'parcial',
      recepciones: [
        { id: 'r1', fecha: '2026-09-28', bodega_id: 'b', bodega_nombre: 'B', items: [{ prod_item_id: 'l1', producto_id: 'x', producto_nombre: 'Pantalla', cantidad: 4 }] },
        { id: 'r2', fecha: '2026-10-03', bodega_id: 'b', bodega_nombre: 'B', items: [{ prod_item_id: 'l1', producto_id: 'x', producto_nombre: 'Pantalla', cantidad: 6 }] },
      ],
      folio_factura: '5521',
    })
    const r = comprasDelMes([parcial], OCT.desde, OCT.hasta)
    expect(r.neto).toBe(60_000)
    expect(r.total).toBe(71_400)
    expect(r.ivaConFactura).toBe(11_400)
    expect(r.sinFactura).toEqual([])
  })

  it('una OC antigua sin recepciones cuenta entera en su fecha de recepción', () => {
    const r = comprasDelMes([oc({ fecha_recepcion: '2026-10-10' })], OCT.desde, OCT.hasta)
    expect(r.total).toBe(119_000)
    expect(r.sinFactura).toHaveLength(1)
  })

  it('detecta líneas recibidas a precio cero e ignora borradores y canceladas', () => {
    const sinCosto = oc({
      id: 'oc2', items: [{ id: 'l1', producto_id: 'x', producto_nombre: 'Kit', cantidad: 3, precio_neto: 0, precio_iva: 0, precio_unitario: 0, subtotal: 0, bodega_id: 'b', bodega_nombre: 'B' }],
      recepciones: [{ id: 'r', fecha: '2026-10-02', bodega_id: 'b', bodega_nombre: 'B', items: [{ prod_item_id: 'l1', producto_id: 'x', producto_nombre: 'Kit', cantidad: 3 }] }],
    })
    const r = comprasDelMes([sinCosto, oc({ id: 'b', estado: 'borrador', fecha_recepcion: '2026-10-10' })], OCT.desde, OCT.hasta)
    expect(r.sinCosto).toEqual([{ id: 'oc2', numero: 'OC-1', proveedor: 'Proveedor', lineas: 1 }])
    expect(r.ocs).toBe(1)
  })
})

describe('flujo de caja', () => {
  it('suma todo lo que salió: operación, compras, cuotas e inversiones', () => {
    const gastos = gastosPorNaturaleza([
      gasto({ monto: 2_500_000 }),
      gasto({ monto: 1_000_000, naturaleza: 'financiero' }),
      gasto({ monto: 2_000_000, naturaleza: 'inversion' }),
    ], undefined)
    const f = flujoDeCaja({
      ventas: [venta({ total_iva: 5_000_000 }), venta({ total_iva: 4_000_000, metodo_pago: 'mixto', pagos: [{ metodo_pago: 'efectivo', monto: 1_000_000 }, { metodo_pago: 'debito', monto: 3_000_000 }] }), venta({ estado: 'anulada', total_iva: 999 })],
      pedidosOnline: [{ total: 500_000, estado_gestion: 'entregado' }, { total: 1, estado_gestion: 'cancelado' }],
      gastos,
      compras: 3_000_000,
    })
    expect(f.salidas).toEqual({ operacion: 2_500_000, compras: 3_000_000, financiero: 1_000_000, inversion: 2_000_000, total: 8_500_000 })
    expect(f.entradas.porMetodo).toEqual([{ metodo: 'efectivo', monto: 6_000_000 }, { metodo: 'debito', monto: 3_000_000 }])
    expect(f.entradas.total).toBe(9_500_000)
    expect(f.saldo).toBe(1_000_000)
  })
})

describe('IVA del mes', () => {
  it('débito de ventas con documento, crédito de gastos con factura y compras', () => {
    const r = ivaDelMes({
      ventas: [venta({}), venta({ tipo_doc: 'ticket' }), venta({ estado: 'anulada' })],
      gastos: [gasto({ con_credito_fiscal: true, iva: 19_000 }), gasto({ con_credito_fiscal: false, iva: 5_000 })],
      ivaCompras: 11_400,
    })
    expect(r.debito).toBe(19_000)
    expect(r.ventasSinDocumento).toEqual({ cantidad: 1, total: 119_000 })
    expect(r.credito.total).toBe(30_400)
    expect(r.aPagar).toBe(-11_400)
  })
})

describe('caja y revisión', () => {
  const sesion = (p: Partial<CajaSesion>): CajaSesion => ({
    id: 's', branchId: 'b1', cajaId: 'c', fecha: '2026-10-10', estado: 'cerrada',
    apertura: { hora: '09:00', responsable: 'Ana', montoInicial: 0 },
    cierre: { hora: '19:00', conteoEfectivo: 0, diferencia: 0, observaciones: '', totalVentas: 0, conteo: 0 }, ...p,
  })

  it('separa faltantes, sobrantes y cajas abiertas del mes', () => {
    const c = cajaDelMes([
      sesion({ id: 'a', cierre: { hora: '', conteoEfectivo: 0, diferencia: -5_000, observaciones: '', totalVentas: 0, conteo: 0 } }),
      sesion({ id: 'b', cierre: { hora: '', conteoEfectivo: 0, diferencia: 2_000, observaciones: '', totalVentas: 0, conteo: 0 } }),
      sesion({ id: 'c', estado: 'abierta', cierre: null }),
      sesion({ id: 'd', fecha: '2026-09-30', estado: 'abierta', cierre: null }),
    ], [venta({ estado: 'anulada', total_iva: 10_000 })], OCT.desde, OCT.hasta)
    expect(c.faltantes).toEqual({ cantidad: 1, monto: 5_000 })
    expect(c.sobrantes).toEqual({ cantidad: 1, monto: 2_000 })
    expect(c.abiertas.map(a => a.id)).toEqual(['c'])
    expect(c.diferencias.map(d => d.id)).toEqual(['a', 'b'])
    expect(c.anuladas).toEqual({ cantidad: 1, monto: 10_000 })
  })

  it('marca DTE de producción sin aceptar y órdenes entregadas sin cobrar', () => {
    expect(dteConProblema({ estado: 'rechazado', ambiente: 'produccion', creado_en: '' })).toBe(true)
    expect(dteConProblema({ estado: 'generado', ambiente: 'certificacion', creado_en: '' })).toBe(false)
    expect(ordenSinCobrar({ id: 'o', num: 1, venta_id: null, presup: 45000 })).toBe(true)
    expect(ordenSinCobrar({ id: 'o', num: 1, venta_id: null, presup: 0 })).toBe(false)
    expect(ordenSinCobrar({ id: 'o', num: 1, venta_id: 'v1', presup: 45000 })).toBe(false)
  })

  it('la revisión queda en cero cuando el mes está limpio', () => {
    const puntos = revisionCierre({
      caja: cajaDelMes([], [], OCT.desde, OCT.hasta),
      dtes: [], compras: comprasDelMes([], OCT.desde, OCT.hasta), gastos: [gasto({})],
      stockNegativo: [], ordenesEntregadas: [], pedidosOnline: [],
    })
    expect(puntos.every(p => p.cantidad === 0)).toBe(true)
  })

  it('cada punto pendiente trae sus registros con el enlace que los abre', () => {
    const puntos = revisionCierre({
      caja: cajaDelMes([sesion({ id: 's1', cajaId: 'caja-ld', estado: 'abierta', cierre: null })], [], OCT.desde, OCT.hasta),
      dtes: [{ estado: 'rechazado', ambiente: 'produccion', creado_en: '', venta_id: 'v9', folio: 120, tipo_dte: 39, ultimo_error: 'RUT inválido' }],
      compras: comprasDelMes([], OCT.desde, OCT.hasta),
      gastos: [gasto({ id: 'g7', categoria: '', descripcion: 'Luz', monto: 30_000 })],
      stockNegativo: [{ producto_id: 'p1', nombre: 'Pantalla A12', bodega_id: 'b1', cantidad: -2 }],
      ordenesEntregadas: [{ id: 'o1', num: '0042', cliente: 'Ana', venta_id: null, presup: 45000 }],
      pedidosOnline: [{ id: 'pe1', numero: '1001', cliente_nombre: 'Luis', total: 59_500, estado_gestion: 'nuevo' }],
      nombreBodega: id => (id === 'b1' ? 'Los Dominicos' : id),
    })
    const enlaces = Object.fromEntries(puntos.map(p => [p.id, p.items.map(i => i.enlace)]))
    expect(enlaces.cajas).toEqual(['/ventas?tab=pos&caja=caja-ld'])
    expect(enlaces.dte).toEqual(['/ventas?abrir=v9'])
    expect(enlaces.gastos).toEqual(['/contabilidad?abrir=g7'])
    expect(enlaces.stock).toEqual(['/inventario?abrir=p1'])
    expect(enlaces.ordenes).toEqual(['/taller?abrir=0042'])
    expect(enlaces.online).toEqual(['/ecommerce?abrir=pe1'])
    expect(puntos.find(p => p.id === 'stock')!.items[0].detalle).toBe('Los Dominicos: -2 u.')
    expect(puntos.find(p => p.id === 'dte')!.items[0].titulo).toBe('Boleta N° 120 · rechazada por el SII')
  })

  it('el stock que no se pudo revisar queda como pendiente sin cantidad', () => {
    const puntos = revisionCierre({
      caja: cajaDelMes([], [], OCT.desde, OCT.hasta), dtes: [], compras: comprasDelMes([], OCT.desde, OCT.hasta),
      gastos: [], stockNegativo: null, ordenesEntregadas: [], pedidosOnline: [],
    })
    expect(puntos.find(p => p.id === 'stock')!.cantidad).toBeNull()
  })
})

describe('foto del cierre', () => {
  const foto = { ventasNetas: 9_520_795, resultado: 125_077, entro: 11_389_250, salio: 10_138_129, ivaAPagar: 1_319_344, pendientes: 5 }
  it('sin cambios no reporta nada', () => {
    expect(cambiosDesdeCierre(foto, { ...foto })).toEqual([])
  })
  it('reporta lo que cambió después de cerrar', () => {
    expect(cambiosDesdeCierre(foto, { ...foto, resultado: 100_000, pendientes: 2 }))
      .toEqual([{ etiqueta: 'Resultado de la operación', antes: 125_077, ahora: 100_000 }])
  })
})
