import type { Producto } from '@/types'

/**
 * Sugerir si algo es producto o servicio a partir de su categoría.
 *
 * Nace de dos incidentes reales: alguien crea un servicio al vuelo desde el
 * POS, el formulario trae "producto" preseleccionado, y la venta termina
 * descontando stock de algo que no existe físicamente. Pasó con "Vidrio
 * Cámara" y con "Microsoldadura Serie 15 pro", que quedaron en stock negativo,
 * y en Terra Móvil hay 160 reparaciones cargadas como productos.
 *
 * La categoría ya sabe la respuesta: si todas las "Microsoldadura" del catálogo
 * son servicios, la siguiente también lo es.
 */

/** Cuántos ítems de la categoría hacen falta para fiarse de la mayoría. */
const MINIMO_PARA_SUGERIR = 3

/** Qué tan pareja debe ser la mayoría (0.8 = el 80% del mismo tipo). */
const MAYORIA = 0.8

export function tipoSugeridoPorCategoria(
  productos: Producto[],
  categoria: string | undefined,
): 'producto' | 'servicio' | null {
  const nombre = (categoria ?? '').trim().toLocaleLowerCase('es')
  if (!nombre) return null

  const enCategoria = productos.filter(
    p => (p.categoria ?? '').trim().toLocaleLowerCase('es') === nombre,
  )
  if (enCategoria.length < MINIMO_PARA_SUGERIR) return null

  const servicios = enCategoria.filter(p => p.tipo === 'servicio').length
  if (servicios / enCategoria.length >= MAYORIA) return 'servicio'
  if ((enCategoria.length - servicios) / enCategoria.length >= MAYORIA) return 'producto'
  // Categoría mezclada (accesorios y mano de obra juntos): mejor no adivinar.
  return null
}
