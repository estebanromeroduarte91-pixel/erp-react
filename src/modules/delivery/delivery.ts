import type { DeliveryEstado, DeliverySolicitud } from './deliveryQueries'

export type Tramo = 'retiro' | 'taller' | 'entrega' | 'cerrada'

export const TRAMOS: Record<Tramo, string> = {
  retiro: 'Retiro',
  taller: 'Taller',
  entrega: 'Entrega',
  cerrada: 'Cerrada',
}

// Mismas píldoras que el resto de Pixit. Rojo = hay que actuar para devolver
// el equipo; verde = ya está en el taller; gris = terminado.
export const ESTADOS: Record<DeliveryEstado, { label: string; pill: string; tramo: Tramo }> = {
  nueva:            { label: 'Nueva',             pill: 'bg-blue-100 text-blue-700',     tramo: 'retiro' },
  retiro_agendado:  { label: 'Retiro agendado',   pill: 'bg-violet-100 text-violet-700', tramo: 'retiro' },
  en_ruta_retiro:   { label: 'En ruta a retiro',  pill: 'bg-amber-100 text-amber-700',   tramo: 'retiro' },
  en_taller:        { label: 'En taller',         pill: 'bg-green-100 text-green-700',   tramo: 'taller' },
  por_entregar:     { label: 'Por entregar',      pill: 'bg-red-100 text-red-600',       tramo: 'entrega' },
  entrega_agendada: { label: 'Entrega agendada',  pill: 'bg-violet-100 text-violet-700', tramo: 'entrega' },
  en_ruta_entrega:  { label: 'En ruta a entrega', pill: 'bg-amber-100 text-amber-700',   tramo: 'entrega' },
  entregada:        { label: 'Entregada',         pill: 'bg-gray-100 text-gray-600',     tramo: 'cerrada' },
  cancelada:        { label: 'Cancelada',         pill: 'bg-gray-100 text-gray-500',     tramo: 'cerrada' },
}

export type AccionPaso = 'agendar_retiro' | 'mover' | 'crear_orden' | 'agendar_entrega' | 'entregar_en_orden'

// El botón de "siguiente paso" de cada estado. En taller no hay botón: la
// orden mueve la solicitud sola cuando queda Lista.
export function siguientePaso(estado: DeliveryEstado): { label: string; accion: AccionPaso; destino?: DeliveryEstado } | null {
  switch (estado) {
    case 'nueva':            return { label: 'Agendar retiro', accion: 'agendar_retiro' }
    case 'retiro_agendado':  return { label: 'Salir a retirar', accion: 'mover', destino: 'en_ruta_retiro' }
    case 'en_ruta_retiro':   return { label: 'Recibir y crear orden', accion: 'crear_orden' }
    case 'por_entregar':     return { label: 'Agendar entrega', accion: 'agendar_entrega' }
    case 'entrega_agendada': return { label: 'Salir a entregar', accion: 'mover', destino: 'en_ruta_entrega' }
    case 'en_ruta_entrega':  return { label: 'Entregar y cobrar', accion: 'entregar_en_orden' }
    default:                 return null
  }
}

export function codigoDelivery(numero: number) {
  return `DEL-${String(numero).padStart(6, '0')}`
}

// Sin dirección de entrega propia, se devuelve donde se retiró.
export function direccionEntrega(s: Pick<DeliverySolicitud, 'direccion' | 'comuna' | 'entrega_direccion' | 'entrega_comuna'>) {
  return s.entrega_direccion
    ? { direccion: s.entrega_direccion, comuna: s.entrega_comuna || s.comuna }
    : { direccion: s.direccion, comuna: s.comuna }
}

export function hoyIso(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(ahora)
}

export function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Fechas "YYYY-MM-DD" sin pasar por new Date('YYYY-MM-DD'), que las lee en UTC
// y en Chile las muestra un día antes.
export function fechaDia(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
}
