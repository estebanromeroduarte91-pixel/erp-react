import { describe, it, expect } from 'vitest'
import { rangoPeriodo, etiquetaMes, escalaGrafico, ymd } from './reportes'

describe('etiquetaMes', () => {
  it('no retrocede de mes al parsear (la trampa de UTC)', () => {
    // No usamos `new Date(iso).getMonth()` en esta prueba: su resultado cambia
    // según la zona horaria del runner y haría que CI en UTC fallara sin motivo.
    expect(etiquetaMes('2026-08-01')).toBe('Ago')
    expect(etiquetaMes('2026-01-01')).toBe('Ene')
    expect(etiquetaMes('2026-12-01')).toBe('Dic')
  })
})

describe('rangoPeriodo', () => {
  it('calcula el mes actual desde el día 1 hasta hoy', () => {
    expect(rangoPeriodo('mes', new Date(2026, 7, 25, 12))).toEqual({
      desde: '2026-08-01',
      hasta: '2026-08-25',
    })
  })

  it('inicia un rango personalizado con el mes actual', () => {
    expect(rangoPeriodo('rango', new Date(2026, 7, 25, 12))).toEqual({
      desde: '2026-08-01',
      hasta: '2026-08-25',
    })
  })

  const hoy = new Date(2026, 7, 25) // 25 de agosto de 2026, hora local

  it('12 meses incluye el mes actual y once hacia atrás', () => {
    expect(rangoPeriodo('12m', hoy)).toEqual({ desde: '2025-09-01', hasta: '2026-08-25' })
  })

  it('6 meses incluye el mes actual y cinco hacia atrás', () => {
    expect(rangoPeriodo('6m', hoy)).toEqual({ desde: '2026-03-01', hasta: '2026-08-25' })
  })

  it('este año parte el 1 de enero', () => {
    expect(rangoPeriodo('año', hoy)).toEqual({ desde: '2026-01-01', hasta: '2026-08-25' })
  })

  it('año anterior es el año completo, no doce meses hacia atrás', () => {
    expect(rangoPeriodo('anterior', hoy)).toEqual({ desde: '2025-01-01', hasta: '2025-12-31' })
  })

  it('24 meses retrocede dos años completos', () => {
    expect(rangoPeriodo('24m', hoy)).toEqual({ desde: '2024-09-01', hasta: '2026-08-25' })
  })

  it('todo el histórico delega el inicio al servidor', () => {
    // El cliente no sabe cuándo empezó el taller; manda una fecha antigua y el
    // servidor la acota a la primera venta real.
    expect(rangoPeriodo('todo', hoy)).toEqual({ desde: '1900-01-01', hasta: '2026-08-25' })
  })

  it('cruza el año hacia atrás sin romperse en enero', () => {
    expect(rangoPeriodo('12m', new Date(2026, 0, 15)).desde).toBe('2025-02-01')
    expect(rangoPeriodo('6m', new Date(2026, 0, 15)).desde).toBe('2025-08-01')
  })
})

describe('ymd', () => {
  it('rellena mes y día con cero', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('escalaGrafico', () => {
  it('incluye pérdidas y ganancias dentro del gráfico', () => {
    const escala = escalaGrafico([-150, -20, 80, 230])
    expect(escala.min).toBeLessThanOrEqual(-150)
    expect(escala.max).toBeGreaterThanOrEqual(230)
    expect(escala.min).toBeLessThan(0)
    expect(escala.max).toBeGreaterThan(0)
  })

  it('mantiene cero como base para métricas solamente positivas', () => {
    const escala = escalaGrafico([12, 30, 90])
    expect(escala.min).toBe(0)
    expect(escala.max).toBeGreaterThanOrEqual(90)
  })

  it('produce una escala útil sin datos', () => {
    expect(escalaGrafico([])).toEqual({ min: 0, max: 4, paso: 1 })
  })
})
