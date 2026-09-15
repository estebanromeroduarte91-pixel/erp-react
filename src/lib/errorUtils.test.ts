import { describe, expect, it } from 'vitest'
import { describirError } from './errorUtils'

describe('describirError', () => {
  it('conserva mensaje y stack de Error', () => {
    const error = new Error('falló el guardado')
    const resultado = describirError(error)
    expect(resultado.mensaje).toBe('falló el guardado')
    expect(resultado.stack).toContain('falló el guardado')
  })

  it('expone el detalle de errores PostgREST en vez de object Object', () => {
    expect(describirError({
      message: 'La fila no existe',
      details: 'No se encontró el gasto',
      hint: 'Actualiza la pantalla',
      code: 'PGRST116',
    }).mensaje).toBe('La fila no existe — No se encontró el gasto — Actualiza la pantalla (PGRST116)')
  })

  it('serializa objetos sin campos estándar', () => {
    expect(describirError({ motivo: 'rechazado' }).mensaje).toBe('{"motivo":"rechazado"}')
  })

  it('usa fallback para valores sin información', () => {
    expect(describirError(null, 'No se pudo guardar').mensaje).toBe('No se pudo guardar')
  })
})
