import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVentas, useGastos, useOrdenes, useBodegas, useMetodosPago, useOCs } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import { useIsMobile } from '@/lib/useIsMobile'

type Rango = 'hoy' | 'mes' | 'año' | 'rango'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const SUC_COLORS = ['#378ADD', '#1D9E75', '#7F77DD', '#D85A30', '#BA7517', '#64748b']
const MP_COLORS  = ['#378ADD', '#7F77DD', '#1D9E75', '#D85A30', '#BA7517', '#64748b']

// ── Date helpers (local time, not UTC) ────────────────────────
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function hoyStr()  { return localDateStr() }
function mesStr()  { return localDateStr().slice(0, 7) }
function añoStr()  { return String(new Date().getFullYear()) }

function periodoDesdeHasta(rango: Rango, customDesde: string, customHasta: string) {
  if (rango === 'hoy') return { desde: hoyStr(), hasta: hoyStr() }
  if (rango === 'mes') return { desde: `${mesStr()}-01`, hasta: hoyStr() }
  if (rango === 'año') return { desde: `${añoStr()}-01-01`, hasta: hoyStr() }
  return { desde: customDesde || hoyStr(), hasta: customHasta || hoyStr() }
}

function prevPeriod(rango: Rango, desde: string, hasta: string) {
  if (rango === 'hoy') {
    const d = new Date(hoyStr()); d.setDate(d.getDate() - 1)
    const s = d.toISOString().slice(0, 10)
    return { desde: s, hasta: s }
  }
  if (rango === 'mes') {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
    const m = d.toISOString().slice(0, 7)
    return { desde: `${m}-01`, hasta: `${m}-31` }
  }
  if (rango === 'año') {
    const y = String(parseInt(añoStr()) - 1)
    return { desde: `${y}-01-01`, hasta: `${y}-12-31` }
  }
  const diff = new Date(hasta).getTime() - new Date(desde).getTime()
  const pHasta = new Date(new Date(desde).getTime() - 86400000).toISOString().slice(0, 10)
  const pDesde = new Date(new Date(desde).getTime() - diff - 86400000).toISOString().slice(0, 10)
  return { desde: pDesde, hasta: pHasta }
}

function inPeriod(fecha: string | undefined, desde: string, hasta: string) {
  if (!fecha) return false
  return fecha >= desde && fecha <= hasta
}

function labelRango(rango: Rango) {
  if (rango === 'hoy') return 'Hoy'
  if (rango === 'mes') {
    const s = new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  if (rango === 'año') return añoStr()
  return 'Rango'
}

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return null
  const pct = Math.round(Math.abs((curr - prev) / prev) * 100)
  const up = curr >= prev
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: up ? '#15803d' : '#dc2626' }}>
      {up ? '↑' : '↓'} {pct}%
    </span>
  )
}

// ── Colores del sistema (igual que el resto de la app) ────────
const C = {
  bg: '#f2f2f7',
  card: '#fff',
  border: '#e5e7eb',
  borderLight: '#f2f2f7',
  textPrimary: '#1c1c1e',
  textSecondary: '#3c3c43',
  textMuted: '#8e8e93',
  green: '#15803d',
  red: '#dc2626',
  greenBg: '#dcfce7',
  redBg: '#fee2e2',
}

