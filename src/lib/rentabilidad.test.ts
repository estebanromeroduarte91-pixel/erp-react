import { describe, expect, it } from 'vitest'
import { cascada, resultadoPorSucursal, type RentabilidadSucursales } from './rentabilidad'

// Cifras reales de septiembre 2026 (Steve Docs), verificadas contra la función SQL.
const septiembre: RentabilidadSucursales = {
  periodo: { desde: '2026-09-01', hasta: '2026-09-30' },
  restringido: false,
  sucursales: [
    { branch_id: 'ld', nombre: 'Los Dominicos', ventas_netas: 5553071, transacciones: 72, costo: 2042031,
      costo_estimado: 0, lineas_costo_estimado: 0, margen_bruto: 3511040, gastos_tienda: 1669381,
      resultado_cuatro_paredes: 1841659, participacion_ventas: 67.5, corporativo_asignado: 1744036, resultado_completo: 97623 },
    { branch_id: 'dh', nombre: 'La Dehesa', ventas_netas: 2670060, transacciones: 40, costo: 1046576,
      costo_estimado: 0, lineas_costo_estimado: 0, margen_bruto: 1623484, gastos_tienda: 1490642,
      resultado_cuatro_paredes: 132842, participacion_ventas: 32.5, corporativo_asignado: 838577, resultado_completo: -705735 },
  ],
  no_asignado: { ventas_netas: 0, costo: 0, margen_bruto: 0, gastos_tienda: 130607, corporativo: 0, resultado: -130607 },
  corporativo_total: 2582613,
  fuera_de_operacion: { financiero: 271605, inversion: 460000 },
  consolidado: { ventas_netas: 8223131, costo: 3088607, margen_bruto: 5134524, gastos_tienda: 3290630,
    corporativo: 2582613, resultado_operacional: -738719 },
  cuadratura: { consolidado: -738719, sucursales_mas_no_asignado: -738719, diferencia_redondeo: 0 },
  calidad: { lineas_costo_estimado: 24, monto_costo_estimado: 853736, sin_comision_medios_pago: true },
}

describe('cascada', () => {
  it('el total de la empresa usa el consolidado y separa lo que no es operación', () => {
    const c = cascada(septiembre, null)
    expect(c.resultado).toBe(-738719)
    expect(c.cuatroParedes).toBe(5134524 - 3290630)
    expect(c.fueraDeOperacion).toBe(731605)
    expect(c.margenBruto - c.gastosTienda - c.corporativo).toBe(c.resultado)
  })

  it('una sucursal descuenta su parte del corporativo', () => {
    const c = cascada(septiembre, 'dh')
    expect(c.cuatroParedes).toBe(132842)
    expect(c.resultado).toBe(-705735)
    expect(c.fueraDeOperacion).toBeNull()
  })

  it('una sucursal sin datos en el periodo da cero, no undefined', () => {
    expect(cascada(septiembre, 'nueva').resultado).toBe(0)
  })

  it('un encargado (sin consolidado) ve su sucursal como total', () => {
    const encargado: RentabilidadSucursales = {
      ...septiembre, restringido: true, sucursales: [septiembre.sucursales[1]],
      consolidado: null, no_asignado: null, fuera_de_operacion: null, corporativo_total: null, cuadratura: null,
    }
    expect(cascada(encargado, null).resultado).toBe(-705735)
  })

  it('sin respuesta todavía, todo en cero', () => {
    expect(cascada(undefined, null).resultado).toBe(0)
  })
})

describe('resultadoPorSucursal', () => {
  it('las sucursales más lo no asignado cuadran con el total', () => {
    const porSuc = resultadoPorSucursal(septiembre)
    const suma = [...porSuc.values()].reduce((a, b) => a + b, 0) + septiembre.no_asignado!.resultado
    expect(suma).toBe(septiembre.consolidado!.resultado_operacional)
  })
})
