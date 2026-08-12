import { describe, expect, it } from 'vitest'
import { errorEnResultadosDte } from './dteProceso'

describe('errorEnResultadosDte', () => {
  it('acepta una tanda enviada correctamente', () => {
    expect(errorEnResultadosDte({ resultados: [{ enviados: 1, track_id: '123456789012345' }] })).toBeNull()
  })

  it('expone el error interno aunque la función haya respondido HTTP 200', () => {
    expect(errorEnResultadosDte({
      ok: true,
      resultados: [{ ok: false, error: 'El SII rechazó el sobre' }],
    })).toBe('El SII rechazó el sobre')
  })

  it('no oculta un fallo sin mensaje', () => {
    expect(errorEnResultadosDte({ resultados: [{ ok: false }] })).toBe('El SII rechazó el proceso')
  })

  it('combina los errores de una tanda', () => {
    expect(errorEnResultadosDte({ resultados: [
      { ok: false, error: 'Error A' },
      { ok: false, error: 'Error B' },
    ] })).toBe('Error A · Error B')
  })
})
