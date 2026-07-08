import type { EstadoOrden } from '@/types'

const COLORES: Record<string, string> = {
  'Chequeo':           'bg-yellow-100 text-yellow-800',
  'Reparación':        'bg-blue-100 text-blue-800',
  'Listo':             'bg-green-100 text-green-800',
  'Entregado':         'bg-gray-100 text-gray-600',
  'No reparable':      'bg-red-100 text-red-700',
}

const COLORES_SUB: Record<string, string> = {
  'Reparado':          'bg-green-100 text-green-800',
  'Sin solución':      'bg-yellow-100 text-yellow-800',
  'No reparado':       'bg-red-100 text-red-700',
  'No presento falla': 'bg-blue-100 text-blue-800',
}

export function EstadoBadge({ estado, subestado }: { estado: EstadoOrden | string; subestado?: string }) {
  const color = subestado
    ? (COLORES_SUB[subestado] ?? COLORES[estado] ?? 'bg-gray-100 text-gray-600')
    : (COLORES[estado] ?? 'bg-gray-100 text-gray-600')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {subestado ?? estado ?? '—'}
    </span>
  )
}
