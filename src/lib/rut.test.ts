import { describe, it, expect } from 'vitest'
import { formatRut, soloRutDigits, calcularDv, validarRut, rutParaSii } from './rut'

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

describe('calcularDv', () => {
  it('calcula el dígito verificador por módulo 11', () => {
    expect(calcularDv('19078135')).toBe('6')
    expect(calcularDv('12345678')).toBe('5')
  })

  // Los dos casos límite del módulo 11, que son justamente los que se
  // implementan mal: resto 11 es dígito 0 y resto 10 es la letra K.
  it('devuelve 0 cuando el resto da 11', () => {
    expect(calcularDv('76123456')).toBe('0')
  })

  it('devuelve K cuando el resto da 10', () => {
    expect(calcularDv('5126663')).toBe('3')
    expect(calcularDv('20347878')).toBe('K')
  })
})

describe('validarRut', () => {
  it('acepta RUT válidos, con o sin formato', () => {
    expect(validarRut('19.078.135-6')).toBe(true)
    expect(validarRut('190781356')).toBe(true)
    expect(validarRut('76.123.456-0')).toBe(true)
  })

  it('rechaza un dígito verificador equivocado', () => {
    // Este es el caso que importa: se ve perfectamente bien escrito y el
    // SII lo rechaza. El dígito real de este cuerpo es 6, no K.
    expect(validarRut('19.078.135-K')).toBe(false)
  })

  it('rechaza cadenas demasiado cortas o vacías', () => {
    expect(validarRut('')).toBe(false)
    expect(validarRut('1-1')).toBe(false)
  })

  it('rechaza una K en el cuerpo, no solo en el verificador', () => {
    expect(validarRut('1907813K6')).toBe(false)
  })
})

describe('rutParaSii', () => {
  it('entrega el formato sin puntos y con guión que espera el SII', () => {
    expect(rutParaSii('19.078.135-6')).toBe('19078135-6')
  })
})
