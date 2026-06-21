import type { Orden } from '@/types'

export function totalOrden(o: Orden): number {
  const manual = Number(o.costo) || Number(o.presup) || 0
  if (manual) return manual
  return (o.repuestos ?? []).reduce((s, r) => s + r.precio * (r.qty ?? 1), 0)
}
