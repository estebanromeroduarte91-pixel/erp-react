import { useMemo, useState } from 'react'
import { useVentas, useGastos, useOrdenes, useBodegas, useOCs } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import { useIsMobile } from '@/lib/useIsMobile'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const COLORES = ['#2563eb', '#0f172a', '#10b981', '#f59e0b', '#f97316', '#8b5cf6']

type Tab = '7d' | '30d' | 'mes' | 'año' | 'custom'

function today() { return new Date().toISOString().slice(0, 10) }

function getRange(tab: Tab, from: string, to: string): { from: string; to: string } {
  const t = today()
  if (tab === 'custom' && from && to) return { from, to }
  if (tab === '7d') {
    const d = new Date(t); d.setDate(d.getDate() - 6)
    return { from: d.toISOString().slice(0, 10), to: t }
  }
  if (tab === '30d') {
    const d = new Date(t); d.setDate(d.getDate() - 29)
    return { from: d.toISOString().slice(0, 10), to: t }
  }
  if (tab === 'año') return { from: t.slice(0, 4) + '-01-01', to: t }
  return { from: t.slice(0, 7) + '-01', to: t }
}

function getLast6(): { key: string; lbl: string; isCur: boolean }[] {
  const cur = today().slice(0, 7)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i))
    const key = d.toISOString().slice(0, 7)
    return { key, lbl: MESES[d.getMonth()], isCur: key === cur }
  })
}

// Mini bar chart (vertical, CSS)
function MiniBarChart({ bars, color }: { bars: { h: number; lbl: string; cur: boolean; tip: string }[]; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 72 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }} title={b.tip}>
          <div style={{ width: '100%', background: color, opacity: b.cur ? 1 : 0.45, height: Math.max(b.h, 2), borderRadius: '3px 3px 0 0', minHeight: 2 }} />
          <span style={{ fontSize: 9, color: b.cur ? color : '#9ca3af', fontWeight: b.cur ? 800 : 600, whiteSpace: 'nowrap' }}>{b.lbl}</span>
        </div>
      ))}
    </div>
  )
}

// Horizontal progress bar item
function HBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: '#374151', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color, background: color + '22', padding: '1px 5px', borderRadius: 99 }}>{pct}%</span>
          <span style={{ fontWeight: 700, color: '#111827' }}>{fmt(value)}</span>
        </div>
      </div>
      <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: color, width: `${pct}%`, borderRadius: 99 }} />
      </div>
    </div>
  )
}

// Collapsible desglose section
function Desglose({ entries, total, color, label }: { entries: [string, number][]; total: number; color: string; label: string }) {
  const [open, setOpen] = useState(false)
  if (!entries.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '6px 8px', background: color + '11', border: `1px solid ${color}44`, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color }}
      >
        <span>{open ? 'Ocultar desglose' : `Ver desglose por ${label}`}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Por {label}</div>
          {entries.slice(0, 5).map(([name, val]) => (
            <HBar key={name} label={name} value={val} total={total} color={color} />
          ))}
        </div>
      )}
    </div>
  )
}

const CARD: React.CSSProperties = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 18px' }
const CT: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2, marginTop: 0 }
const CS: React.CSSProperties = { fontSize: 11, color: '#9ca3af', marginBottom: 12, marginTop: 0 }

