import { useMemo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVentas, useGastos, useOrdenes, useBodegas, useMetodosPago, useOCs } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import { useIsMobile } from '@/lib/useIsMobile'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const BRANCH_COLORS = ['#2563eb', '#0f172a', '#64748b', '#94a3b8', '#cbd5e1']
const MP_COLORS = ['#2563eb', '#0f172a', '#10b981', '#f59e0b', '#f97316', '#8b5cf6']

function getLast6Months() {
  const result = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    result.push({ key: d.toISOString().slice(0, 7), label: MESES[d.getMonth()] })
  }
  return result
}

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
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 700,
      padding: '2px 6px', borderRadius: 20, marginTop: 5,
      background: good ? '#dcfce7' : '#fee2e2',
      color: good ? '#15803d' : '#dc2626',
    }}>
      {up ? '↑' : '↓'} {pct}% vs mes ant.
    </span>
  )
}

function NeutralBadge({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20, marginTop: 5, background: '#f1f5f9', color: '#64748b' }}>
      {label}
    </span>
  )
}

function KpiCard({ label, value, accent, badge, inverted, curr, prev }: {
  label: string; value: string; accent: string; badge?: string
  inverted?: boolean; curr?: number; prev?: number
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf2', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: accent, borderRadius: '12px 12px 0 0' }} />
      <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6, marginTop: 6 }}>{label}</p>
      <p style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</p>
      {curr !== undefined && prev !== undefined
        ? <DeltaBadge curr={curr} prev={prev} inverted={inverted} />
        : badge ? <NeutralBadge label={badge} /> : null}
    </div>
  )
}

