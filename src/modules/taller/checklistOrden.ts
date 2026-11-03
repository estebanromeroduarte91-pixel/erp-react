import type { CheckItem } from '@/types'

// La lista guardada es la fotografía del ingreso, aunque luego cambie la
// configuración o la categoría del catálogo. Nunca descartar sus respuestas.
export function checklistOrden(guardado: CheckItem[] | undefined, etiquetas: string[]): CheckItem[] {
  if (guardado?.length) return guardado.map(item => ({
    ...item,
    estado: item.estado ?? (item.checked ? 'ok' : undefined),
  }))
  return etiquetas.map(label => ({ label, checked: false }))
}
