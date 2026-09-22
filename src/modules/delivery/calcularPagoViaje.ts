// Vista previa del monto. Postgres vuelve a calcularlo en la columna generada
// delivery_viajes.monto, con la misma regla y la tarifa copiada al viaje.
export function calcularPagoViaje(km: number | null, tarifaKm: number, minimo: number) {
  if (km == null || !Number.isFinite(km) || km <= 0 || !Number.isFinite(tarifaKm) || tarifaKm < 0 || !Number.isFinite(minimo) || minimo < 0) return null
  return Math.max(Math.round(km * tarifaKm), Math.round(minimo))
}