export function EstadisticasPage() {
  const { data: ventas, isLoading: loadV } = useVentas()
  const { data: gastos, isLoading: loadG } = useGastos()
  const { data: ordenes, isLoading: loadO } = useOrdenes()
  const { data: ocs, isLoading: loadOC } = useOCs()
  const { data: bodegas = [] } = useBodegas()

  const [tab, setTab] = useState<Tab>('mes')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const last6 = useMemo(() => getLast6(), [])
  const range = useMemo(() => getRange(tab, from, to), [tab, from, to])

  const inRange = (f?: string) => !!f && f >= range.from && f <= range.to

  const stats = useMemo(() => {
    const ventasArr = (ventas ?? []).filter(v => v.estado !== 'anulada' && inRange(v.fecha))
    const gastosArr = (gastos ?? []).filter(g => inRange(g.fecha))
    const ocsArr = (ocs ?? []).filter(o => ['recibida', 'confirmada'].includes(o.estado) && inRange(o.fecha))
    const ordeArr = (ordenes ?? []).filter(o => o.status === 'Entregado' && inRange(o.fecha))

    const totalVentas = ventasArr.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const totalGastos = gastosArr.reduce((s, g) => s + (+g.monto || 0), 0)
    const totalCompras = ocsArr.reduce((s, o) => s + (+o.total || 0), 0)
    const utilidad = totalVentas - totalGastos - totalCompras
    const ordenesOk = ordeArr.length
    const ticketProm = ordenesOk ? Math.round(ordeArr.reduce((s, o) => s + (o.presup != null ? +o.presup : 0), 0) / ordenesOk) : 0

    // Ventas por sucursal
    const maxBSales = Math.max(...bodegas.map(b => ventasArr.filter(v => v.branchId === b.id).reduce((s, v) => s + (+v.total_iva || 0), 0)), 1)
    const bSales = bodegas
      .map(b => ({
        nombre: b.nombre ?? b.name ?? '—',
        total: ventasArr.filter(v => v.branchId === b.id).reduce((s, v) => s + (+v.total_iva || 0), 0),
      }))
      .filter(b => b.total > 0)
      .sort((a, b) => b.total - a.total)

    // Utilidad por sucursal
    const bUtil = bodegas
      .map(b => ({
        nombre: b.nombre ?? b.name ?? '—',
        util: ventasArr.filter(v => v.branchId === b.id).reduce((s, v) => s + (+v.total_iva || 0), 0)
          - gastosArr.filter((g: any) => g.branchId === b.id).reduce((s, g) => s + (+g.monto || 0), 0)
          - ocsArr.filter((o: any) => o.branchId === b.id).reduce((s, o) => s + (+o.total || 0), 0),
      }))
      .filter(b => b.util !== 0)
      .sort((a, b) => b.util - a.util)

    // Top productos
    const prodMap: Record<string, { nombre: string; qty: number; revenue: number }> = {}
    ventasArr.forEach(v => (v.items ?? []).forEach(it => {
      const k = it.producto_nombre || '—'
      if (!prodMap[k]) prodMap[k] = { nombre: k, qty: 0, revenue: 0 }
      prodMap[k].qty += (+it.cantidad || 1)
      prodMap[k].revenue += (+it.subtotal || 0)
    }))
    const topProds = Object.values(prodMap).sort((a, b) => b.qty - a.qty).slice(0, 5)
    const maxQty = Math.max(...topProds.map(p => p.qty), 1)

    // Gastos por categoría
    const catMap: Record<string, number> = {}
    gastosArr.forEach(g => { catMap[g.categoria || 'Sin categoría'] = (catMap[g.categoria || 'Sin categoría'] || 0) + (+g.monto || 0) })
    const catSorted = Object.entries(catMap).sort((a, b) => b[1] - a[1])

    // Compras por proveedor
    const provMap: Record<string, number> = {}
    ocsArr.forEach(o => { provMap[o.proveedor_nombre || 'Sin proveedor'] = (provMap[o.proveedor_nombre || 'Sin proveedor'] || 0) + (+o.total || 0) })
    const provSorted = Object.entries(provMap).sort((a, b) => b[1] - a[1])

    // Últimos 6 meses (totales globales, no filtrados por rango)
    const gastosAll = gastos ?? []
    const ocsAll = ocs ?? []
    const ordeAll = ordenes ?? []
    const meses6 = last6.map(m => ({
      ...m,
      gastos: gastosAll.filter(g => g.fecha?.startsWith(m.key)).reduce((s, g) => s + (+g.monto || 0), 0),
      compras: (ocsAll).filter(o => ['recibida', 'confirmada'].includes(o.estado) && o.fecha?.startsWith(m.key)).reduce((s, o) => s + (+o.total || 0), 0),
      ordenes: ordeAll.filter(o => o.status === 'Entregado' && o.fecha?.startsWith(m.key)).length,
    }))
    const maxMG = Math.max(...meses6.map(m => m.gastos), 1)
    const maxMC = Math.max(...meses6.map(m => m.compras), 1)
    const maxMO = Math.max(...meses6.map(m => m.ordenes), 1)

    return {
      totalVentas, totalGastos, totalCompras, utilidad, ordenesOk, ticketProm,
      bSales, maxBSales, bUtil, topProds, maxQty, catSorted, provSorted,
      meses6, maxMG, maxMC, maxMO,
      cntVentas: ventasArr.length,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas, gastos, ordenes, ocs, bodegas, range, last6])

  const isMobile = useIsMobile()

  if (loadV || loadG || loadO || loadOC) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  const TABS: { id: Tab; label: string }[] = [
    { id: '7d', label: '7 días' },
    { id: '30d', label: '30 días' },
    { id: 'mes', label: 'Este mes' },
    { id: 'año', label: 'Este año' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...(isMobile ? { padding: '0 0 8px' } : {}) }}>

      {/* Header + range selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', ...(isMobile ? { background: '#fff', padding: '16px 16px 12px', borderBottom: '0.5px solid #e5e7eb' } : {}) }}>
        <h2 style={{ fontSize: isMobile ? 22 : 18, fontWeight: 800, color: '#111827', margin: 0, marginRight: 'auto' }}>Estadísticas</h2>
        <div style={{ display: 'flex', gap: 3, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setFrom(''); setTo('') }}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                background: tab === t.id ? '#fff' : 'transparent',
                color: tab === t.id ? '#1a1d23' : '#6b7280',
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              }}
            >{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, padding: '5px 9px' }}>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); if (e.target.value && to) setTab('custom') }}
              style={{ border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#374151', outline: 'none', cursor: 'pointer', width: 115 }} />
          </label>
          <span style={{ fontSize: 11, color: '#d1d5db', fontWeight: 600 }}>→</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, padding: '5px 9px' }}>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); if (from && e.target.value) setTab('custom') }}
              style={{ border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#374151', outline: 'none', cursor: 'pointer', width: 115 }} />
          </label>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 12 }}>
        <div style={CARD}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, marginTop: 0 }}>Ventas totales</p>
          <p style={{ fontSize: 26, fontWeight: 800, color: '#111827', lineHeight: 1.1, margin: 0 }}>{fmt(stats.totalVentas)}</p>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 3, marginBottom: 0 }}>{stats.cntVentas} venta{stats.cntVentas !== 1 ? 's' : ''} en el período</p>
        </div>
        <div style={CARD}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, marginTop: 0 }}>Utilidad neta</p>
          <p style={{ fontSize: 26, fontWeight: 800, color: stats.utilidad >= 0 ? '#10b981' : '#ef4444', lineHeight: 1.1, margin: 0 }}>{fmt(stats.utilidad)}</p>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 3, marginBottom: 0 }}>Ventas − Gastos − Compras</p>
        </div>
        <div style={CARD}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, marginTop: 0 }}>Órdenes completadas</p>
          <p style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b', lineHeight: 1.1, margin: 0 }}>{stats.ordenesOk}</p>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 3, marginBottom: 0 }}>Reparaciones entregadas</p>
        </div>
      </div>

      {/* Row 2: ventas por suc / utilidad por suc / top productos */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>

        {/* Ventas por sucursal */}
        <div style={CARD}>
          <p style={CT}>Ventas por sucursal</p>
          <p style={CS}>Por ingresos en el período</p>
          {stats.bSales.length ? stats.bSales.map((b, i) => (
            <HBar key={i} label={b.nombre} value={b.total} total={stats.totalVentas} color={COLORES[i] ?? '#64748b'} />
          )) : <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin ventas en el período</p>}
        </div>

        {/* Utilidad por sucursal */}
        <div style={CARD}>
          <p style={CT}>Utilidad por sucursal</p>
          <p style={CS}>Ventas − Gastos − Compras asignados</p>
          {stats.bUtil.length ? stats.bUtil.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#374151', fontWeight: 600 }}>{b.nombre}</span>
              <span style={{ fontWeight: 700, color: b.util >= 0 ? '#10b981' : '#ef4444' }}>{fmt(b.util)}</span>
            </div>
          )) : <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin datos de sucursales</p>}
        </div>

        {/* Top productos */}
        <div style={CARD}>
          <p style={CT}>Productos más vendidos</p>
          <p style={CS}>Por unidades vendidas</p>
          {stats.topProds.length ? stats.topProds.map((p, i) => (
            <div key={i} title={`${fmt(p.revenue)} en ventas`} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: i < stats.topProds.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#fef9c3' : '#ecefff', color: i === 0 ? '#b45309' : '#3656e6', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
              <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>{p.qty} uds.</span>
              <div style={{ width: 36, height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', background: '#3656e6', width: `${Math.round(p.qty / stats.maxQty * 100)}%`, borderRadius: 99 }} />
              </div>
            </div>
          )) : <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin ventas en el período</p>}
        </div>
      </div>

      {/* Row 3: gastos / compras / órdenes — últimos 6 meses */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>

        {/* Gastos por mes */}
        <div style={CARD}>
          <p style={CT}>Gastos por mes</p>
          <p style={CS}>Últimos 6 meses</p>
          <MiniBarChart
            color="#ef4444"
            bars={stats.meses6.map(m => ({ h: Math.max(2, Math.round(m.gastos / stats.maxMG * 72)), lbl: m.lbl, cur: m.isCur, tip: fmt(m.gastos) }))}
          />
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
            {stats.meses6.slice().reverse().slice(0, 3).map(m => (
              <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ color: m.isCur ? '#111827' : '#6b7280', fontWeight: m.isCur ? 700 : 400 }}>
                  {m.lbl}{m.isCur && <span style={{ fontSize: 9, color: '#3656e6', marginLeft: 4 }}>(actual)</span>}
                </span>
                <strong style={{ color: '#111827' }}>{fmt(m.gastos)}</strong>
              </div>
            ))}
          </div>
          <Desglose entries={stats.catSorted} total={stats.totalGastos} color="#ef4444" label="categoría" />
        </div>

        {/* Compras por mes */}
        <div style={CARD}>
          <p style={CT}>Compras por mes</p>
          <p style={CS}>Órdenes de compra recibidas</p>
          <MiniBarChart
            color="#2563eb"
            bars={stats.meses6.map(m => ({ h: Math.max(2, Math.round(m.compras / stats.maxMC * 72)), lbl: m.lbl, cur: m.isCur, tip: fmt(m.compras) }))}
          />
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
            {stats.meses6.slice().reverse().slice(0, 3).map(m => (
              <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ color: m.isCur ? '#111827' : '#6b7280', fontWeight: m.isCur ? 700 : 400 }}>
                  {m.lbl}{m.isCur && <span style={{ fontSize: 9, color: '#3656e6', marginLeft: 4 }}>(actual)</span>}
                </span>
                <strong style={{ color: '#111827' }}>{fmt(m.compras)}</strong>
              </div>
            ))}
          </div>
          <Desglose entries={stats.provSorted} total={stats.totalCompras} color="#2563eb" label="proveedor" />
        </div>

        {/* Órdenes completadas por mes */}
        <div style={CARD}>
          <p style={CT}>Órdenes completadas</p>
          <p style={CS}>Reparaciones entregadas por mes</p>
          <MiniBarChart
            color="#f59e0b"
            bars={stats.meses6.map(m => ({ h: Math.max(2, Math.round(m.ordenes / stats.maxMO * 72)), lbl: m.lbl, cur: m.isCur, tip: `${m.ordenes} órd.` }))}
          />
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
            {stats.meses6.slice().reverse().slice(0, 3).map(m => (
              <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ color: m.isCur ? '#111827' : '#6b7280', fontWeight: m.isCur ? 700 : 400 }}>
                  {m.lbl}{m.isCur && <span style={{ fontSize: 9, color: '#3656e6', marginLeft: 4 }}>(actual)</span>}
                </span>
                <strong style={{ color: '#111827' }}>{m.ordenes} órd.</strong>
              </div>
            ))}
          </div>
          {stats.ticketProm > 0 && (
            <div style={{ marginTop: 8, padding: 8, background: '#fffbeb', borderRadius: 7, border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', marginBottom: 2 }}>TICKET PROMEDIO</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#92400e' }}>{fmt(stats.ticketProm)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
