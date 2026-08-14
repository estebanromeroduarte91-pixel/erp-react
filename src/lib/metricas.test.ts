import { describe, expect, it } from 'vitest'
import type { Gasto, Venta, VentaItem } from '@/types'
import {
  calcularCostoVentas,
  calcularResumenOperacional,
  periodoAnteriorEquivalente,
  fechaEfectivaOC,
  gastoQueAfectaResultado,
  separarIva,
} from './metricas'

function venta(estado: Venta['estado'], total = 1000, totalIva = 1190, items: VentaItem[] = []): Venta {
  return { id: crypto.randomUUID(), estado, total, total_iva: totalIva, items } as Venta
}

describe('métricas operacionales', () => {
  it('sólo reconoce ventas pagadas', () => {
    const resumen = calcularResumenOperacional([
      venta('pagada'),
      venta('pendiente', 5000, 5950),
      venta('anulada', 7000, 8330),
    ], [])

    expect(resumen.ventasNetas).toBe(1000)
    expect(resumen.ventasBrutas).toBe(1190)
    expect(resumen.cantidadVentas).toBe(1)
    expect(resumen.ticketPromedio).toBe(1190)
  })

  it('calcula el resultado sobre venta neta, costo vendido y gastos', () => {
    const item = { cantidad: 2, producto_id: 'p1', costo_total: 300 } as VentaItem
    const gasto = { monto: 200 } as Gasto
    const resumen = calcularResumenOperacional([venta('pagada', 1000, 1190, [item])], [gasto])

    expect(resumen.costoVentas).toBe(300)
    expect(resumen.resultadoOperacional).toBe(500)
    expect(resumen.margen).toBe(50)
  })

  it('prioriza el costo FIFO congelado aunque el costo actual sea distinto', () => {
    const item = { cantidad: 2, producto_id: 'p1', costo_total: 300 } as VentaItem
    expect(calcularCostoVentas([venta('pagada', 0, 0, [item])], new Map([['p1', 999]]))).toBe(300)
  })

  it('usa el costo actual sólo como compatibilidad para ventas antiguas', () => {
    const item = { cantidad: 2, producto_id: 'p1' } as VentaItem
    expect(calcularCostoVentas([venta('pagada', 0, 0, [item])], new Map([['p1', 125]]))).toBe(250)
  })
})

describe('períodos comparables', () => {
  it('compara mes a la fecha con los mismos días del mes anterior', () => {
    expect(periodoAnteriorEquivalente('mes', '2026-08-01', '2026-08-14')).toEqual({
      desde: '2026-07-01',
      hasta: '2026-07-14',
    })
  })

  it('ajusta el día cuando el mes anterior es más corto', () => {
    expect(periodoAnteriorEquivalente('mes', '2026-03-01', '2026-03-31')).toEqual({
      desde: '2026-02-01',
      hasta: '2026-02-28',
    })
  })

  it('compara año a la fecha contra la misma fecha del año anterior', () => {
    expect(periodoAnteriorEquivalente('año', '2026-01-01', '2026-08-14')).toEqual({
      desde: '2025-01-01',
      hasta: '2025-08-14',
    })
  })

  it('compara rangos personalizados con uno anterior de igual duración', () => {
    expect(periodoAnteriorEquivalente('rango', '2026-08-10', '2026-08-14')).toEqual({
      desde: '2026-08-05',
      hasta: '2026-08-09',
    })
  })
})

describe('fechaEfectivaOC', () => {
  it('prefiere la primera recepción sobre todo lo demás', () => {
    expect(fechaEfectivaOC({
      fecha: '2026-07-01',
      fecha_confirmacion: '2026-07-15',
      fecha_primera_recepcion: '2026-08-03',
      fecha_recepcion: '2026-08-20',
    })).toBe('2026-08-03')
  })

  it('usa la confirmación cuando todavía no hay recepción', () => {
    expect(fechaEfectivaOC({ fecha: '2026-07-01', fecha_confirmacion: '2026-07-15' })).toBe('2026-07-15')
  })

  // Las OC antiguas solo tienen fecha de creación: no deben quedar fuera de
  // los reportes por falta de datos.
  it('cae a la fecha de creación si no hay nada más', () => {
    expect(fechaEfectivaOC({ fecha: '2026-07-01' })).toBe('2026-07-01')
  })

  it('recorta marcas de tiempo a solo la fecha', () => {
    expect(fechaEfectivaOC({ fecha: '2026-07-01', fecha_recepcion: '2026-08-03T14:22:00Z' })).toBe('2026-08-03')
  })
})

describe('gastoQueAfectaResultado', () => {
  const base = { id: '1', fecha: '2026-08-01', descripcion: 'x', categoria: 'Otros' }

  // Ningún gasto anterior a este cambio debe moverse: sin clasificar se
  // descuenta completo, igual que siempre.
  it('descuenta el total cuando no está clasificado', () => {
    expect(gastoQueAfectaResultado({ ...base, monto: 119000 })).toBe(119000)
  })

  it('descuenta solo el neto cuando hay factura', () => {
    expect(gastoQueAfectaResultado({
      ...base, monto: 119000, con_credito_fiscal: true, monto_neto: 100000, iva: 19000,
    })).toBe(100000)
  })

  it('descuenta el total si dice tener factura pero no trae el neto', () => {
    expect(gastoQueAfectaResultado({ ...base, monto: 119000, con_credito_fiscal: true })).toBe(119000)
  })
})

describe('separarIva', () => {
  it('reparte de modo que neto + iva siempre da el total', () => {
    for (const total of [9990, 119000, 1, 33333, 89990]) {
      const { neto, iva } = separarIva(total)
      expect(neto + iva).toBe(Math.round(total))
    }
  })
})
