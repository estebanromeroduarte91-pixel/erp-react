import type { ComportamientoGasto, Gasto } from '@/types'
import { claveCategoria } from './naturalezaGasto'

export type ConfigComportamiento = Map<string, ComportamientoGasto>

export const COMPORTAMIENTOS: { id: ComportamientoGasto; etiqueta: string; ayuda: string }[] = [
  { id: 'fijo', etiqueta: 'Fijo', ayuda: 'Se mantiene aunque las ventas suban o bajen, como arriendo o sueldo base.' },
  { id: 'variable', etiqueta: 'Variable', ayuda: 'Aumenta con las ventas o la actividad, como comisiones, delivery o embalaje.' },
]

export function comportamientoSugerido(
  categoria: string | undefined,
  config: ConfigComportamiento | undefined,
  subcategoria?: string,
): ComportamientoGasto | undefined {
  if (!config) return undefined
  return (subcategoria?.trim() ? config.get(claveCategoria(categoria, subcategoria)) : undefined)
    ?? config.get(claveCategoria(categoria))
}

/**
 * Los históricos sin clasificación explícita usan primero la regla de su
 * categoría. Si tampoco existe, se tratan como fijos: es el supuesto prudente
 * para no subestimar el punto de equilibrio.
 */
export function comportamientoEfectivo(
  g: Pick<Gasto, 'comportamiento' | 'categoria' | 'subcategoria'>,
  config: ConfigComportamiento | undefined,
): ComportamientoGasto {
  return g.comportamiento
    ?? comportamientoSugerido(g.categoria, config, g.subcategoria)
    ?? 'fijo'
}
