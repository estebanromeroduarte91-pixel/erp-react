import { useMemo } from 'react'
import { useAsientos, usePlanCuentas } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

export function EstadoResultadosTab() {
  const { data: asientos, isLoading } = useAsientos()
  const { data: cuentas } = usePlanCuentas()

  const { ingresos, gastos, utilidad } = useMemo(() => {
    const cuentaMap: Record<string, { tipo: string; nombre: string; codigo: string }> = {}
    ;(cuentas ?? []).forEach(c => { cuentaMap[c.id] = c })

    const totalesCuenta: Record<string, number> = {}

    ;(asientos ?? []).forEach(a => {
      ;(a.lineas ?? []).forEach(l => {
        const c = cuentaMap[l.cuenta_id]
        if (!c) return
        if (c.tipo === 'ingreso') {
          totalesCuenta[l.cuenta_id] = (totalesCuenta[l.cuenta_id] ?? 0) + (l.haber - l.debe)
        } else if (c.tipo === 'gasto') {
          totalesCuenta[l.cuenta_id] = (totalesCuenta[l.cuenta_id] ?? 0) + (l.debe - l.haber)
        }
      })
    })

    const ingresosItems = (cuentas ?? [])
      .filter(c => c.tipo === 'ingreso' && totalesCuenta[c.id])
      .map(c => ({ nombre: c.nombre, codigo: c.codigo, total: totalesCuenta[c.id] ?? 0 }))
      .sort((a, b) => b.total - a.total)

    const gastosItems = (cuentas ?? [])
      .filter(c => c.tipo === 'gasto' && totalesCuenta[c.id])
      .map(c => ({ nombre: c.nombre, codigo: c.codigo, total: totalesCuenta[c.id] ?? 0 }))
      .sort((a, b) => b.total - a.total)

    const totalIngresos = ingresosItems.reduce((s, i) => s + i.total, 0)
    const totalGastos = gastosItems.reduce((s, i) => s + i.total, 0)

    return {
      ingresos: { items: ingresosItems, total: totalIngresos },
      gastos: { items: gastosItems, total: totalGastos },
      utilidad: totalIngresos - totalGastos,
    }
  }, [asientos, cuentas])

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-green-50 border-b border-green-100">
          <p className="text-xs font-bold text-green-700 uppercase tracking-wide">Ingresos</p>
        </div>
        {ingresos.items.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-4">Sin ingresos registrados</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {ingresos.items.map(item => (
                  <tr key={item.codigo}>
                    <td className="px-5 py-3 text-gray-700">{item.codigo} — {item.nombre}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center px-5 py-3 bg-green-50 border-t border-green-100">
              <span className="text-sm font-bold text-green-800">Total ingresos</span>
              <span className="text-base font-extrabold text-green-700">{fmt(ingresos.total)}</span>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-red-50 border-b border-red-100">
          <p className="text-xs font-bold text-red-600 uppercase tracking-wide">Gastos</p>
        </div>
        {gastos.items.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-4">Sin gastos registrados</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {gastos.items.map(item => (
                  <tr key={item.codigo}>
                    <td className="px-5 py-3 text-gray-700">{item.codigo} — {item.nombre}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center px-5 py-3 bg-red-50 border-t border-red-100">
              <span className="text-sm font-bold text-red-700">Total gastos</span>
              <span className="text-base font-extrabold text-red-600">{fmt(gastos.total)}</span>
            </div>
          </>
        )}
      </div>

      <div className={[
        'rounded-xl border p-5 flex justify-between items-center',
        utilidad >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200',
      ].join(' ')}>
        <span className={['text-base font-bold', utilidad >= 0 ? 'text-blue-800' : 'text-orange-800'].join(' ')}>
          {utilidad >= 0 ? 'Utilidad del período' : 'Pérdida del período'}
        </span>
        <span className={['text-2xl font-extrabold', utilidad >= 0 ? 'text-blue-700' : 'text-orange-600'].join(' ')}>
          {fmt(Math.abs(utilidad))}
        </span>
      </div>
    </div>
  )
}
