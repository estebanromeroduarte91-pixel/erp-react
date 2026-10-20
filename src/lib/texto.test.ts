import { describe, it, expect } from 'vitest'
import { buscarSimilar, esCasiIgual, normalizar, puntuarBusqueda } from './texto'

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

describe('puntuarBusqueda', () => {
  const puntuar = (consulta: string, principal: string, codigo = '', secundarios: string[] = []) =>
    puntuarBusqueda(consulta, { principal, codigo, secundarios })

  it('no confunde una generación numérica con un dígito dentro del modelo', () => {
    expect(puntuar('ipad air 5', 'iPad Air 5 A2488 Botón Bloqueo', '2312', ['iPad', 'iPad Air 5'])).not.toBeNull()
    expect(puntuar('ipad air 5', 'iPad Air 2 A1566 Batería', '2282', ['iPad', 'iPad Air 2'])).toBeNull()
    expect(puntuar('ipad air 5', 'iPad Air 3 A2152 Pantalla', '2294', ['iPad', 'iPad Air 3'])).toBeNull()
  })

  it('prioriza una frase en el nombre sobre palabras dispersas', () => {
    const exacta = puntuar('iphone 13 pro max', 'Mica iPhone 13 Pro Max', '2054')!
    const dispersa = puntuar('iphone 13 pro max', 'iPhone carcasa 13 protección Pro modelo Max', '9999')!
    expect(exacta).toBeGreaterThan(dispersa)
  })

  it('permite búsquedas parciales y sin tilde', () => {
    expect(puntuar('bater', 'Batería iPhone 13')).not.toBeNull()
    expect(puntuar('lamina', 'Lámina HD iPhone 14')).not.toBeNull()
  })

  it('pone un SKU exacto por encima de una coincidencia secundaria', () => {
    const skuExacto = puntuar('2054', 'Mica 3D iPhone 13 Pro Max', '2054')!
    const otro = puntuar('2054', 'Repuesto modelo 2054', '9999')!
    expect(skuExacto).toBeGreaterThan(otro)
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
