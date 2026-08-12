export type ResultadoProcesoDte = {
  ok?: boolean
  error?: string
  enviados?: number
  track_id?: string
  veredicto?: string
}

// Las funciones de envío/consulta responden HTTP 200 aunque una empresa haya
// fallado: procesan varias empresas para el cron y devuelven un resultado por
// cada una. El navegador debe revisar también esos resultados internos para no
// mostrar como exitoso un sobre que en realidad no salió.
export function errorEnResultadosDte(data: unknown): string | null {
  const resultados = (data as { resultados?: ResultadoProcesoDte[] } | null)?.resultados
  if (!Array.isArray(resultados)) return null
  const fallos = resultados.filter(r => r?.ok === false || !!r?.error)
  return fallos.length ? fallos.map(r => r.error || 'El SII rechazó el proceso').join(' · ') : null
}
