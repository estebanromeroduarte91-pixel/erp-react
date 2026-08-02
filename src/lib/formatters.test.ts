import { describe, it, expect } from 'vitest'
import { capFirst, capWords } from './formatters'

describe('capFirst', () => {
  it('capitaliza solo la primera letra', () => {
    expect(capFirst('hola mundo')).toBe('Hola mundo')
  })

  it('devuelve string vacío para null/undefined/vacío', () => {
    expect(capFirst(null)).toBe('')
    expect(capFirst(undefined)).toBe('')
    expect(capFirst('')).toBe('')
  })
})

describe('capWords', () => {
  it('capitaliza la primera letra de cada palabra', () => {
    expect(capWords('cambio de pantalla')).toBe('Cambio De Pantalla')
  })

  // El bug real: \b\w no reconoce vocales acentuadas, así que "Baterías"
  // terminaba como "BateríAs" (la í no cortaba la palabra para \b, la
  // regex la trataba como si "as" fuera una palabra nueva).
  it('no rompe palabras con vocales acentuadas', () => {
    expect(capWords('baterías nuevas')).toBe('Baterías Nuevas')
    expect(capWords('reparación técnica')).toBe('Reparación Técnica')
  })

  it('devuelve string vacío para null/undefined/vacío', () => {
    expect(capWords(null)).toBe('')
    expect(capWords(undefined)).toBe('')
    expect(capWords('')).toBe('')
  })

  it('preserva espacios dobles (no colapsa palabras vacías)', () => {
    expect(capWords('hola  mundo')).toBe('Hola  Mundo')
  })
})
