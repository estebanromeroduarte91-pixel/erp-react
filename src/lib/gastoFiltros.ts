export const SIN_ASIGNACION = '__none__'

export function normalizarAsignacion(texto: string) {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

export function esVarianteAsignacion(a: string, b: string) {
  return a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ')
}

export function coincideAsignacion(
  subcategoria: string | undefined,
  filtro: { clave: string; nombre: string },
) {
  const valor = (subcategoria ?? '').trim()
  if (filtro.clave === SIN_ASIGNACION) return valor === ''
  if (!valor) return false
  return esVarianteAsignacion(normalizarAsignacion(valor), normalizarAsignacion(filtro.nombre))
}
