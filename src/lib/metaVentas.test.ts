import { describe, expect, it } from 'vitest'
import { calcularMetaVentas, diasOperacionMes } from './metaVentas'

describe('metas de ventas', () => {
  it('separa la meta base del ritmo necesario y acumula la holgura', () => {
    const r = calcularMetaVentas({
      ventas: 12_000_000,
      costoProductos: 4_000_000,
      gastosVariables: 1_000_000,
      costosFijosActuales: 5_000_000,
      costosFijosReferencia: 5_000_000,
      metaConfigurada: 20_000_000,
      costosFijosPresupuestados: null,
      diasOperacion: [1, 2, 3, 4, 5],
      periodo: '2026-10-01',
      hoy: '2026-10-15',
    })
    expect(r.metaMensual).toBe(20_000_000)
    expect(r.margenContribucionPct).toBeCloseTo(7 / 12)
    expect(r.puntoEquilibrio).toBeCloseTo(5_000_000 / (7 / 12))
    expect(r.diasRestantes).toBeGreaterThan(0)
    expect(r.metaNecesariaDiaria).toBeLessThan(1_000_000)
  })

  it('cuenta solo los días de operación elegidos', () => {
    const d = diasOperacionMes('2026-10-01', [1, 2, 3, 4, 5], '2026-10-01')
    expect(d.total).toBe(22)
    expect(d.transcurridos).toBe(1)
    expect(d.restantes).toBe(22)
  })
})
