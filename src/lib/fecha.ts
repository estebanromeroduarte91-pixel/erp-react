// Fecha local en formato YYYY-MM-DD.
//
// NO usar `new Date().toISOString().slice(0, 10)` para esto: eso devuelve la
// fecha en UTC. En Chile (UTC-3/-4) a partir de las 20:00-21:00 el UTC ya está
// en el día siguiente, y eso rompía los filtros por fecha de forma silenciosa:
//
//   * "Hoy" en el listado de Ventas dejaba de mostrar las ventas del día
//     durante toda la noche (pedía las de mañana).
//   * "Este mes" en Estadísticas saltaba al mes siguiente la última noche del
//     mes, mostrando $0.
//
// El POS guarda `fecha` con la fecha LOCAL, así que todo filtro tiene que
// usar la misma referencia para comparar contra lo guardado.
export function fechaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Hora local ("15:03") de un timestamp, o null si no trae una hora real.
 *
 * Las órdenes antiguas se importaron solo con la fecha y quedaron guardadas a
 * las 00:00:00 UTC exactas; mostrarles "21:00" sería inventar una hora. Las
 * creadas en Pixit guardan la hora con milisegundos.
 */
export function horaReal(iso?: string | null): string | null {
  if (!iso || !iso.includes('T')) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) return null
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}
