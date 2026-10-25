import type { OC, EstadoOC } from '@/types'

// Exportada para poder testearla contra fn_recibir_oc (supabase/13_fn_recibir_oc.sql),
// que replica esta misma lógica en SQL — un test acá protege que no se desincronicen.
export function calcularEstadoOC(o: OC): EstadoOC {
  if (o.estado === 'cancelada' || o.estado === 'confirmada') return o.estado
  const items = o.items ?? []
  if (!items.length) return 'borrador'
  const recs = o.recepciones ?? []
  let totalOrd = 0
  let totalRec = 0
  for (const it of items) {
    const rec = recs.reduce((s, r) => {
      const ri = r.items.find(ri => ri.prod_item_id === it.id)
      return s + (ri?.cantidad ?? 0)
    }, 0)
    totalOrd += it.cantidad
    totalRec += Math.min(rec, it.cantidad)
  }
  if (totalRec === 0) return 'borrador'
  if (totalRec >= totalOrd) return 'recibida'
  return 'parcial'
}

export function getCantRecibida(o: OC, itemId: string): number {
  return (o.recepciones ?? []).reduce((s, r) => {
    const ri = r.items.find(ri => ri.prod_item_id === itemId)
    return s + (ri?.cantidad ?? 0)
  }, 0)
}

/**
 * Líneas con nombre pero sin producto del catálogo. Al escribir en una línea
 * el producto se desenlaza y solo se vuelve a enlazar eligiendo una sugerencia;
 * una línea así se recibía "bien" pero no sumaba stock, ni lote, ni movimiento
 * (OC-00121, 00126 y 00128 de Steve Docs, octubre 2026). Se bloquea al guardar
 * y al recibir en vez de descartarla en silencio.
 */
export function lineasSinProducto<T extends { producto_id?: string | null; producto_nombre: string }>(items: T[]): T[] {
  return items.filter(it => it.producto_nombre.trim() && !it.producto_id)
}

export function mensajeLineasSinProducto(nombres: string[], accion: 'guardar' | 'recibir'): string {
  const lista = nombres.map(n => `• ${n.trim()}`).join('\n')
  return accion === 'guardar'
    ? `Estos productos no están enlazados al catálogo, así que al recibirlos no sumarían stock:\n\n${lista}\n\nBórralos y vuelve a escribirlos eligiendo el producto de la lista. Si no existe, créalo primero en Inventario.`
    : `No se puede recibir: estas líneas no están enlazadas a un producto del catálogo y no sumarían stock:\n\n${lista}\n\nEdita la orden y elige el producto de la lista en cada una.`
}

const normalizarNombre = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')

/**
 * Producto del catálogo para un componente de kit: el enlazado en el kit o, si
 * no tiene, el único producto con el mismo nombre. "Crear OC" desde Kits
 * ponía producto_id '' en todas las líneas y las 22 OC armadas desde kits
 * (255 líneas, julio–octubre 2026) se recibieron sin sumar stock.
 * Con dos productos del mismo nombre no adivina: deja la línea sin enlazar
 * y el formulario de la OC pide elegirlo.
 */
export function productoDeComponente(
  componente: { producto_id?: string; nombre: string },
  productos: { id: string; nombre: string; tipo?: string }[],
): string {
  if (componente.producto_id && productos.some(p => p.id === componente.producto_id)) return componente.producto_id
  const buscado = normalizarNombre(componente.nombre)
  const iguales = productos.filter(p => p.tipo !== 'servicio' && normalizarNombre(p.nombre) === buscado)
  return iguales.length === 1 ? iguales[0].id : ''
}
