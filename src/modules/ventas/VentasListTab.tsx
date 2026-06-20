import { useState, useMemo } from 'react'
import { useVentas, useGuardarVentas, useMetodosPago } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Venta } from '@/types'

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

export function VentasListTab() {
  const { data: ventas, isLoading } = useVentas()
  const { data: metodos } = useMetodosPago()
  const guardar = useGuardarVentas()

  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todas' | 'pagada' | 'anulada'>('todas')
  const [detalle, setDetalle] = useState<Venta | null>(null)

  const mpMap = useMemo(() => {
    const m: Record<string, string> = {}
    ;(metodos ?? []).forEach(mp => { m[mp.id] = mp.label })
    return m
  }, [metodos])

  const lista = useMemo(() => {
    let arr = [...(ventas ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha))
    if (filtroEstado !== 'todas') arr = arr.filter(v => v.estado === filtroEstado)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      arr = arr.filter(v =>
        v.numero.toLowerCase().includes(q) ||
        v.cliente.toLowerCase().includes(q)
      )
    }
    return arr
  }, [ventas, filtroEstado, busqueda])

  async function anular(v: Venta) {
    if (!confirm(`¿Anular la venta ${v.numero}?`)) return
    await guardar.mutateAsync((ventas ?? []).map(x => x.id === v.id ? { ...x, estado: 'anulada' as const } : x))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por número o cliente..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(['todas', 'pagada', 'anulada'] as const).map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={['px-3 py-1.5 text-sm font-medium rounded-lg transition capitalize',
                filtroEstado === e ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'].join(' ')}>
              {e === 'todas' ? 'Todas' : e === 'pagada' ? 'Pagadas' : 'Anuladas'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-2 px-1">{lista.length} ventas</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">
            {busqueda || filtroEstado !== 'todas' ? 'Sin resultados' : 'No hay ventas registradas'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">N°</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Método</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{v.numero}</td>
                    <td className="px-4 py-3 text-gray-600">{v.fecha}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{v.cliente}</td>
                    <td className="px-4 py-3 text-gray-500">{mpMap[v.metodo_pago] ?? v.metodo_pago ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      <span className={v.estado === 'anulada' ? 'line-through text-gray-400' : ''}>
                        {fmt(v.total_iva)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={[
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        v.estado === 'pagada'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-600',
                      ].join(' ')}>
                        {v.estado === 'pagada' ? 'Pagada' : 'Anulada'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setDetalle(v)} className="text-xs text-blue-600 hover:underline font-medium">Ver</button>
                        {v.estado === 'pagada' && (
                          <button onClick={() => anular(v)} className="text-xs text-red-500 hover:underline font-medium">Anular</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer detalle venta */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" />
          <div className="bg-white w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">{detalle.numero}</h3>
                <p className="text-xs text-gray-400">{detalle.fecha} · {detalle.cliente}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Método de pago</span>
                  <span className="font-medium">{mpMap[detalle.metodo_pago] ?? detalle.metodo_pago}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Estado</span>
                  <span className={detalle.estado === 'pagada' ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                    {detalle.estado === 'pagada' ? 'Pagada' : 'Anulada'}
                  </span>
                </div>
                {detalle.otNum && (
                  <div className="flex justify-between text-gray-600">
                    <span>OT vinculada</span>
                    <span className="font-medium">#{detalle.otNum}</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Productos</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs text-gray-400 font-medium">Producto</th>
                      <th className="text-center py-2 text-xs text-gray-400 font-medium">Qty</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detalle.items.map(it => (
                      <tr key={it.id}>
                        <td className="py-2 text-gray-800">{it.producto_nombre}</td>
                        <td className="py-2 text-center text-gray-500">{it.cantidad}</td>
                        <td className="py-2 text-right font-medium text-gray-900">
                          {fmt(it.precio_iva * it.cantidad)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Subtotal neto</span>
                <span>{fmt(detalle.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 mb-3">
                <span>IVA (19%)</span>
                <span>{fmt(detalle.total_iva - detalle.total)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg text-gray-900">
                <span>Total</span>
                <span className="text-blue-700">{fmt(detalle.total_iva)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
