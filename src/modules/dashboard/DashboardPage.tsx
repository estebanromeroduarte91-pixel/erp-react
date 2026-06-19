import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useVentas, useGastos, useOrdenes, useBodegas, useMetodosPago } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

function mesActual() { return new Date().toISOString().slice(0, 7) }
function mesPrev() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 7)
}

function DeltaBadge({ curr, prev, inverted = false }: { curr: number; prev: number; inverted?: boolean }) {
  if (!prev) return null
  const pct = Math.round(Math.abs((curr - prev) / prev) * 100)
  const up = curr >= prev
  const good = inverted ? !up : up
  return (
    <span className={['text-xs font-semibold px-1.5 py-0.5 rounded-full', good ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'].join(' ')}>
      {up ? '↑' : '↓'} {pct}%
    </span>
  )
}

function KpiCard({ label, value, sub, delta, deltaPrev, inverted, accent }: {
  label: string; value: string; sub?: string
  delta?: number; deltaPrev?: number; inverted?: boolean; accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
      <div className="flex items-end gap-2">
        <p className={['text-2xl font-extrabold', accent ?? 'text-gray-900'].join(' ')}>{value}</p>
        {delta !== undefined && deltaPrev !== undefined && (
          <div className="mb-0.5">
            <DeltaBadge curr={delta} prev={deltaPrev} inverted={inverted} />
          </div>
        )}
      </div>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export function DashboardPage() {
  const { data: ventas, isLoading: loadV } = useVentas()
  const { data: gastos, isLoading: loadG } = useGastos()
  const { data: ordenes, isLoading: loadO } = useOrdenes()
  const { data: bodegas } = useBodegas()
  const { data: metodos } = useMetodosPago()

  const mes = mesActual()
  const mesAnt = mesPrev()

  const stats = useMemo(() => {
    const ventasMes = (ventas ?? []).filter(v => v.estado !== 'anulada' && v.fecha?.startsWith(mes))
    const ventasMesAnt = (ventas ?? []).filter(v => v.estado !== 'anulada' && v.fecha?.startsWith(mesAnt))
    const gastosMes = (gastos ?? []).filter(g => g.fecha?.startsWith(mes))
    const gastosMesAnt = (gastos ?? []).filter(g => g.fecha?.startsWith(mesAnt))
    const otsMes = (ordenes ?? []).filter(o => o.status === 'Entregado' && o.fecha?.startsWith(mes))
    const otsMesAnt = (ordenes ?? []).filter(o => o.status === 'Entregado' && o.fecha?.startsWith(mesAnt))
    const otsAbiertas = (ordenes ?? []).filter(o => !['Entregado', 'No reparable'].includes(o.status))

    const totalVentasMes = ventasMes.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const totalVentasMesAnt = ventasMesAnt.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const totalGastosMes = gastosMes.reduce((s, g) => s + (+g.monto || 0), 0)
    const totalGastosMesAnt = gastosMesAnt.reduce((s, g) => s + (+g.monto || 0), 0)
    const utilidad = totalVentasMes - totalGastosMes

    const ultimasVentas = [...(ventas ?? [])].filter(v => v.estado !== 'anulada').slice(-5).reverse()
    const ultimosGastos = [...(gastos ?? [])].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')).slice(0, 5)

    // Ventas por sucursal del mes
    const branchSales = (bodegas ?? []).map(b => {
      const bv = ventasMes.filter(v => v.branchId === b.id)
      return { nombre: b.nombre ?? b.name ?? 'Sin nombre', total: bv.reduce((s, v) => s + (+v.total_iva || 0), 0), count: bv.length }
    }).filter(b => b.count > 0)

    const mpMap: Record<string, string> = {}
    ;(metodos ?? []).forEach(m => { mpMap[m.id] = m.label })

    return {
      totalVentasMes, totalVentasMesAnt,
      totalGastosMes, totalGastosMesAnt,
      otsMes: otsMes.length, otsMesAnt: otsMesAnt.length,
      otsAbiertas: otsAbiertas.length,
      utilidad,
      ventasMes: ventasMes.length,
      ultimasVentas, ultimosGastos,
      branchSales,
      mpMap,
    }
  }, [ventas, gastos, ordenes, bodegas, metodos, mes, mesAnt])

  if (loadV || loadG || loadO) {
    return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Ventas del mes"
          value={fmt(stats.totalVentasMes)}
          sub={`${stats.ventasMes} ventas`}
          delta={stats.totalVentasMes}
          deltaPrev={stats.totalVentasMesAnt}
          accent="text-green-700"
        />
        <KpiCard
          label="Gastos del mes"
          value={fmt(stats.totalGastosMes)}
          delta={stats.totalGastosMes}
          deltaPrev={stats.totalGastosMesAnt}
          inverted
        />
        <KpiCard
          label="OTs completadas"
          value={String(stats.otsMes)}
          sub={`${stats.otsAbiertas} abiertas`}
          delta={stats.otsMes}
          deltaPrev={stats.otsMesAnt}
        />
        <KpiCard
          label="Utilidad bruta"
          value={fmt(stats.utilidad)}
          sub="ventas − gastos"
          accent={stats.utilidad >= 0 ? 'text-blue-700' : 'text-red-600'}
        />
      </div>

      {/* Ventas por sucursal */}
      {stats.branchSales.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700">Ventas del mes por sucursal</h3>
          </div>
          <div className="grid divide-x divide-gray-100" style={{ gridTemplateColumns: `repeat(${stats.branchSales.length}, 1fr)` }}>
            {stats.branchSales.map((b, i) => (
              <div key={i} className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1 truncate">{b.nombre}</p>
                <p className="text-xl font-extrabold text-gray-900">{fmt(b.total)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{b.count} venta{b.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tablas recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Últimas ventas */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700">Últimas ventas</h3>
            <Link to="/ventas" className="text-xs text-blue-600 hover:underline font-medium">Ver todas</Link>
          </div>
          {stats.ultimasVentas.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-8 text-center">No hay ventas aún</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50">
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400">Folio</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Cliente</th>
                  <th className="text-right px-5 py-2 text-xs font-semibold text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.ultimasVentas.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-xs text-blue-600 font-semibold">{v.numero}</td>
                    <td className="px-4 py-2.5 text-gray-700 truncate max-w-[120px]">{v.cliente}</td>
                    <td className="px-5 py-2.5 text-right font-bold text-gray-900">{fmt(v.total_iva)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Últimos gastos */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700">Últimos gastos</h3>
            <Link to="/contabilidad" className="text-xs text-blue-600 hover:underline font-medium">Ver todos</Link>
          </div>
          {stats.ultimosGastos.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-8 text-center">No hay gastos aún</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50">
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400">Descripción</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Categoría</th>
                  <th className="text-right px-5 py-2 text-xs font-semibold text-gray-400">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.ultimosGastos.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5 text-gray-800 truncate max-w-[140px]">{g.descripcion || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded-full">{g.categoria || '—'}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right font-bold text-gray-900">{fmt(+g.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
