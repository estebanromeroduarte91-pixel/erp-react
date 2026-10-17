import type { ComportamientoGasto } from '@/types'

export interface MetaVentasConfig {
  periodo: string
  branch_id: string
  meta_mensual: number
  costos_fijos_presupuestados: number | null
  dias_operacion: number[]
}

export interface BaseMetaVentas {
  ventas: number
  costoProductos: number
  gastosVariables: number
  costosFijosActuales: number
  costosFijosReferencia: number
  metaConfigurada: number
  costosFijosPresupuestados: number | null
  diasOperacion: number[]
  periodo: string
  hoy?: string
}

export interface ResultadoMetaVentas {
  ventas: number
  costosFijosBase: number
  margenContribucion: number
  margenContribucionPct: number
  puntoEquilibrio: number | null
  metaMensual: number
  metaBaseDiaria: number
  metaNecesariaDiaria: number
  avancePct: number
  esperadoALaFecha: number
  holgura: number
  diasTotales: number
  diasTranscurridos: number
  diasRestantes: number
  proyeccionCierre: number
}

function fechaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function diasOperacionMes(periodo: string, dias: number[], hoy?: string) {
  const [y, m] = periodo.slice(0, 7).split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  const seleccionados = new Set(dias.length ? dias : [1, 2, 3, 4, 5, 6])
  const fechaHoy = fechaLocal(hoy ?? new Date().toISOString().slice(0, 10))
  const inicio = new Date(y, m - 1, 1)
  const fin = new Date(y, m - 1, ultimo)
  let total = 0
  let transcurridos = 0
  let restantes = 0
  for (let d = 1; d <= ultimo; d++) {
    const fecha = new Date(y, m - 1, d)
    const isoDow = fecha.getDay() === 0 ? 7 : fecha.getDay()
    if (!seleccionados.has(isoDow)) continue
    total++
    if (fecha <= fechaHoy) transcurridos++
    if (fecha >= fechaHoy) restantes++
  }
  if (fechaHoy < inicio) return { total, transcurridos: 0, restantes: total }
  if (fechaHoy > fin) return { total, transcurridos: total, restantes: 0 }
  return { total, transcurridos, restantes }
}

export function calcularMetaVentas(b: BaseMetaVentas): ResultadoMetaVentas {
  const ventas = Math.max(0, b.ventas || 0)
  const costosFijosBase = b.costosFijosPresupuestados != null
    ? Math.max(0, b.costosFijosPresupuestados)
    : Math.max(0, b.costosFijosReferencia || b.costosFijosActuales || 0)
  const margenContribucion = ventas - Math.max(0, b.costoProductos || 0) - Math.max(0, b.gastosVariables || 0)
  const margenContribucionPct = ventas > 0 ? margenContribucion / ventas : 0
  const puntoEquilibrio = margenContribucionPct > 0 ? costosFijosBase / margenContribucionPct : null
  const metaMensual = Math.max(0, b.metaConfigurada || puntoEquilibrio || 0)
  const dias = diasOperacionMes(b.periodo, b.diasOperacion, b.hoy)
  const metaBaseDiaria = dias.total > 0 ? metaMensual / dias.total : 0
  const esperadoALaFecha = metaBaseDiaria * dias.transcurridos
  const holgura = ventas - esperadoALaFecha
  const metaNecesariaDiaria = dias.restantes > 0 ? Math.max(0, metaMensual - ventas) / dias.restantes : 0
  const avancePct = metaMensual > 0 ? ventas / metaMensual * 100 : 0
  const proyeccionCierre = dias.transcurridos > 0 ? ventas / dias.transcurridos * dias.total : 0
  return {
    ventas, costosFijosBase, margenContribucion, margenContribucionPct,
    puntoEquilibrio, metaMensual, metaBaseDiaria, metaNecesariaDiaria,
    avancePct, esperadoALaFecha, holgura, diasTotales: dias.total,
    diasTranscurridos: dias.transcurridos, diasRestantes: dias.restantes,
    proyeccionCierre,
  }
}

export const ETIQUETA_COMPORTAMIENTO: Record<ComportamientoGasto, string> = {
  fijo: 'Fijo', variable: 'Variable',
}
