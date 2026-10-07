import { GASTO_GENERAL_ID } from '@/lib/gastos'
import type { Gasto, NaturalezaGasto } from '@/types'

/**
 * No todo lo que está en `gastos` es resultado operativo de una tienda: una
 * cuota de crédito o la compra de un equipo no lo son. La naturaleza se elige
 * al registrar el gasto; la categoría solo propone el valor inicial.
 */
export const NATURALEZAS: { id: NaturalezaGasto; etiqueta: string; ayuda: string }[] = [
  { id: 'tienda', etiqueta: 'Tienda', ayuda: 'Cuenta en el resultado de una sucursal.' },
  { id: 'corporativo', etiqueta: 'Corporativo', ayuda: 'Se reparte entre todas las sucursales.' },
  { id: 'financiero', etiqueta: 'Financiero', ayuda: 'Créditos y gastos bancarios. No es operación.' },
  { id: 'inversion', etiqueta: 'Inversión', ayuda: 'Equipos y activos. No es gasto del mes.' },
]

/** categoría (normalizada) → naturaleza sugerida */
export type ConfigNaturaleza = Map<string, NaturalezaGasto>

export function claveCategoria(categoria: string | undefined): string {
  return (categoria ?? '').trim().toLocaleLowerCase('es')
}

export function naturalezaSugerida(
  categoria: string | undefined,
  config: ConfigNaturaleza | undefined,
): NaturalezaGasto | undefined {
  return config?.get(claveCategoria(categoria))
}

/** Lo que vale para un gasto: su propia decisión, luego la categoría, luego su sucursal. */
export function naturalezaEfectiva(
  g: Pick<Gasto, 'naturaleza' | 'categoria' | 'bodega_id'>,
  config: ConfigNaturaleza | undefined,
): NaturalezaGasto {
  if (g.naturaleza) return g.naturaleza
  const sugerida = naturalezaSugerida(g.categoria, config)
  if (sugerida) return sugerida
  return !g.bodega_id || g.bodega_id === GASTO_GENERAL_ID ? 'corporativo' : 'tienda'
}

/**
 * Qué sucursal queda al cambiar de naturaleza. Corporativo es siempre
 * "general"; tienda exige una sucursal concreta (si venía de general, se
 * limpia para obligar a elegir); financiero e inversión toleran ambas.
 */
export function bodegaAlCambiarNaturaleza(n: NaturalezaGasto, bodegaActual: string): string {
  if (n === 'corporativo') return GASTO_GENERAL_ID
  if (n === 'tienda') return bodegaActual === GASTO_GENERAL_ID ? '' : bodegaActual
  return bodegaActual || GASTO_GENERAL_ID
}

/** Mensaje si la combinación naturaleza + sucursal no es válida; null si lo es. */
export function errorDeClasificacion(n: NaturalezaGasto, bodegaId: string): string | null {
  if (n === 'tienda' && (!bodegaId || bodegaId === GASTO_GENERAL_ID)) {
    return 'Elige a qué sucursal corresponde este gasto'
  }
  if (!bodegaId) return 'Elige a qué sucursal corresponde este gasto'
  return null
}