// Simple CSS horizontal bar chart for 6 months
function HBarChart({ data, labels, color, currentIdx = 5 }: { data: number[]; labels: string[]; color: string; currentIdx?: number }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {data.map((v, i) => {
        const w = Math.max(Math.round(v / max * 100), v > 0 ? 3 : 0)
        const isCurr = i === currentIdx
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, fontWeight: isCurr ? 800 : 600, color: isCurr ? color : '#94a3b8', width: 26, textAlign: 'right', flexShrink: 0 }}>{labels[i]}</span>
            <div style={{ flex: 1, height: 17, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${w}%`, height: '100%', background: isCurr ? color : color + 'aa', borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 7, minWidth: v > 0 ? 2 : 0 }}>
                {v > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmt(v)}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Multi-series vertical bar chart (ventas por sucursal)
function VBarChart({ datasets, labels }: { datasets: { data: number[]; color: string }[]; labels: string[] }) {
  const allVals = datasets.flatMap(d => d.data)
  const max = Math.max(...allVals, 1)
  const H = 80
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: H }}>
        {labels.map((_, mi) => (
          <div key={mi} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
            {datasets.map((ds, di) => {
              const h = Math.max(Math.round(ds.data[mi] / max * H), ds.data[mi] > 0 ? 2 : 0)
              return <div key={di} style={{ flex: 1, height: h, background: ds.color, borderRadius: '2px 2px 0 0', opacity: mi === labels.length - 1 ? 1 : 0.7 }} />
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 4 }}>
        {labels.map((l, i) => <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{l}</span>)}
      </div>
    </div>
  )
}

// UF/USD indicator
function useIndicadores() {
  const [uf, setUf] = useState('…')
  const [usd, setUsd] = useState('…')
  useEffect(() => {
    fetch('https://mindicador.cl/api')
      .then(r => r.json())
      .then(j => {
        setUf('$' + (+j.uf?.valor || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
        setUsd('$' + (+j.dolar?.valor || 0).toLocaleString('es-CL'))
      })
      .catch(() => { setUf('—'); setUsd('—') })
  }, [])
  return { uf, usd }
}

export function DashboardPage() {
  const { data: ventas, isLoading: loadV } = useVentas()
  const { data: gastos, isLoading: loadG } = useGastos()
  const { data: ordenes, isLoading: loadO } = useOrdenes()
  const { data: ocs, isLoading: loadOC } = useOCs()
  const { data: bodegas = [] } = useBodegas()
  const { data: metodos = [] } = useMetodosPago()
  const { uf, usd } = useIndicadores()

  const mes = mesActual()
  const mesAnt = mesPrev()
  const ultimos6 = useMemo(() => getLast6Months(), [])

  const mpLabelById = useMemo(() => {
    const m: Record<string, string> = {}
    metodos.forEach(mp => { m[mp.id] = mp.label })
    return m
  }, [metodos])

  const getMpLabel = (id: string) => mpLabelById[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '—')

  const stats = useMemo(() => {
    const ventasArr = ventas ?? []
    const gastosArr = gastos ?? []
    const ocsArr = ocs ?? []
    const ordeArr = ordenes ?? []

    const ventasMes = ventasArr.filter(v => v.estado !== 'anulada' && v.fecha?.startsWith(mes))
    const ventasMesAnt = ventasArr.filter(v => v.estado !== 'anulada' && v.fecha?.startsWith(mesAnt))
    const gastosMes = gastosArr.filter(g => g.fecha?.startsWith(mes))
    const gastosMesAnt = gastosArr.filter(g => g.fecha?.startsWith(mesAnt))
    const ocsMes = ocsArr.filter(o => o.fecha?.startsWith(mes))
    const ocsMesAnt = ocsArr.filter(o => o.fecha?.startsWith(mesAnt))
    const otsMes = ordeArr.filter(o => o.status === 'Entregado' && o.fecha?.startsWith(mes))
    const otsMesAnt = ordeArr.filter(o => o.status === 'Entregado' && o.fecha?.startsWith(mesAnt))
    const otsAbiertas = ordeArr.filter(o => !['Entregado', 'No reparable'].includes(o.status))

    const totalVentasMes = ventasMes.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const totalVentasMesAnt = ventasMesAnt.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const totalGastosMes = gastosMes.reduce((s, g) => s + (+g.monto || 0), 0)
    const totalGastosMesAnt = gastosMesAnt.reduce((s, g) => s + (+g.monto || 0), 0)
    const totalOcsMes = ocsMes.reduce((s, o) => s + (+o.total || 0), 0)
    const totalOcsMesAnt = ocsMesAnt.reduce((s, o) => s + (+o.total || 0), 0)
    const utilidad = totalVentasMes - totalOcsMes - totalGastosMes
    const margen = totalVentasMes > 0 ? Math.round(utilidad / totalVentasMes * 100) : 0

    const ultimasVentas = [...ventasArr].filter(v => v.estado !== 'anulada').slice(-5).reverse()
    const ultimosGastos = [...gastosArr].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')).slice(0, 5)

    // Ventas por sucursal del mes
    const branchStats = bodegas.map((b, i) => {
      const bvMes = ventasMes.filter(v => v.branchId === b.id)
      const bOTcomp = otsMes.filter(o => (o as any).branchId === b.id)
      const bOTopen = otsAbiertas.filter(o => (o as any).branchId === b.id).length
      const bTicket = bOTcomp.length ? Math.round(bOTcomp.reduce((s, o) => s + (o.presup != null ? +o.presup : 0), 0) / bOTcomp.length) : 0
      return {
        nombre: b.nombre ?? b.name ?? 'Sin nombre',
        total: bvMes.reduce((s, v) => s + (+v.total_iva || 0), 0),
        count: bvMes.length,
        otComp: bOTcomp.length,
        otOpen: bOTopen,
        ticket: bTicket,
        color: BRANCH_COLORS[i] ?? '#94a3b8',
      }
    })

    // 6 meses - ventas por sucursal (for chart)
    const branchDatasets = bodegas.map((b, i) => ({
      color: BRANCH_COLORS[i] ?? '#94a3b8',
      data: ultimos6.map(m => ventasArr.filter(v => v.estado !== 'anulada' && v.fecha?.startsWith(m.key) && v.branchId === b.id).reduce((s, v) => s + (+v.total_iva || 0), 0)),
    }))

    // 6 meses - gastos
    const gastosXmes = ultimos6.map(m => gastosArr.filter(g => g.fecha?.startsWith(m.key)).reduce((s, g) => s + (+g.monto || 0), 0))
    const gastosPromedio = gastosXmes.length ? Math.round(gastosXmes.reduce((s, x) => s + x, 0) / gastosXmes.length) : 0

    // 6 meses - compras OC
    const comprasXmes = ultimos6.map(m => ocsArr.filter(o => o.fecha?.startsWith(m.key)).reduce((s, o) => s + (+o.total || 0), 0))
    const comprasPromedio = comprasXmes.length ? Math.round(comprasXmes.reduce((s, x) => s + x, 0) / comprasXmes.length) : 0

    // OTs por sucursal (últimos 6 meses chart + mes actual)
    const otsDatasets = bodegas.map((b, i) => ({
      nombre: b.nombre ?? b.name ?? 'Sucursal',
      color: BRANCH_COLORS[i] ?? '#94a3b8',
      data: ultimos6.map(m => ordeArr.filter(o => o.status === 'Entregado' && (o as any).branchId === b.id && o.fecha?.startsWith(m.key)).length),
    }))

    // Métodos de pago
    const metTotals: Record<string, number> = {}
    ventasMes.forEach(v => {
      const m = v.metodo_pago || 'Sin especificar'
      metTotals[m] = (metTotals[m] ?? 0) + (+v.total_iva || 0)
    })
    const metSorted = Object.entries(metTotals).sort((a, b) => b[1] - a[1])
    const metMax = metSorted[0]?.[1] ?? 1

    const totalOTMes = otsMes.length
    const totalOTMesAnt = otsMesAnt.length
    const totalOTticket = otsMes.length ? Math.round(otsMes.reduce((s, o) => s + (o.presup != null ? +o.presup : 0), 0) / otsMes.length) : 0

    return {
      totalVentasMes, totalVentasMesAnt,
      totalGastosMes, totalGastosMesAnt,
      totalOcsMes, totalOcsMesAnt,
      utilidad, margen,
      totalOTMes, totalOTMesAnt, totalOTticket,
      otsAbiertas: otsAbiertas.length,
      ventasCount: ventasMes.length,
      ultimasVentas, ultimosGastos,
      branchStats, branchDatasets,
      gastosXmes, gastosPromedio,
      comprasXmes, comprasPromedio,
      otsDatasets,
      metSorted, metMax,
    }
  }, [ventas, gastos, ocs, ordenes, bodegas, mes, mesAnt, ultimos6])

  const isMobile = useIsMobile()

  if (loadV || loadG || loadO || loadOC) {
    return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
  }

  if (isMobile) {
    const maxBranch = Math.max(...stats.branchStats.map(b => b.total), 1)
    return (
      <div style={{ background: '#f2f2f7', minHeight: '100dvh' }}>
        {/* Header */}
        <div style={{ background: '#fff', padding: '16px 16px 12px', borderBottom: '0.5px solid #e5e7eb' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1c1c1e', margin: '0 0 8px' }}>Dashboard</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: '#f2f2f7', borderRadius: 8, padding: '6px 10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#8e8e93', fontWeight: 600 }}>UF</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1c1e' }}>{uf}</span>
            </div>
            <div style={{ flex: 1, background: '#f2f2f7', borderRadius: 8, padding: '6px 10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#8e8e93', fontWeight: 600 }}>USD</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1c1e' }}>{usd}</span>
            </div>
          </div>
        </div>

        {/* KPI scroll horizontal */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { label: 'Ventas', value: fmt(stats.totalVentasMes), curr: stats.totalVentasMes, prev: stats.totalVentasMesAnt, accent: '#007AFF' },
            { label: 'Utilidad', value: fmt(stats.utilidad), curr: stats.utilidad, prev: stats.totalVentasMesAnt - stats.totalOcsMesAnt - stats.totalGastosMesAnt, accent: '#10b981' },
            { label: 'Gastos', value: fmt(stats.totalGastosMes), curr: stats.totalGastosMes, prev: stats.totalGastosMesAnt, accent: '#ef4444', inverted: true },
            { label: 'Compras', value: fmt(stats.totalOcsMes), curr: stats.totalOcsMes, prev: stats.totalOcsMesAnt, accent: '#f59e0b', inverted: true },
            { label: 'OTs listas', value: String(stats.totalOTMes), curr: stats.totalOTMes, prev: stats.totalOTMesAnt, accent: '#8b5cf6' },
          ].map(k => {
            const pct = k.prev ? Math.round(Math.abs((k.curr - k.prev) / k.prev) * 100) : 0
            const up = k.curr >= (k.prev || 0)
            const good = k.inverted ? !up : up
            return (
              <div key={k.label} style={{ minWidth: 120, background: '#fff', borderRadius: 14, padding: '12px 14px', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.accent }} />
                <p style={{ fontSize: 10, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '.4px', margin: '6px 0 4px' }}>{k.label}</p>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#1c1c1e', margin: 0, lineHeight: 1 }}>{k.value}</p>
                {k.prev ? (
                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, marginTop: 5, padding: '2px 6px', borderRadius: 20, background: good ? '#dcfce7' : '#fee2e2', color: good ? '#15803d' : '#dc2626' }}>
                    {up ? '↑' : '↓'} {pct}%
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Por sucursal */}
        {stats.branchStats.length > 0 && (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '.5px', padding: '0 16px', marginBottom: 8 }}>Por sucursal</p>
            <div style={{ background: '#fff', borderRadius: 14, margin: '0 16px 12px', overflow: 'hidden' }}>
              {stats.branchStats.map((b, i) => (
                <div key={i} style={{ padding: '10px 14px', borderBottom: i < stats.branchStats.length - 1 ? '0.5px solid #f2f2f7' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e' }}>{b.nombre}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1c1e' }}>{fmt(b.total)}</span>
                  </div>
                  <div style={{ height: 5, background: '#f2f2f7', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: b.color, width: `${Math.round(b.total / maxBranch * 100)}%`, borderRadius: 99 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
                    <span style={{ fontSize: 11, color: '#8e8e93' }}>OTs completadas: <strong style={{ color: '#1c1c1e' }}>{b.otComp}</strong></span>
                    <span style={{ fontSize: 11, color: '#8e8e93' }}>Abiertas: <strong style={{ color: '#1c1c1e' }}>{b.otOpen}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Últimas ventas */}
        <p style={{ fontSize: 13, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '.5px', padding: '0 16px', marginBottom: 8 }}>Últimas ventas</p>
        <div style={{ background: '#fff', borderRadius: 14, margin: '0 16px 12px', overflow: 'hidden' }}>
          {stats.ultimasVentas.slice(0, 5).map((v, i) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: i < 4 ? '0.5px solid #f2f2f7' : 'none', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e' }}>{v.numero}</div>
                <div style={{ fontSize: 11, color: '#8e8e93' }}>{v.cliente}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1c1c1e' }}>{fmt(+v.total_iva)}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#007AFF', background: '#dbeafe', padding: '2px 6px', borderRadius: 99 }}>{getMpLabel(v.metodo_pago)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Últimos gastos */}
        <p style={{ fontSize: 13, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '.5px', padding: '0 16px', marginBottom: 8 }}>Últimos gastos</p>
        <div style={{ background: '#fff', borderRadius: 14, margin: '0 16px 20px', overflow: 'hidden' }}>
          {stats.ultimosGastos.slice(0, 5).map((g, i) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: i < 4 ? '0.5px solid #f2f2f7' : 'none', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e' }}>{g.descripcion}</div>
                <div style={{ fontSize: 11, color: '#8e8e93' }}>{g.categoria} · {g.fecha}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{fmt(+g.monto)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const labels6 = ultimos6.map(m => m.label)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>

      {/* Header + indicadores */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Dashboard</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
            UF <strong style={{ color: '#0f172a', marginLeft: 4 }}>{uf}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
            USD <strong style={{ color: '#0f172a', marginLeft: 4 }}>{usd}</strong>
          </div>
        </div>
      </div>

      {/* 5 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <KpiCard label="Ventas totales" value={fmt(stats.totalVentasMes)} accent="#3b82f6"
          curr={stats.totalVentasMes} prev={stats.totalVentasMesAnt}
          badge={`${stats.ventasCount} transacciones`} />
        <KpiCard label="Utilidad bruta" value={fmt(stats.utilidad)} accent="#10b981"
          badge={`Margen ${stats.margen}%`} />
        <KpiCard label="Gastos del mes" value={fmt(stats.totalGastosMes)} accent="#f97316"
          curr={stats.totalGastosMes} prev={stats.totalGastosMesAnt} inverted />
        <KpiCard label="Compras del mes" value={fmt(stats.totalOcsMes)} accent="#8b5cf6"
          curr={stats.totalOcsMes} prev={stats.totalOcsMesAnt} inverted />
        <KpiCard label="OTs completadas" value={String(stats.totalOTMes)} accent="#0f172a"
          curr={stats.totalOTMes} prev={stats.totalOTMesAnt}
          badge={`${stats.otsAbiertas} abiertas`} />
      </div>

      {/* Ventas por sucursal (gráfico 6m) + Métodos de pago */}
      {bodegas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12 }}>
          {/* Ventas por sucursal */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf2', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: 0 }}>Ventas por sucursal</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Últimos 6 meses</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {bodegas.map((b, i) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: BRANCH_COLORS[i] ?? '#94a3b8' }} />
                    {b.nombre ?? b.name}
                  </div>
                ))}
              </div>
            </div>
            <VBarChart datasets={stats.branchDatasets} labels={labels6} />
            {/* Tabla sucursales */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
              <thead>
                <tr>
                  {['Sucursal', 'Ventas', 'OTs compl.', 'OTs abiertas', 'Ticket prom.'].map((h, i) => (
                    <th key={i} style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', padding: '0 8px 6px', textAlign: i === 0 ? 'left' : 'right', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.branchStats.map((b, i) => (
                  <tr key={i}>
                    <td style={{ padding: '7px 8px', fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, display: 'inline-block', flexShrink: 0 }} />
                      {b.nombre}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#374151', borderTop: '1px solid #f8fafc' }}>{fmt(b.total)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#374151', borderTop: '1px solid #f8fafc' }}>{b.otComp}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#f97316', borderTop: '1px solid #f8fafc' }}>{b.otOpen}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#374151', borderTop: '1px solid #f8fafc' }}>{b.ticket > 0 ? fmt(b.ticket) : '—'}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '7px 8px', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Total</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{fmt(stats.totalVentasMes)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{stats.totalOTMes}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#f97316' }}>{stats.otsAbiertas}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{stats.totalOTticket > 0 ? fmt(stats.totalOTticket) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Métodos de pago */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf2', padding: '16px 18px' }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: '0 0 2px' }}>Métodos de pago</p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 14px' }}>
              {new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
            </p>
            {stats.metSorted.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.metSorted.map(([id, total], i) => {
                  const pct = stats.totalVentasMes > 0 ? Math.round(total / stats.totalVentasMes * 100) : 0
                  const color = MP_COLORS[i] ?? '#94a3b8'
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getMpLabel(id)}</span>
                      <div style={{ width: 60, height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: `${Math.round(total / stats.metMax * 100)}%`, height: '100%', background: color, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', width: 70, textAlign: 'right', flexShrink: 0 }}>{fmt(total)}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8', width: 26, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '30px 0' }}>Sin ventas este mes</p>
            )}
          </div>
        </div>
      )}

      {/* OTs + Gastos + Compras por mes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {/* OTs por sucursal */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf2', padding: '16px 18px' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: '0 0 2px' }}>Órdenes completadas</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 10px' }}>Últimos 6 meses · por sucursal</p>
          {bodegas.length > 0 ? (
            <>
              <VBarChart datasets={stats.otsDatasets.map(d => ({ data: d.data, color: d.color }))} labels={labels6} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {stats.otsDatasets.map((b, i) => {
                  const bOTcomp = (ordenes ?? []).filter(o => o.status === 'Entregado' && (o as any).branchId === bodegas[i]?.id && o.fecha?.startsWith(mes))
                  const bOTopen = (ordenes ?? []).filter(o => !['Entregado', 'No reparable'].includes(o.status) && (o as any).branchId === bodegas[i]?.id).length
                  const bTicket = bOTcomp.length ? Math.round(bOTcomp.reduce((s, o) => s + (o.presup != null ? +o.presup : 0), 0) / bOTcomp.length) : 0
                  return (
                    <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: '9px 12px', border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12, color: '#374151', marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, display: 'inline-block' }} />
                        {b.nombre}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center' }}>
                        <div><div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{bOTcomp.length}</div><div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Completadas</div></div>
                        <div><div style={{ fontSize: 15, fontWeight: 800, color: '#f97316' }}>{bOTopen}</div><div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>En proceso</div></div>
                        <div><div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{bTicket > 0 ? fmt(bTicket) : '—'}</div><div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Ticket prom.</div></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <VBarChart datasets={[{ data: ultimos6.map(m => (ordenes ?? []).filter(o => o.status === 'Entregado' && o.fecha?.startsWith(m.key)).length), color: '#0f172a' }]} labels={labels6} />
          )}
        </div>

        {/* Gastos por mes */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf2', padding: '16px 18px' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: '0 0 2px' }}>Gastos por mes</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 10px' }}>Últimos 6 meses</p>
          <HBarChart data={stats.gastosXmes} labels={labels6} color="#ef4444" />
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Promedio mensual</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f97316' }}>{fmt(stats.gastosPromedio)}</span>
          </div>
        </div>

        {/* Compras por mes */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf2', padding: '16px 18px' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: '0 0 2px' }}>Compras por mes</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 10px' }}>Últimos 6 meses · OCs</p>
          <HBarChart data={stats.comprasXmes} labels={labels6} color="#8b5cf6" />
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Promedio mensual</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#8b5cf6' }}>{fmt(stats.comprasPromedio)}</span>
          </div>
        </div>
      </div>

      {/* Últimas ventas + últimos gastos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Últimas ventas */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf2', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Últimas ventas</h3>
            <Link to="/ventas" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Ver todas</Link>
          </div>
          {stats.ultimasVentas.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '32px 0' }}>No hay ventas aún</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Folio', 'Cliente', 'Total', 'Pago'].map((h, i) => (
                    <th key={i} style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.ultimasVentas.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: '#2563eb', fontWeight: 700 }}>{v.numero}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: '#374151', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.cliente || '—'}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{fmt(v.total_iva)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, color: '#64748b' }}>{getMpLabel(v.metodo_pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Últimos gastos */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf2', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Últimos gastos</h3>
            <Link to="/contabilidad" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Ver todos</Link>
          </div>
          {stats.ultimosGastos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '32px 0' }}>No hay gastos aún</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Descripción', 'Categoría', 'Monto'].map((h, i) => (
                    <th key={i} style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: i === 2 ? 'right' : 'left', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.ultimosGastos.map(g => (
                  <tr key={g.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: '#374151', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.descripcion || '—'}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{g.categoria || '—'}</span>
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{fmt(+g.monto)}</td>
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
