import type { Orden, Equipo } from '@/types'

// El equipo se guarda en la orden como texto libre ("iPhone 13 [Apple]"), sin
// vínculo con el catálogo — para saber qué checklist mostrar (distinto por
// categoría de equipo) hay que resolverlo buscando ese modelo/marca en el
// catálogo de Equipos. Sin match (modelo tipeado a mano, orden histórica), cae
// a 'Teléfono' — la categoría más común — en vez de dejar el checklist vacío.
export function resolverCategoriaEquipo(modeloTexto: string | undefined, equipos: Equipo[]): string {
  if (!modeloTexto) return 'Teléfono'
  const m = modeloTexto.match(/^(.*?)\s*\[(.+)\]$/)
  const modelo = (m ? m[1] : modeloTexto).trim().toLowerCase()
  const marca = m ? m[2].trim().toLowerCase() : null
  const match =
    equipos.find(e => (e.modelo ?? '').trim().toLowerCase() === modelo && (!marca || (e.marca ?? '').trim().toLowerCase() === marca)) ??
    equipos.find(e => (e.modelo ?? '').trim().toLowerCase() === modelo)
  return match?.categoria || 'Teléfono'
}

export function totalOrden(o: Pick<Orden, 'costo' | 'presup' | 'repuestos'>): number {
  const manual = Number(o.costo) || Number(o.presup) || 0
  if (manual) return manual
  return (o.repuestos ?? []).reduce((s, r) => s + r.precio * (r.qty ?? 1), 0)
}

const ALL_DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
const LBL_DIAS: Record<string, string> = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' }

function fmtBloque(b: { dias?: string[]; desde?: string; hasta?: string }): string {
  const idx = (b.dias ?? []).filter(d => ALL_DIAS.includes(d)).map(d => ALL_DIAS.indexOf(d)).sort((a, z) => a - z)
  let dStr = ''
  if (idx.length) {
    const consec = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
    dStr = consec && idx.length > 2
      ? `${LBL_DIAS[ALL_DIAS[idx[0]]]}–${LBL_DIAS[ALL_DIAS[idx[idx.length - 1]]]}`
      : idx.map(i => LBL_DIAS[ALL_DIAS[i]]).join(', ')
  }
  const tStr = b.desde && b.hasta ? `${b.desde}–${b.hasta}` : b.desde || b.hasta || ''
  return [dStr, tStr].filter(Boolean).join(' ')
}

export function formatHorario(h: unknown): string {
  if (!h) return ''
  if (typeof h === 'string') return h
  const obj = h as { bloques?: Array<{ dias?: string[]; desde?: string; hasta?: string }> }
  if (Array.isArray(obj.bloques)) return obj.bloques.map(fmtBloque).filter(Boolean).join(' / ')
  return fmtBloque(obj as { dias?: string[]; desde?: string; hasta?: string })
}
