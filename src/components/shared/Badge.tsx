import type { EstadoOrden } from '@/types'

const COLORES: Record<string, string> = {
  'Chequeo':      'bg-yellow-100 text-yellow-800',
  'Reparación':   'bg-blue-100 text-blue-800',
  'Listo':        'bg-green-100 text-green-800',
  'Entregado':    'bg-gray-100 text-gray-600',
  'No reparable': 'bg-red-100 text-red-700',
}

export function EstadoBadge({ estado }: { estado: EstadoOrden | string }) {
  const color = COLORES[estado] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {estado || '—'}
    </span>
  )
}
