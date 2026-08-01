import { describe, it, expect } from 'vitest'
import { formatRut, soloRutDigits } from './rut'

describe('soloRutDigits', () => {
  it('deja solo dígitos y K, sin puntos ni guión', () => {
    expect(soloRutDigits('19.078.135-K')).toBe('19078135K')
  })

  it('normaliza k minúscula a mayúscula', () => {
    expect(soloRutDigits('19.078.135-k')).toBe('19078135K')
  })

  it('deja igual un RUT ya sin formato', () => {
    expect(soloRutDigits('19078135K')).toBe('19078135K')
  })

  // El bug real que arregló esto: buscar sin puntos no encontraba nada
  // porque un RUT guardado SÍ los tiene — hay que normalizar ambos lados
  // de la comparación antes de compararlos.
  it('hace que un RUT con formato y uno sin formato calcen tras normalizar', () => {
    expect(soloRutDigits('19.078.135-K')).toBe(soloRutDigits('19078135K'))
  })
})

describe('formatRut', () => {
  it('agrega puntos de miles y guión antes del dígito verificador', () => {
    expect(formatRut('19078135K')).toBe('19.078.135-K')
  })

  it('funciona con RUT de un solo dígito de cuerpo', () => {
    expect(formatRut('11')).toBe('1-1')
  })

  it('descarta caracteres que no son dígitos ni K', () => {
    expect(formatRut('19.078.135-K extra!!')).toBe('19.078.135-K')
  })
})
