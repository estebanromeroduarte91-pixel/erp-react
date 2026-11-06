// Modelos compatibles de un producto, guardados como texto separado por coma
// ("iPhone 12, iPhone 12 Pro") para que la búsqueda del servidor los encuentre
// con el mismo ilike que usa para el nombre y el SKU.

import { normalizar } from './texto'

/** "iPhone 12, iphone 12 pro ,," → ["iPhone 12", "iphone 12 pro"]. Sin repetidos. */
export function leerModelos(texto: string | null | undefined): string[] {
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const parte of (texto ?? '').split(/[,;\n]/)) {
    const limpio = parte.trim().replace(/\s+/g, ' ')
    const clave = normalizar(limpio)
    if (!clave || vistos.has(clave)) continue
    vistos.add(clave)
    salida.push(limpio)
  }
  return salida
}

/** Lista → texto para guardar. Lista vacía → '' (el guardado lo deja en null). */
export function escribirModelos(modelos: string[]): string {
  return leerModelos(modelos.join(',')).join(', ')
}

/**
 * Agrega lo que el usuario escribió (puede traer varios separados por coma) a
 * la lista, sin repetir uno que ya está escrito de otra forma.
 */
export function agregarModelos(actuales: string[], escrito: string): string[] {
  return leerModelos([...actuales, escrito].join(','))
}
