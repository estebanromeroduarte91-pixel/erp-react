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
