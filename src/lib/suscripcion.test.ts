import { describe, expect, it } from 'vitest'
import { suscripcionExpirada } from './suscripcion'

describe('suscripcionExpirada', () => {
  const ahora = new Date('2026-09-25T15:00:00.000Z')

  it('bloquea un plan activo cuya fecha ya pasó', () => {
    expect(suscripcionExpirada('activo', '2026-09-25T14:59:59.000Z', ahora)).toBe(true)
  })

  it('mantiene activo un plan que todavía no vence', () => {
    expect(suscripcionExpirada('activo', '2026-09-25T15:00:01.000Z', ahora)).toBe(false)
  })

  it('no bloquea registros históricos sin fecha ni otros estados', () => {
    expect(suscripcionExpirada('activo', null, ahora)).toBe(false)
    expect(suscripcionExpirada('trial', '2026-09-01T00:00:00.000Z', ahora)).toBe(false)
  })

  it('no bloquea por una fecha inválida', () => {
    expect(suscripcionExpirada('activo', 'fecha-invalida', ahora)).toBe(false)
  })
})
