import { useState, useMemo } from 'react'
import { useMovimientos } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', traslado: 'Traslado',
}
const TIPO_COLOR: Record<string, string> = {
  entrada:  'bg-green-100 text-green-700',
  salida:   'bg-red-100 text-red-700',
  ajuste:   'bg-yellow-100 text-yellow-800',
  traslado: 'bg-blue-100 text-blue-700',
}

export function MovimientosTab() {
  const { data: movimientos, isLoading } = useMovimientos()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const lista = useMemo(() => {
    let r = movimientos ?? []
    if (filtroTipo) r = r.filter((m) => m.tipo === filtroTipo)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter((m) =>
        m.referencia?.toLowerCase().includes(q) ||
        m.notas?.toLowerCase().includes(q) ||
        m.productos.some((p) => p.producto_nombre?.toLowerCase().includes(q))
      )
    }
    return r
  }, [movimientos, filtroTipo, busqueda])

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, referencia..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-blue-400">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">Sin movimientos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Productos</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Referencia</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {m.fecha} {m.hora && <span className="text-gray-400 text-xs">{m.hora}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLOR[m.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TIPO_LABEL[m.tipo] ?? m.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.productos.map((p, i) => (
                        <p key={i} className="text-xs text-gray-700">
                          {p.producto_nombre} <span className="text-gray-400">×{p.cantidad}</span>
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.referencia || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.usuario || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
