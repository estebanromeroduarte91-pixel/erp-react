import type { VentaItem } from '@/types'

/**
 * Qué producto mostrar en una fila de venta cuando hay más de un artículo.
 *
 * Vive acá y no dentro de una pantalla porque la misma regla se usa en el
 * listado de Ventas y en «Últimas ventas» del Dashboard: si algún día cambia
 * el texto o el corte, debe cambiar en un solo lugar.
 *
 * Devuelve `null` cuando la venta no tiene artículos — la pantalla decide si
 * pinta un guion o nada.
 */
export function resumenProductos(items: VentaItem[] | undefined): { primero: string; extra: number } | null {
  const lista = items ?? []
  if (lista.length === 0) return null
  return {
    primero: lista[0].producto_nombre?.trim() || 'Sin nombre',
    extra: lista.length - 1,
  }
}

/** Todos los nombres, para el tooltip de la celda. */
export function nombresProductos(items: VentaItem[] | undefined): string {
  return (items ?? []).map(i => i.producto_nombre?.trim() || 'Sin nombre').join(', ')
}
