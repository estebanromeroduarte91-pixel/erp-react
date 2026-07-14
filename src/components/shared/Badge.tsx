import type { EstadoOrden } from '@/types'

const COLORES: Record<string, string> = {
  'Chequeo':           'bg-amber-100 text-amber-700',
  'Reparación':        'bg-purple-100 text-purple-700',
  'Listo':             'bg-green-100 text-green-700',
  'Entregado':         'bg-gray-100 text-gray-500',
  'No reparable':      'bg-red-100 text-red-700',
}

const COLORES_SUB: Record<string, string> = {
  'Reparado':          'bg-green-100 text-green-700',
  'Sin solución':      'bg-amber-100 text-amber-700',
  'No reparado':       'bg-red-100 text-red-700',
  'No presento falla': 'bg-purple-100 text-purple-700',
}

export function EstadoBadge({ estado, subestado }: { estado: EstadoOrden | string; subestado?: string }) {
  const color = subestado
    ? (COLORES_SUB[subestado] ?? COLORES[estado] ?? 'bg-gray-100 text-gray-600')
    : (COLORES[estado] ?? 'bg-gray-100 text-gray-600')
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {subestado ?? estado ?? '—'}
    </span>
  )
}
