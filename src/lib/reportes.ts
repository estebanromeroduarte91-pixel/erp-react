// Cálculos de fecha de Estadísticas → Reportes. Viven acá y no dentro del
// componente para poder probarlos: este proyecto ya se quemó una vez con
// fechas interpretadas en UTC (las ventas guardaban 'YYYY-MM-DD', que la
// columna timestamptz leía como medianoche UTC y en Chile retrocedía un día).

export type Periodo = '6m' | '12m' | '24m' | 'año' | 'anterior' | 'todo'

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Rango del período, en fechas locales. `hoy` se inyecta para poder probarlo. */
export function rangoPeriodo(p: Periodo, hoy: Date = new Date()): { desde: string; hasta: string } {
  if (p === 'año') return { desde: `${hoy.getFullYear()}-01-01`, hasta: ymd(hoy) }
  if (p === 'anterior') return { desde: `${hoy.getFullYear() - 1}-01-01`, hasta: `${hoy.getFullYear() - 1}-12-31` }
  // 'todo' manda una fecha deliberadamente antigua: el servidor la acota a la
  // primera venta real, así el cliente no necesita saber cuándo empezó el taller.
  if (p === 'todo') return { desde: '1900-01-01', hasta: ymd(hoy) }
  const atras = p === '6m' ? 5 : p === '24m' ? 23 : 11
  return { desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1)), hasta: ymd(hoy) }
}

/**
 * '2026-08-01' → 'Ago'. Se parsea a mano a propósito: `new Date('2026-08-01')`
 * lo interpreta como UTC, y al oeste de Greenwich eso cae en el mes anterior.
 */
export function etiquetaMes(iso: string): string {
  const m = Number(iso.slice(5, 7))
  return MESES_CORTOS[m - 1] ?? iso.slice(5, 7)
}

/** Escala de cuatro intervalos que siempre incluye cero y todos los valores. */
export function escalaGrafico(valores: number[]): { min: number; max: number; paso: number } {
  const finitos = valores.filter(Number.isFinite)
  const menor = Math.min(0, ...finitos)
  const mayor = Math.max(0, ...finitos)
  if (menor === mayor) return { min: 0, max: 4, paso: 1 }

  const factores = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const siguientePaso = (desde: number) => {
    const exp = Math.pow(10, Math.floor(Math.log10(desde)))
    return (factores.find(f => desde <= f * exp) ?? 10) * exp
  }

  let paso = siguientePaso((mayor - menor) / 4)
  let min = Math.floor(menor / paso) * paso
  let maxNecesario = Math.ceil(mayor / paso) * paso
  while (Math.round((maxNecesario - min) / paso) > 4) {
    paso = siguientePaso(paso * 1.01)
    min = Math.floor(menor / paso) * paso
    maxNecesario = Math.ceil(mayor / paso) * paso
  }
  return { min, max: min + paso * 4, paso }
}
