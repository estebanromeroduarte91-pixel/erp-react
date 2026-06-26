// ── Cálculo de días hábiles y vacaciones legales (Chile) ─────────

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

export function getFeriadosChile(year: number): Set<string> {
  const easter = easterSunday(year)
  return new Set([
    `${year}-01-01`, // Año Nuevo
    `${year}-05-01`, // Día del Trabajo
    `${year}-05-21`, // Glorias Navales
    ...(year >= 2021 ? [`${year}-06-21`] : []), // Pueblos Indígenas
    `${year}-06-29`, // San Pedro y San Pablo
    `${year}-07-16`, // Virgen del Carmen
    `${year}-08-15`, // Asunción de la Virgen
    `${year}-09-18`, // Independencia
    `${year}-09-19`, // Glorias del Ejército
    `${year}-10-12`, // Encuentro de Dos Mundos
    `${year}-10-31`, // Iglesias Evangélicas
    `${year}-11-01`, // Todos los Santos
    `${year}-12-08`, // Inmaculada Concepción
    `${year}-12-25`, // Navidad
    ymd(addDays(easter, -2)), // Viernes Santo
    ymd(addDays(easter, -1)), // Sábado Santo
  ])
}

// Días hábiles (Lun–Sáb) entre dos fechas inclusive, sin contar feriados
export function diasHabilesEnRango(inicio: string, fin: string): number {
  const start = new Date(inicio + 'T12:00:00')
  const end = new Date(fin + 'T12:00:00')
  if (end < start) return 0

  const years = new Set<number>()
  const tmp = new Date(start)
  while (tmp <= end) { years.add(tmp.getFullYear()); tmp.setDate(tmp.getDate() + 1) }

  const feriados = new Set<string>()
  for (const y of years) for (const f of getFeriadosChile(y)) feriados.add(f)

  let count = 0
  const d = new Date(start)
  while (d <= end) {
    if (d.getDay() !== 0 && !feriados.has(ymd(d))) count++ // 0 = domingo
    d.setDate(d.getDate() + 1)
  }
  return count
}

// Días acumulados proporcionales desde la fecha de ingreso
export function diasAcumulados(fechaIngreso: string, diasAnuales = 15): number {
  const inicio = new Date(fechaIngreso + 'T12:00:00')
  const hoy = new Date()
  const diffMs = hoy.getTime() - inicio.getTime()
  if (diffMs < 0) return 0
  const meses = diffMs / (1000 * 60 * 60 * 24 * 30.4375)
  return Math.round(meses * (diasAnuales / 12) * 10) / 10
}
