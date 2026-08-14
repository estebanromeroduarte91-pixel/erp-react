import { describe, expect, it } from 'vitest'
import type { Gasto, Venta, VentaItem } from '@/types'
import {
  calcularCostoVentas,
  calcularResumenOperacional,
  periodoAnteriorEquivalente,
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
