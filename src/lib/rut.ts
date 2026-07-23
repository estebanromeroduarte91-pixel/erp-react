export function formatRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length <= 1) return clean
  const dv = clean.slice(-1)
  const body = clean.slice(0, -1)
  const bodyFormatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${bodyFormatted}-${dv}`
}

// Deja solo dígitos/K del RUT (sin puntos ni guión), para comparar un RUT
// guardado con puntos (ej. "19.078.135-K") contra lo que alguien tipeó sin
// ellos (ej. "1907813") — una comparación de substring literal nunca calza
// porque los puntos cortan la secuencia de dígitos.
export function soloRutDigits(raw: string): string {
  return raw.replace(/[^0-9kK]/g, '').toUpperCase()
}
