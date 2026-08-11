// RUT chileno: limpieza, dígito verificador y formato.
//
// Vale tenerlo aparte y con tests porque un RUT mal validado no se nota al
// guardarlo: se nota cuando el SII rechaza el documento tributario, que es
// mucho después y con el cliente esperando su boleta.

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

/** Igual que `soloRutDigits`, tolerando null/undefined. */
export function limpiarRut(valor: string): string {
  return soloRutDigits(valor ?? '')
}

/**
 * Dígito verificador por módulo 11.
 * Los factores se recorren 2,3,4,5,6,7 y vuelven a 2 — de derecha a izquierda.
 */
export function calcularDv(cuerpo: string): string {
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  if (resto === 11) return '0'
  if (resto === 10) return 'K'
  return String(resto)
}

export function validarRut(valor: string): boolean {
  const limpio = limpiarRut(valor)
  // Menos de 7 dígitos + verificador no es un RUT de empresa ni de persona.
  if (limpio.length < 8) return false
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  if (!/^\d+$/.test(cuerpo)) return false
  return calcularDv(cuerpo) === dv
}

/** Formato que espera el SII: sin puntos, con guion. '76123456-7' */
export function rutParaSii(valor: string): string {
  const limpio = limpiarRut(valor)
  if (limpio.length < 2) return limpio
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}
