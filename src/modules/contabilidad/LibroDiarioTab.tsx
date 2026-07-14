import { useState, useMemo } from 'react'
import { useAsientos } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Asiento } from '@/types'

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

const REF_TIPO_LABEL: Record<string, string> = {
  venta: 'Venta',
  gasto: 'Gasto',
  oc: 'OC',
  manual: 'Manual',
  venta_anulacion: 'Anulación',
}

export function LibroDiarioTab() {
  const { data: asientos, isLoading } = useAsientos()


  const [busqueda, setBusqueda] = useState('')
  const [detalle, setDetalle] = useState<Asiento | null>(null)

  const lista = useMemo(() => {
    let arr = [...(asientos ?? [])].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      arr = arr.filter(a =>
        a.descripcion.toLowerCase().includes(q) ||
        (a.ref_numero ?? '').toLowerCase().includes(q)
      )
    }
    return arr
  }, [asientos, busqueda])


  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por descripción o referencia..."
            className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-2 px-1">{lista.length} asientos</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">
            {busqueda ? 'Sin resultados' : 'No hay asientos contables'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">N°</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Debe</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Haber</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(a => {
                  const totalDebe = (a.lineas ?? []).reduce((s, l) => s + (l.debe || 0), 0)
                  const totalHaber = (a.lineas ?? []).reduce((s, l) => s + (l.haber || 0), 0)
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetalle(a)}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {a.numero ? `#${a.numero}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{a.fecha}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium max-w-xs truncate">{a.descripcion}</td>
                      <td className="px-4 py-3">
                        {a.ref_tipo && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            {REF_TIPO_LABEL[a.ref_tipo] ?? a.ref_tipo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 font-medium">{fmt(totalDebe)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-medium">{fmt(totalHaber)}</td>
                      <td className="px-4 py-3 text-right">
                        <svg className="w-4 h-4 text-gray-300 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer detalle asiento */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" />
          <div className="bg-white w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">
                  {detalle.numero ? `Asiento #${detalle.numero}` : 'Asiento'}
                </h3>
                <p className="text-xs text-gray-400">{detalle.fecha} · {REF_TIPO_LABEL[detalle.ref_tipo ?? ''] ?? detalle.ref_tipo ?? 'Manual'}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <p className="text-sm text-gray-700 font-medium">{detalle.descripcion}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs text-gray-400 font-medium">Cuenta</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">Debe</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">Haber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(detalle.lineas ?? []).map((l, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-2">
                          <p className="font-medium text-gray-800">{l.cuenta_nombre}</p>
                          <p className="text-xs text-gray-400">{l.cuenta_codigo}</p>
                        </td>
                        <td className="py-2 text-right font-medium text-gray-900">
                          {l.debe ? fmt(l.debe) : '—'}
                        </td>
                        <td className="py-2 text-right font-medium text-gray-900">
                          {l.haber ? fmt(l.haber) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td className="py-2 text-xs font-bold text-gray-500 uppercase">Total</td>
                      <td className="py-2 text-right font-bold text-gray-900">
                        {fmt((detalle.lineas ?? []).reduce((s, l) => s + (l.debe || 0), 0))}
                      </td>
                      <td className="py-2 text-right font-bold text-gray-900">
                        {fmt((detalle.lineas ?? []).reduce((s, l) => s + (l.haber || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
