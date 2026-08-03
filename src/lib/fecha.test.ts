import { describe, it, expect } from 'vitest'
import { fechaLocal } from './fecha'

describe('fechaLocal', () => {
  it('usa las partes locales de la fecha, no UTC', () => {
    // 2 de agosto de 2026, 21:30 hora local. En cualquier zona al oeste de
    // Greenwich (Chile incluida) el UTC de ese instante ya es el día 3 — el
    // bug que esto previene: el filtro "Hoy" pedía las ventas de mañana.
    const d = new Date(2026, 7, 2, 21, 30, 0)
    expect(fechaLocal(d)).toBe('2026-08-02')
  })

  it('rellena mes y día con cero a la izquierda', () => {
    expect(fechaLocal(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('en el último día del mes no salta al mes siguiente', () => {
    // El caso que dejaba Estadísticas en $0 toda la última noche del mes.
    const d = new Date(2026, 7, 31, 23, 59, 0)
    expect(fechaLocal(d)).toBe('2026-08-31')
    expect(fechaLocal(d).slice(0, 7)).toBe('2026-08')
  })

  it('sin argumento devuelve el día de hoy en hora local', () => {
    const ahora = new Date()
    const esperado = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
    expect(fechaLocal()).toBe(esperado)
  })
})
