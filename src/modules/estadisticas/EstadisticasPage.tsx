import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { useVentas, useGastos, useOrdenes, useBodegas, useMetodosPago } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

const MESES_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const COLORES = ['#2563eb','#0f172a','#10b981','#f59e0b','#f97316','#8b5cf6']

function last6months() {
  const arr = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    arr.push({ key: d.toISOString().slice(0, 7), label: MESES_LABELS[d.getMonth()] })
  }
  return arr
}

function TooltipMoney({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  )
}

export function EstadisticasPage() {
  const { data: ventas, isLoading: loadV } = useVentas()
  const { data: gastos, isLoading: loadG } = useGastos()
  const { data: ordenes, isLoading: loadO } = useOrdenes()
  const { data: bodegas } = useBodegas()
  const { data: metodos } = useMetodosPago()

  const meses = useMemo(() => last6months(), [])

  const { ventasData, gastosData, otsData, metodoData } = useMemo(() => {
    // Ventas por mes (total + por sucursal si hay bodegas)
    const hasBodegas = (bodegas ?? []).length > 0
    const ventasData = meses.map(m => {
      const mv = (ventas ?? []).filter(v => v.estado !== 'anulada' && v.fecha?.startsWith(m.key))
      const row: Record<string, string | number> = { mes: m.label, Total: mv.reduce((s, v) => s + (+v.total_iva || 0), 0) }
      if (hasBodegas) {
        ;(bodegas ?? []).forEach(b => {
          const nombre = b.nombre ?? b.name ?? 'Suc'
          row[nombre] = mv.filter(v => v.branchId === b.id).reduce((s, v) => s + (+v.total_iva || 0), 0)
        })
        delete row.Total
      }
      return row
    })

    // Gastos por mes
    const gastosData = meses.map(m => ({
      mes: m.label,
      Gastos: (gastos ?? []).filter(g => g.fecha?.startsWith(m.key)).reduce((s, g) => s + (+g.monto || 0), 0),
    }))

    // OTs completadas + ingresas por mes
    const otsData = meses.map(m => ({
      mes: m.label,
      Entregadas: (ordenes ?? []).filter(o => o.status === 'Entregado' && o.fecha?.startsWith(m.key)).length,
      Ingresadas: (ordenes ?? []).filter(o => o.fecha?.startsWith(m.key)).length,
    }))

    // Métodos de pago del mes actual
    const mesActual = new Date().toISOString().slice(0, 7)
    const mpMap: Record<string, string> = {}
    ;(metodos ?? []).forEach(m => { mpMap[m.id] = m.label })
    const mpTotals: Record<string, number> = {}
    ;(ventas ?? []).filter(v => v.estado !== 'anulada' && v.fecha?.startsWith(mesActual)).forEach(v => {
      const label = mpMap[v.metodo_pago] ?? v.metodo_pago ?? '—'
      mpTotals[label] = (mpTotals[label] ?? 0) + (+v.total_iva || 0)
    })
    const metodoData = Object.entries(mpTotals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

    return { ventasData, gastosData, otsData, metodoData }
  }, [ventas, gastos, ordenes, bodegas, metodos, meses])

  if (loadV || loadG || loadO) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  const bodegaKeys = (bodegas ?? []).map(b => b.nombre ?? b.name ?? 'Suc')
  const hasBodegas = bodegaKeys.length > 0

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Estadísticas</h2>

      {/* Ventas últimos 6 meses */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">
          Ventas últimos 6 meses {hasBodegas ? '(por sucursal)' : ''}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ventasData} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => '$' + (v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)}
              tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={55} />
            <Tooltip content={<TooltipMoney />} />
            {hasBodegas
              ? bodegaKeys.map((k, i) => <Bar key={k} dataKey={k} fill={COLORES[i] ?? '#64748b'} radius={[4, 4, 0, 0]} maxBarSize={40} />)
              : <Bar dataKey="Total" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={48} />
            }
            {hasBodegas && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gastos por mes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Gastos últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={gastosData} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)}
                tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={45} />
              <Tooltip content={<TooltipMoney />} />
              <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* OTs por mes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Órdenes de taller</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={otsData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Ingresadas" stroke="#94a3b8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Entregadas" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Métodos de pago del mes */}
      {metodoData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Métodos de pago (mes actual)</h3>
          <div className="space-y-3">
            {metodoData.map((m, i) => {
              const total = metodoData.reduce((s, x) => s + x.value, 0)
              const pct = total > 0 ? Math.round((m.value / total) * 100) : 0
              return (
                <div key={m.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{m.name}</span>
                    <span className="text-gray-900 font-bold">{fmt(m.value)} <span className="text-gray-400 font-normal text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: COLORES[i] ?? '#94a3b8' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
