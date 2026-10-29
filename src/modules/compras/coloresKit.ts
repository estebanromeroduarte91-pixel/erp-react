import type { Producto } from '@/types'

const normalizarEspacios = (valor: string) => valor.normalize('NFC').trim().replace(/\s+/g, ' ')
const comparar = (valor: string) => normalizarEspacios(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Colores de los repuestos, independientes del modelo o generación del equipo.
const COLOR_WORDS = [
  'titanio negro', 'titanio blanco', 'titanio natural', 'titanio desierto', 'titanio azul',
  'verde noche', 'azul pacífico', 'azul sierra', 'verde alpino', 'morado profundo', 'verde agua',
  'azul profundo', 'naranja cósmico', 'naranjo cósmico',
  'rose gold', 'space gray', 'space black', 'sky blue',
  'silver', 'gold', 'midnight', 'starlight', 'amarillo', 'azul',
  'rosado', 'plata', 'verde', 'morado', 'blanco', 'negro',
  'blanca', 'negra', 'dorado', 'rojo', 'roja', 'coral',
  'amarilla', 'morada', 'rosada', 'dorada', 'plateada', 'plateado', 'celeste', 'red',
  'grafito', 'titanio', 'natural', 'desierto', 'black', 'white', 'blue',
  'naranjo', 'naranja', 'anaranjado', 'anaranjada', 'orange',
  'lavanda', 'lila', 'gris', 'rosa', 'púrpura',
].map(comparar).sort((a, b) => b.length - a.length)

const COLOR_CANON: Record<string, string> = {
  blanca: 'blanco', negra: 'negro', roja: 'rojo', red: 'rojo',
  amarilla: 'amarillo', morada: 'morado', rosada: 'rosado', dorada: 'dorado',
  plateada: 'plata', plateado: 'plata',
  naranja: 'naranjo', anaranjado: 'naranjo', anaranjada: 'naranjo', orange: 'naranjo',
  cosmico: 'cósmico', pacifico: 'pacífico', purpura: 'púrpura',
  oscura: 'oscuro', clara: 'claro', profunda: 'profundo', cosmica: 'cósmico',
}

// Se conserva el matiz completo: "Azul Oscuro" no debe convertirse en "Azul".
const MATICES = new Set([
  'oscuro', 'oscura', 'claro', 'clara', 'profundo', 'profunda',
  'cosmico', 'cosmica', 'metalico', 'metalica', 'mate', 'brillante',
  'espacial', 'marino', 'marina', 'pastel',
])

function colorEnExtremo(texto: string, extremo: 'inicio' | 'final'): string {
  const palabras = texto.split(/[^a-z0-9]+/).filter(Boolean)
  for (let cantidad = Math.min(5, palabras.length); cantidad > 0; cantidad--) {
    const candidato = (extremo === 'inicio'
      ? palabras.slice(0, cantidad)
      : palabras.slice(-cantidad)).join(' ')
    const base = COLOR_WORDS.find(color => candidato === color || candidato.startsWith(color + ' '))
    if (!base) continue
    const matices = candidato.slice(base.length).trim().split(' ').filter(Boolean)
    if (matices.every(matiz => MATICES.has(matiz))) return canonColor(candidato)
  }
  return ''
}

export function canonColor(color: string): string {
  return comparar(color).split(' ').filter(Boolean).map(palabra => {
    const canon = COLOR_CANON[palabra] ?? palabra
    return canon.charAt(0).toUpperCase() + canon.slice(1)
  }).join(' ')
}

export function extractColor(nombre: string): string {
  const normalizado = comparar(nombre)
    .replace(/\btapas?traseras?\b/g, 'tapa trasera')
  // Variantes habituales de escritura, con límites de palabra para no
  // confundir el nombre del equipo u otro componente con estas piezas.
  const pieza = /\b(?:chasis|chassis|chasiz|casis|tapas?[\s_-]+(?:traseras?|traceras?))\b/g
  for (const coincidencia of normalizado.matchAll(pieza)) {
    const antes = normalizado.slice(0, coincidencia.index)
    const despues = normalizado.slice(coincidencia.index + coincidencia[0].length)
    const color = colorEnExtremo(despues, 'inicio') || colorEnExtremo(antes, 'final')
    if (color) return color
  }
  // Mantener la detección anterior para otras piezas, como "Tapa Negra".
  return colorEnExtremo(normalizado, 'final')
}

function isColorSubset(colorA: string, colorB: string): boolean {
  const a = comparar(canonColor(colorA)), b = comparar(canonColor(colorB))
  if (!a || a === b) return false
  const palabras = new Set(b.split(' '))
  return a.split(' ').every(palabra => palabras.has(palabra))
}

export function colorMatches(productColor: string, selectedColor: string): boolean {
  if (!productColor || !selectedColor) return false
  const a = canonColor(productColor), b = canonColor(selectedColor)
  return a === b || isColorSubset(a, b)
}

export function analizarGrupo(prods: Producto[]): { colores: string[]; genericos: Producto[] } {
  const genericos: Producto[] = []
  const colores = new Set<string>()
  for (const producto of prods) {
    const color = extractColor(producto.nombre)
    if (color) colores.add(color)
    else genericos.push(producto)
  }
  const todos = [...colores]
  return {
    colores: todos.filter(color => !todos.some(otro => isColorSubset(color, otro))).sort(),
    genericos,
  }
}

export function productosParaColor(prods: Producto[], color: string): Producto[] {
  // Cada producto aparece una sola vez: los genéricos se incluyen en todos los colores.
  return prods.filter(producto => {
    const propio = extractColor(producto.nombre)
    return !propio || colorMatches(propio, color)
  })
}

export function normalizarEnlace(enlace: string | undefined): string {
  return normalizarEspacios(enlace ?? '').toLowerCase()
}