export function DashboardPage() {
  const { data: ventas,  isLoading: loadV } = useVentas()
  const { data: gastos,  isLoading: loadG } = useGastos()
  const { data: ocs,     isLoading: loadOC } = useOCs()
  const { isLoading: loadO } = useOrdenes()
  const { data: bodegasRaw = [] } = useBodegas()
  const bodegas = useMemo(() => [...bodegasRaw].sort((a, b) => (b.nombre ?? b.name ?? '').localeCompare(a.nombre ?? a.name ?? '', 'es')), [bodegasRaw])
  const { data: metodos  = [] } = useMetodosPago()

  const [rango, setRango]             = useState<Rango>('hoy')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')
  const [tabMp, setTabMp]             = useState(0)
  const [expandedMp, setExpandedMp]   = useState<string | null>(null)
  const [sucDetalle, setSucDetalle]   = useState<{ id: string; nombre: string } | null>(null)

  const isMobile = useIsMobile()

  const { desde, hasta } = periodoDesdeHasta(rango, customDesde, customHasta)
  const { desde: pDesde, hasta: pHasta } = prevPeriod(rango, desde, hasta)

  // Ventas de la sucursal seleccionada (para el detalle al tocar una tarjeta)
  const ventasSuc = useMemo(() => {
    if (!sucDetalle) return []
    return (ventas ?? [])
      .filter(v => v.estado !== 'anulada' && v.branchId === sucDetalle.id && inPeriod(v.fecha, desde, hasta))
      .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  }, [ventas, sucDetalle, desde, hasta])

  const mpById = useMemo(() => {
    const m: Record<string, string> = {}
    metodos.forEach(mp => { m[mp.id] = mp.label })
    return m
  }, [metodos])
  const getMpLabel = (id: string) => mpById[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '—')

  const drillVentas = useMemo(() => {
    if (!expandedMp) return []
    const vArr = (ventas ?? []).filter(v => v.estado !== 'anulada' && inPeriod(v.fecha, desde, hasta))
    const bId = bodegas[tabMp]?.id
    const byBranch = bodegas.length > 0 && bId ? vArr.filter(v => v.branchId === bId) : vArr
    return byBranch
      .filter(v => (v.metodo_pago || 'otro') === expandedMp)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [ventas, desde, hasta, tabMp, expandedMp, bodegas])

  const stats = useMemo(() => {
    const vArr  = (ventas  ?? []).filter(v => v.estado !== 'anulada')
    const gArr  = gastos  ?? []
    const ocArr = ocs     ?? []

    const vPer  = vArr.filter(v => inPeriod(v.fecha, desde, hasta))
    const vPrev = vArr.filter(v => inPeriod(v.fecha, pDesde, pHasta))
    const gPer  = gArr.filter(g => inPeriod(g.fecha, desde, hasta))
    const ocPer = ocArr.filter(o => ['recibida', 'confirmada'].includes(o.estado) && inPeriod(o.fecha, desde, hasta))

    const ventasBrutas     = vPer.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const ventasBrutasPrev = vPrev.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const ventasNetas      = vPer.reduce((s, v) => s + (+v.total || 0), 0)
    const totalOC          = ocPer.reduce((s, o) => s + (+o.total || 0), 0)
    const totalGastos      = gPer.reduce((s, g) => s + (+g.monto || 0), 0)
    const totalSalida      = totalOC + totalGastos
    const utilidad         = ventasBrutas - totalSalida
    const margen           = ventasBrutas > 0 ? Math.round(utilidad / ventasBrutas * 100) : 0
    const txCount          = vPer.length
    const ticketProm       = txCount > 0 ? Math.round(ventasBrutas / txCount) : 0

    const totalGeneral = ventasBrutas || 1
    const sucursales = bodegas.map((b, i) => {
      const bVPer  = vPer.filter(v => v.branchId === b.id)
      const bVPrev = vPrev.filter(v => v.branchId === b.id)
      return {
        id: b.id,
        nombre: b.nombre ?? b.name ?? 'Sucursal',
        total:  bVPer.reduce((s, v) => s + (+v.total_iva || 0), 0),
        totalPrev: bVPrev.reduce((s, v) => s + (+v.total_iva || 0), 0),
        neto:   bVPer.reduce((s, v) => s + (+v.total || 0), 0),
        count:  bVPer.length,
        part:   Math.round(bVPer.reduce((s, v) => s + (+v.total_iva || 0), 0) / totalGeneral * 100),
        color:  SUC_COLORS[i] ?? '#64748b',
      }
    })

    const mpPorSuc = bodegas.map(b => {
      const bV = vPer.filter(v => v.branchId === b.id)
      const totales: Record<string, number> = {}
      const totalSuc = bV.reduce((s, v) => s + (+v.total_iva || 0), 0)
      bV.forEach(v => { const mp = v.metodo_pago || 'otro'; totales[mp] = (totales[mp] ?? 0) + (+v.total_iva || 0) })
      return { totalSuc, sorted: Object.entries(totales).sort((a, b) => b[1] - a[1]) }
    })

    const mpGlobal: Record<string, number> = {}
    vPer.forEach(v => { const mp = v.metodo_pago || 'otro'; mpGlobal[mp] = (mpGlobal[mp] ?? 0) + (+v.total_iva || 0) })
    const mpGlobalSorted = Object.entries(mpGlobal).sort((a, b) => b[1] - a[1])

    const ultimasVentas = [...vArr].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')).slice(0, 5)

    return { ventasBrutas, ventasBrutasPrev, ventasNetas, totalOC, totalGastos, totalSalida, utilidad, margen, txCount, ticketProm, sucursales, mpPorSuc, mpGlobalSorted, ultimasVentas }
  }, [ventas, gastos, ocs, bodegas, desde, hasta, pDesde, pHasta])

  if (loadV || loadG || loadO || loadOC) {
    return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
  }

  const tienesSucs = bodegas.length > 0
  const sucActiva  = stats.sucursales[tabMp] ?? null
  const mpActivos  = tienesSucs
    ? (stats.mpPorSuc[tabMp] ?? { totalSuc: 0, sorted: [] })
    : { totalSuc: stats.ventasBrutas, sorted: stats.mpGlobalSorted }

  // ── Shared components ──────────────────────────────────────

  const RangoSelector = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {(['hoy', 'mes', 'año', 'rango'] as Rango[]).map(r => (
        <button key={r} onClick={() => setRango(r)} style={{
          padding: '7px 0', fontSize: 13, fontWeight: 500, textAlign: 'center',
          borderRadius: 20, border: `0.5px solid ${rango === r ? '#3656e6' : C.border}`,
          cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit',
          background: rango === r ? '#3656e6' : C.card,
          color: rango === r ? '#fff' : C.textSecondary,
          WebkitAppearance: 'none', appearance: 'none',
        }}>
          {r === 'hoy' ? 'Hoy' : r === 'mes' ? 'Mes' : r === 'año' ? 'Año' : 'Rango'}
        </button>
      ))}
    </div>
  )

  const DateField = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        onClick={e => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
        style={{
          width: '100%', fontSize: 16, padding: '8px 10px',
          border: `0.5px solid ${C.border}`, borderRadius: 10,
          background: C.card, fontFamily: 'inherit', outline: 'none',
          WebkitAppearance: 'none', appearance: 'none',
          color: value ? C.textPrimary : 'transparent',
          boxSizing: 'border-box',
        }}
      />
      {!value && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          padding: '0 10px', pointerEvents: 'none', gap: 4,
        }}>
          <span style={{ fontSize: 13, color: C.textMuted, flex: 1 }}>{label}</span>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="2.5" width="13" height="11.5" rx="2" stroke={C.textMuted} strokeWidth="1.1"/>
            <path d="M1 6h13M5 1v3M10 1v3" stroke={C.textMuted} strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        </div>
      )}
    </div>
  )

  const RangoCustom = () => rango === 'rango' ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <DateField value={customDesde} onChange={setCustomDesde} label="Desde" />
      <span style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>—</span>
      <DateField value={customHasta} onChange={setCustomHasta} label="Hasta" />
    </div>
  ) : null

  const SectionLabel = ({ text }: { text: string }) => (
    <p style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 8px' }}>{text}</p>
  )

  const KpiGrid = ({ cols }: { cols: number }) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 8 }}>
      {[
        { label: 'Ventas brutas', value: fmt(stats.ventasBrutas), sub: `${stats.txCount} transacciones`, curr: stats.ventasBrutas, prev: stats.ventasBrutasPrev },
        { label: 'Ventas netas', value: fmt(stats.ventasNetas), sub: 'sin IVA' },
        { label: 'Utilidad estimada', value: fmt(stats.utilidad), sub: `margen ${stats.margen}%`, green: stats.utilidad >= 0 },
        { label: 'Transacciones', value: String(stats.txCount), sub: stats.ticketProm > 0 ? `${fmt(stats.ticketProm)} prom.` : '—' },
      ].map(k => (
        <div key={k.label} style={{ background: C.card, borderRadius: 12, padding: '12px 14px', border: `0.5px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.4px', margin: '0 0 4px' }}>{k.label}</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: k.green ? C.green : C.textPrimary, margin: 0, lineHeight: 1 }}>{k.value}</p>
          <div style={{ marginTop: 4 }}>
            {k.curr !== undefined && k.prev !== undefined && k.prev > 0
              ? <DeltaBadge curr={k.curr} prev={k.prev} />
              : <span style={{ fontSize: 11, color: C.textMuted }}>{k.sub}</span>
            }
          </div>
        </div>
      ))}
    </div>
  )

  const SucursalCards = ({ stack = false }: { stack?: boolean }) => (
    <div>
      <SectionLabel text="Ventas por sucursal" />
      <div style={{ display: 'grid', gridTemplateColumns: stack ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {stats.sucursales.length === 0 && (
          <p style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Sin ventas en este período</p>
        )}
        {stats.sucursales.map(s => (
          <div key={s.id} onClick={() => setSucDetalle({ id: s.id, nombre: s.nombre })} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}>
            <div style={{ height: 3, background: s.color }} />
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary }}>{s.nombre}</span>
                <DeltaBadge curr={s.total} prev={s.totalPrev} />
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, color: C.textPrimary, margin: '0 0 10px' }}>{fmt(s.total)}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderTop: `0.5px solid ${C.border}`, paddingTop: 10 }}>
                {[{ label: 'Neto', value: fmt(s.neto) }, { label: 'Ventas', value: String(s.count) }, { label: 'Participación', value: `${s.part}%` }].map(d => (
                  <div key={d.label}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.3px' }}>{d.label}</p>
                    <p style={{ fontSize: 12, color: C.textSecondary, margin: 0 }}>{d.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const MetodosPagoCard = () => (
    <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 0' }}>
        <SectionLabel text="Métodos de pago" />
        {tienesSucs && bodegas.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bodegas.length}, 1fr)`, borderBottom: `0.5px solid ${C.border}` }}>
            {bodegas.map((b, i) => (
              <button key={b.id} onClick={() => { setTabMp(i); setExpandedMp(null) }} style={{
                padding: '8px 4px', fontSize: 12,
                fontWeight: tabMp === i ? 700 : 400,
                color: tabMp === i ? C.textPrimary : C.textMuted,
                background: tabMp === i ? C.bg : 'transparent',
                border: 'none',
                borderRight: i < bodegas.length - 1 ? `0.5px solid ${C.border}` : 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {b.nombre ?? b.name ?? 'Sucursal'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 14px' }}>
        {mpActivos.sorted.length === 0 ? (
          <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: '16px 0', margin: 0 }}>Sin ventas</p>
        ) : (
          <>
            {mpActivos.sorted.map(([id, total], i) => {
              const pct = mpActivos.totalSuc > 0 ? Math.round(total / mpActivos.totalSuc * 100) : 0
              const isOpen = expandedMp === id
              return (
                <div key={id}>
                  <button
                    onClick={() => setExpandedMp(isOpen ? null : id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '9px 0', background: 'transparent', border: 'none',
                      borderBottom: (!isOpen && i < mpActivos.sorted.length - 1) ? `0.5px solid ${C.border}` : 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: MP_COLORS[i] ?? '#64748b', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: isOpen ? '#2563eb' : C.textSecondary, flex: 1, textAlign: 'left', fontWeight: isOpen ? 600 : 400 }}>{getMpLabel(id)}</span>
                    <span style={{ fontSize: 11, color: C.textMuted, marginRight: 4 }}>{pct}%</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginRight: 6 }}>{fmt(total)}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      <path d="M2 4l4 4 4-4" stroke={isOpen ? '#2563eb' : C.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {isOpen && (
                    <div style={{ background: C.bg, borderRadius: 8, margin: '4px 0 8px', padding: '0 10px', border: `0.5px solid ${C.border}` }}>
                      <div style={{ padding: '8px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `0.5px solid ${C.border}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.4px' }}>{drillVentas.length} ventas</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.4px' }}>{fmt(total)} total</span>
                      </div>
                      {drillVentas.length === 0
                        ? <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: '12px 0', margin: 0 }}>Sin ventas</p>
                        : drillVentas.map((v, vi) => (
                          <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: vi < drillVentas.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', margin: 0 }}>{v.numero}</p>
                              <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>{v.cliente || '—'}</p>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{fmt(+v.total_iva)}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              )
            })}
            {tienesSucs && sucActiva && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>Total {sucActiva.nombre}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{fmt(mpActivos.totalSuc)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  const GastosCard = () => (
    <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <SectionLabel text="Total gastado" />
      {[
        { label: 'Órdenes de compra', value: stats.totalOC, to: '/compras' },
        { label: 'Gastos operacionales', value: stats.totalGastos, to: '/contabilidad' },
      ].map((row, i, arr) => (
        <Link key={row.label} to={row.to} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? `0.5px solid ${C.border}` : 'none', textDecoration: 'none' }}>
          <span style={{ fontSize: 13, color: '#2563eb' }}>{row.label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{fmt(row.value)}</span>
        </Link>
      ))}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, color: C.textSecondary }}>Total salida</span>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.red }}>{fmt(stats.totalSalida)}</span>
      </div>
      <div style={{ marginTop: 8, padding: '8px 10px', background: stats.utilidad >= 0 ? C.greenBg : C.redBg, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.textSecondary }}>Resultado neto</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: stats.utilidad >= 0 ? C.green : C.red }}>
          {stats.utilidad >= 0 ? '+' : ''}{fmt(stats.utilidad)}
        </span>
      </div>
    </div>
  )

  // ── Mobile ────────────────────────────────────────────────────
  const totalSuc = ventasSuc.reduce((s, v) => s + (+v.total_iva || 0), 0)
  const sucModal = sucDetalle ? (
    <div onClick={() => setSucDetalle(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: 480, maxHeight: isMobile ? '85vh' : '80vh', borderRadius: isMobile ? '18px 18px 0 0' : 18, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '0.5px solid #eee' }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{sucDetalle.nombre}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>{ventasSuc.length} venta{ventasSuc.length !== 1 ? 's' : ''}</p>
          </div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#059669' }}>{fmt(totalSuc)}</p>
          <button onClick={() => setSucDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {ventasSuc.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '28px 0', margin: 0 }}>Sin ventas en este período</p>
          ) : ventasSuc.map((v, i) => {
            const prods = (v.items ?? []).map(it => it.producto_nombre).filter(Boolean).join(', ') || '—'
            const doc = (v.tipo_doc ?? 'boleta')
            return (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderBottom: i < ventasSuc.length - 1 ? '0.5px solid #f0f0f0' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.cliente || 'Sin cliente'}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prods} · <span style={{ color: '#9ca3af', textTransform: 'capitalize' }}>{doc} {v.numero}</span></p>
                </div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>{fmt(+v.total_iva || 0)}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  ) : null

  if (isMobile) {
    return (
      <div style={{ background: C.bg, minHeight: '100dvh', padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sucModal}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.textPrimary, margin: 0 }}>Dashboard</h1>
          <span style={{ fontSize: 12, color: C.textMuted }}>{labelRango(rango)}</span>
        </div>

        <RangoSelector />
        {rango === 'rango' && <RangoCustom />}

        <KpiGrid cols={2} />

        {tienesSucs && (
          <div>
            <SectionLabel text="Ventas por sucursal" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.sucursales.map(s => (
                <div key={s.id} onClick={() => setSucDetalle({ id: s.id, nombre: s.nombre })} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}>
                  <div style={{ height: 3, background: s.color }} />
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary }}>{s.nombre}</span>
                      <DeltaBadge curr={s.total} prev={s.totalPrev} />
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 700, color: C.textPrimary, margin: '0 0 10px' }}>{fmt(s.total)}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderTop: `0.5px solid ${C.border}`, paddingTop: 10 }}>
                      {[{ label: 'Neto', value: fmt(s.neto) }, { label: 'Ventas', value: String(s.count) }, { label: 'Participación', value: `${s.part}%` }].map(d => (
                        <div key={d.label}>
                          <p style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.3px' }}>{d.label}</p>
                          <p style={{ fontSize: 12, color: C.textSecondary, margin: 0 }}>{d.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <MetodosPagoCard />
        <GastosCard />

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SectionLabel text="Últimas ventas" />
            <Link to="/ventas" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Ver todas</Link>
          </div>
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {stats.ultimasVentas.length === 0
              ? <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: '20px 0', margin: 0 }}>Sin ventas</p>
              : stats.ultimasVentas.map((v, i) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < stats.ultimasVentas.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, margin: 0 }}>{v.numero}</p>
                    <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>{v.cliente || '—'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, margin: 0 }}>{fmt(+v.total_iva)}</p>
                    <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>{getMpLabel(v.metodo_pago)}</p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    )
  }

  // ── Desktop ───────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sucModal}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary, margin: 0 }}>Dashboard</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 300 }}><RangoSelector /></div>
        </div>
      </div>

      {rango === 'rango' && <div style={{ maxWidth: 420 }}><RangoCustom /></div>}

      <KpiGrid cols={4} />

      {tienesSucs
        ? <SucursalCards />
        : <div style={{ background: C.card, borderRadius: 12, border: `0.5px solid ${C.border}`, padding: '20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            Configura bodegas en Inventario para ver ventas por sucursal.
          </div>
      }

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <MetodosPagoCard />
        <GastosCard />
      </div>

      <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}>Últimas ventas</span>
          <Link to="/ventas" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Ver todas</Link>
        </div>
        {stats.ultimasVentas.length === 0
          ? <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: '24px 0', margin: 0 }}>Sin ventas aún</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['Folio', 'Cliente', 'Fecha', 'Método', 'Total'].map((h, i) => (
                    <th key={i} style={{ padding: '7px 14px', fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.4px', textAlign: i >= 4 ? 'right' : 'left', borderBottom: `0.5px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.ultimasVentas.map((v, i) => (
                  <tr key={v.id} style={{ borderBottom: i < stats.ultimasVentas.length - 1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                    <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 600, color: '#2563eb' }}>{v.numero}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, color: C.textPrimary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.cliente || '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: C.textMuted }}>{v.fecha}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: C.textSecondary }}>{getMpLabel(v.metodo_pago)}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: C.textPrimary, textAlign: 'right' }}>{fmt(+v.total_iva)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  )
}
