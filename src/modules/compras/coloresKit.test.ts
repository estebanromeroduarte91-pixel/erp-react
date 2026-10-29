import { describe, expect, it } from 'vitest'
import type { Producto } from '@/types'
import { analizarGrupo, canonColor, colorMatches, extractColor, normalizarEnlace, productosParaColor } from './coloresKit'

const producto = (id: string, nombre: string): Producto => ({ id, nombre, enlace: 'iPhone 17 Pro Max' })

describe('colores automáticos de kits', () => {
  it.each([
    ['iPhone 17 Pro Max blanco chasis', 'Blanco'],
    ['iPhone 17 Pro Max chasis blanco', 'Blanco'],
    ['iPhone 17 Pro Max Azul Oscuro Chasis', 'Azul Oscuro'],
    ['iPhone 17 Pro Max Chasis Azul Oscuro', 'Azul Oscuro'],
    ['iPhone 17 Pro Max Naranjo Tapa Trasera', 'Naranjo'],
    ['iPhone 17 Pro Max Tapa Trasera Naranjo', 'Naranjo'],
    ['IPHONE 17 PRO MAX BLÁNCO CHÁSIS', 'Blanco'],
    ['iPhone 17 Pro Max CHÁSSIS AZÚL OSCÚRO', 'Azul Oscuro'],
    ['iPhone 17 Pro Max TAPÁS   TRASÉRAS Blanco', 'Blanco'],
    ['iPhone 17 Pro Max Azul Oscuro TAPA-TRASERA', 'Azul Oscuro'],
    ['iPhone 17 Pro Max tapatrasera Naranjo', 'Naranjo'],
    ['iPhone 17 Pro Max Naranjo Tapa Tracera', 'Naranjo'],
  ])('identifica pieza y color en ambas posiciones: %s', (nombre, esperado) => {
    expect(extractColor(nombre)).toBe(esperado)
  })

  it('muestra los tres colores de la captura y filtra chasis y tapas en cualquier orden', () => {
    const productos = [
      producto('chasis-azul', 'iPhone 17 Pro Chasis Azul Oscuro'),
      producto('chasis-naranjo', 'iPhone 17 Pro Chasis Naranjo'),
      producto('chasis-blanco', 'iPhone 17 Pro Chasis Blanco'),
      producto('tapa-azul', 'iPhone 17 Pro Azul Oscuro Tapa Trasera'),
      producto('tapa-blanco', 'iPhone 17 Pro Blanco Tapa Trasera'),
      producto('bateria', 'iPhone 17 Pro Batería'),
    ]
    expect(analizarGrupo(productos).colores).toEqual(['Azul Oscuro', 'Blanco', 'Naranjo'])
    expect(productosParaColor(productos, 'Blanco').map(p => p.id)).toEqual(['chasis-blanco', 'tapa-blanco', 'bateria'])
    expect(productosParaColor(productos, 'Azul Oscuro').map(p => p.id)).toEqual(['chasis-azul', 'tapa-azul', 'bateria'])
  })

  it('no confunde especificaciones del chasis o la tapa con un color', () => {
    expect(extractColor('iPhone 17 Pro Max Chasis Completo')).toBe('')
    expect(extractColor('iPhone 17 Pro Max Tapa Trasera Original')).toBe('')
    expect(extractColor('iPhone 17 Pro Max Chasis Sin Botones')).toBe('')
  })

  it('reconoce el nombre real de un producto nuevo sin configurar el modelo', () => {
    expect(extractColor('iPhone 17 Pro Max Chasis Naranjo')).toBe('Naranjo')
    expect(extractColor('Modelo nuevo Chasis Naranjo')).toBe('Naranjo')
  })

  it('ofrece el selector aunque solo haya una pieza de ese color', () => {
    const generico = producto('bateria', 'iPhone 17 Pro Max Batería')
    const grupo = analizarGrupo([generico, producto('chasis', 'iPhone 17 Pro Max Chasis Naranjo')])
    expect(grupo.colores).toEqual(['Naranjo'])
    expect(grupo.genericos).toEqual([generico])
  })

  it('incluye los genéricos y solo el color elegido, sin repetir componentes', () => {
    const productos = [
      producto('bateria', 'iPhone 17 Pro Max Batería'),
      producto('naranjo', 'iPhone 17 Pro Max Chasis Naranjo'),
      producto('azul', 'iPhone 17 Pro Max Tapa Trasera Azul Profundo'),
      producto('plata', 'iPhone 17 Pro Max Chasis Plata'),
    ]
    expect(productosParaColor(productos, 'Naranjo').map(p => p.id)).toEqual(['bateria', 'naranjo'])
    expect(productosParaColor(productos, 'Azul Profundo').map(p => p.id)).toEqual(['bateria', 'azul'])
  })

  it('unifica naranjo, naranja y orange en una sola opción', () => {
    const productos = ['Naranjo', 'Naranja', 'Orange'].map((color, i) => producto(String(i), `Modelo Pieza ${color}`))
    expect(analizarGrupo(productos).colores).toEqual(['Naranjo'])
    expect(productosParaColor(productos, 'Naranjo')).toHaveLength(3)
  })

  it('reconoce colores compuestos completos antes que su última palabra', () => {
    expect(extractColor('iPhone 17 Pro Chasis Naranja Cósmico')).toBe('Naranjo Cósmico')
    expect(extractColor('iPhone 16 Pro Max Chasis Titanio Natural')).toBe('Titanio Natural')
    expect(extractColor('iPhone 13 Pro Chasis Azul Sierra')).toBe('Azul Sierra')
    expect(extractColor('Modelo Chasis Space Black')).toBe('Space Black')
    expect(extractColor('Modelo Chasis Rose Gold')).toBe('Rose Gold')
  })

  it('tolera espacios repetidos, mayúsculas y diferencias de acentuación', () => {
    expect(extractColor('  Modelo Chasis   NARANJO   ')).toBe('Naranjo')
    expect(extractColor('Modelo Chasis Naranja Cosmico')).toBe('Naranjo Cósmico')
    expect(canonColor('  TITANIO   BLANCA ')).toBe('Titanio Blanco')
  })

  it('conserva el filtrado de colores de generaciones anteriores', () => {
    const productos = [
      producto('bateria', 'iPhone 16 Pro Max Batería'),
      producto('negro', 'iPhone 16 Pro Max Chasis Titanio Negro'),
      producto('tapa', 'iPhone 16 Pro Max Tapa Negra'),
      producto('blanco', 'iPhone 16 Pro Max Chasis Titanio Blanco'),
    ]
    expect(analizarGrupo(productos).colores).toEqual(['Titanio Blanco', 'Titanio Negro'])
    expect(productosParaColor(productos, 'Titanio Negro').map(p => p.id)).toEqual(['bateria', 'negro', 'tapa'])
  })

  it('una pieza de color no es genérica solo porque su familia tenga una variante', () => {
    const productos = [producto('roja', 'Modelo Tapa Roja'), producto('negro', 'Modelo Chasis Negro')]
    expect(analizarGrupo(productos).genericos).toEqual([])
    expect(productosParaColor(productos, 'Negro').map(p => p.id)).toEqual(['negro'])
  })

  it('no inventa colores a partir del modelo o palabras parecidas', () => {
    expect(extractColor('iPhone 17 Pro Max Sensor Infrarrojo')).toBe('')
    expect(extractColor('Modelo Conector Goldflex')).toBe('')
    expect(analizarGrupo([producto('bateria', 'Modelo Batería')]).colores).toEqual([])
    expect(colorMatches('', 'Naranjo')).toBe(false)
  })

  it('agrupa enlaces equivalentes sin mezclar modelos diferentes', () => {
    expect(normalizarEnlace('  IPHONE  17 Pro Max ')).toBe(normalizarEnlace('iPhone 17 Pro Max'))
    expect(normalizarEnlace('iPhone 17 Pro')).not.toBe(normalizarEnlace('iPhone 17 Pro Max'))
  })
})
