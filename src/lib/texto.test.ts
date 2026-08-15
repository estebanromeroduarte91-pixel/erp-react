import { describe, it, expect } from 'vitest'
import { buscarSimilar, esCasiIgual, normalizar } from './texto'

describe('normalizar', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    expect(normalizar('  Batería  Externa ')).toBe('bateria externa')
  })
})

describe('esCasiIgual', () => {
  // El caso que motivó esto: "cable" y "cables" son la misma categoría.
  it('trata singular y plural como lo mismo', () => {
    expect(esCasiIgual('Cable', 'Cables')).toBe(true)
    expect(esCasiIgual('Accesorio', 'Accesorios')).toBe(true)
    expect(esCasiIgual('Cargador', 'Cargadores')).toBe(true)
  })

  it('ignora tildes y mayúsculas', () => {
    expect(esCasiIgual('Baterias', 'Batería')).toBe(true)
  })

  it('funciona con nombres de varias palabras', () => {
    expect(esCasiIgual('Cable Lightning', 'Cables Lightning')).toBe(true)
  })

  // Falsos positivos: dos categorías legítimamente distintas no pueden
  // fundirse, porque eso obligaría a corregir a mano lo que el sistema unió.
  it('no confunde nombres distintos', () => {
    expect(esCasiIgual('Pantallas', 'Baterías')).toBe(false)
    expect(esCasiIgual('Cable', 'Cargador')).toBe(false)
  })

  it('no colapsa palabras cortas por su última letra', () => {
    expect(esCasiIgual('Mica', 'Micas')).toBe(true)
    expect(esCasiIgual('Gas', 'Ga')).toBe(false)
  })
})

describe('buscarSimilar', () => {
  const existentes = ['Accesorios', 'Baterías', 'Pantallas', 'Cables']

  it('encuentra la variante ya creada', () => {
    expect(buscarSimilar('cable', existentes)).toBe('Cables')
    expect(buscarSimilar('bateria', existentes)).toBe('Baterías')
  })

  // Si ya existe idéntica no hay nada que advertir: el flujo normal se encarga.
  it('no avisa cuando el nombre ya existe tal cual', () => {
    expect(buscarSimilar('Cables', existentes)).toBeUndefined()
    expect(buscarSimilar('  cables ', existentes)).toBeUndefined()
  })

  it('devuelve undefined cuando es realmente nueva', () => {
    expect(buscarSimilar('Herramientas', existentes)).toBeUndefined()
  })

  it('tolera texto vacío', () => {
    expect(buscarSimilar('   ', existentes)).toBeUndefined()
  })
})

// El bloqueo de clientes por RUT vive en ClientesTab.tsx (usa soloRutDigits
// directo, no buscarSimilar), pero el criterio que motiva el diseño se deja
// fijado acá: nombre parecido AVISA, RUT igual BLOQUEA. Son reglas distintas
// porque identifican cosas distintas — dos personas pueden llamarse igual sin
// ser la misma, dos RUT iguales sí son la misma persona o empresa.
describe('criterio nombre vs RUT (documentación de la regla)', () => {
  it('dos personas con el mismo nombre no son necesariamente la misma', () => {
    // buscarSimilar por nombre solo avisa — nunca debe usarse para bloquear
    // un alta de cliente, a diferencia de categorías/proveedores donde el
    // nombre SÍ identifica la entidad.
    expect(esCasiIgual('Juan Pérez', 'Juan Pérez')).toBe(true) // mismo string: coincide
    // pero eso no implica que sean la misma persona — la decisión de bloquear
    // se toma por RUT en la pantalla de clientes, no por esta función.
  })
})
