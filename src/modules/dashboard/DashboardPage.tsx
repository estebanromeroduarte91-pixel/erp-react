import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVentas, useGastos, useOrdenes, useBodegas, useMetodosPago, useOCs } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import { useIsMobile } from '@/lib/useIsMobile'

type Rango = 'hoy' | 'mes' | 'año' | 'rango'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const SUC_COLORS = ['#378ADD', '#1D9E75', '#7F77DD', '#D85A30', '#BA7517', '#888780']
const MP_COLORS  = ['#378ADD', '#7F77DD', '#1D9E75', '#D85A30', '#BA7517', '#888780']

function hoy()   { return new Date().toISOString().slice(0, 10) }
function mesAct() { return new Date().toISOString().slice(0, 7) }
function añoAct() { return new Date().toISOString().slice(0, 4) }

function prevPeriod(rango: Rango, desde: string, hasta: string) {
  if (rango === 'hoy') {
    const d = new Date(hoy()); d.setDate(d.getDate() - 1)
    const s = d.toISOString().slice(0, 10)
    return { desde: s, hasta: s }
  }
  if (rango === 'mes') {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
    const m = d.toISOString().slice(0, 7)
    return { desde: `${m}-01`, hasta: `${m}-31` }
  }
  if (rango === 'año') {
    const y = String(parseInt(añoAct()) - 1)
    return { desde: `${y}-01-01`, hasta: `${y}-12-31` }
  }
  const diff = new Date(hasta).getTime() - new Date(desde).getTime()
  const pHasta = new Date(new Date(desde).getTime() - 86400000).toISOString().slice(0, 10)
  const pDesde = new Date(new Date(desde).getTime() - diff - 86400000).toISOString().slice(0, 10)
  return { desde: pDesde, hasta: pHasta }
}

function periodoDesdeHasta(rango: Rango, customDesde: string, customHasta: string) {
  if (rango === 'hoy') return { desde: hoy(), hasta: hoy() }
  if (rango === 'mes') return { desde: `${mesAct()}-01`, hasta: hoy() }
  if (rango === 'año') return { desde: `${añoAct()}-01-01`, hasta: hoy() }
  return { desde: customDesde || hoy(), hasta: customHasta || hoy() }
}

function inPeriod(fecha: string | undefined, desde: string, hasta: string) {
  if (!fecha) return false
  return fecha >= desde && fecha <= hasta
}

function delta(curr: number, prev: number) {
  if (!prev) return null
  const pct = Math.round(Math.abs((curr - prev) / prev) * 100)
  return { pct, up: curr >= prev }
}

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  const d = delta(curr, prev)
  if (!d) return null
  return (
    <span style={{ fontSize: 12, fontWeight: 500, color: d.up ? '#3B6D11' : '#A32D2D' }}>
      {d.up ? '↑' : '↓'} {d.pct}%
    </span>
  )
}

function labelRango(rango: Rango, desde: string, hasta: string) {
  if (rango === 'hoy') return 'Hoy'
  if (rango === 'mes') {
    const m = new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    return m.charAt(0).toUpperCase() + m.slice(1)
  }
  if (rango === 'año') return añoAct()
  return `${desde} — ${hasta}`
}

export function DashboardPage() {
  const { data: ventas,  isLoading: loadV } = useVentas()
  const { data: gastos,  isLoading: loadG } = useGastos()
  const { data: ocs,     isLoading: loadOC } = useOCs()
  const { data: ordenes, isLoading: loadO } = useOrdenes()
  const { data: bodegas  = [] } = useBodegas()
  const { data: metodos  = [] } = useMetodosPago()

  const [rango, setRango]           = useState<Rango>('mes')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')
  const [tabMp, setTabMp]           = useState(0)

  const isMobile = useIsMobile()

  const { desde, hasta } = periodoDesdeHasta(rango, customDesde, customHasta)
  const { desde: pDesde, hasta: pHasta } = prevPeriod(rango, desde, hasta)

  const mpById = useMemo(() => {
    const m: Record<string, string> = {}
    metodos.forEach(mp => { m[mp.id] = mp.label })
    return m
  }, [metodos])

  const getMpLabel = (id: string) =>
    mpById[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '—')

  const stats = useMemo(() => {
    const vArr  = (ventas  ?? []).filter(v => v.estado !== 'anulada')
    const gArr  = gastos  ?? []
    const ocArr = ocs     ?? []

    const vPer  = vArr.filter(v => inPeriod(v.fecha, desde, hasta))
    const vPrev = vArr.filter(v => inPeriod(v.fecha, pDesde, pHasta))
    const gPer  = gArr.filter(g => inPeriod(g.fecha, desde, hasta))
    const ocPer = ocArr.filter(o => ['recibida', 'confirmada'].includes(o.estado) && inPeriod(o.fecha, desde, hasta))
    const ocPrev= ocArr.filter(o => ['recibida', 'confirmada'].includes(o.estado) && inPeriod(o.fecha, pDesde, pHasta))

    const ventasBrutas  = vPer.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const ventasBrutasPrev = vPrev.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const ventasNetas   = vPer.reduce((s, v) => s + (+v.total || 0), 0)
    const totalOC       = ocPer.reduce((s, o) => s + (+o.total || 0), 0)
    const totalOCPrev   = ocPrev.reduce((s, o) => s + (+o.total || 0), 0)
    const totalGastos   = gPer.reduce((s, g) => s + (+g.monto || 0), 0)
    const totalSalida   = totalOC + totalGastos
    const utilidad      = ventasBrutas - totalSalida
    const margen        = ventasBrutas > 0 ? Math.round(utilidad / ventasBrutas * 100) : 0
    const txCount       = vPer.length
    const ticketProm    = txCount > 0 ? Math.round(ventasBrutas / txCount) : 0

    // Sucursales
    const totalGeneral  = ventasBrutas || 1
    const sucursales = bodegas.map((b, i) => {
      const bVPer  = vPer.filter(v => v.branchId === b.id)
      const bVPrev = vPrev.filter(v => v.branchId === b.id)
      const total  = bVPer.reduce((s, v) => s + (+v.total_iva || 0), 0)
      const totalP = bVPrev.reduce((s, v) => s + (+v.total_iva || 0), 0)
      const neto   = bVPer.reduce((s, v) => s + (+v.total || 0), 0)
      const count  = bVPer.length
      const part   = Math.round(total / totalGeneral * 100)
      return {
        id: b.id,
        nombre: b.nombre ?? b.name ?? 'Sucursal',
        total, totalPrev: totalP, neto, count, part,
        color: SUC_COLORS[i] ?? '#888780',
      }
    })

    // Métodos de pago por sucursal
    const mpPorSuc = bodegas.map(b => {
      const bV = vPer.filter(v => v.branchId === b.id)
      const totales: Record<string, number> = {}
      const totalSuc = bV.reduce((s, v) => s + (+v.total_iva || 0), 0)
      bV.forEach(v => {
        const mp = v.metodo_pago || 'otro'
        totales[mp] = (totales[mp] ?? 0) + (+v.total_iva || 0)
      })
      const sorted = Object.entries(totales).sort((a, b) => b[1] - a[1])
      return { totalSuc, sorted }
    })

    // Métodos de pago globales (cuando no hay bodegas)
    const mpGlobal: Record<string, number> = {}
    vPer.forEach(v => {
      const mp = v.metodo_pago || 'otro'
      mpGlobal[mp] = (mpGlobal[mp] ?? 0) + (+v.total_iva || 0)
    })
    const mpGlobalSorted = Object.entries(mpGlobal).sort((a, b) => b[1] - a[1])

    const ultimasVentas = [...vArr].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')).slice(0, 5)

    return {
      ventasBrutas, ventasBrutasPrev, ventasNetas,
      totalOC, totalOCPrev, totalGastos, totalSalida,
      utilidad, margen, txCount, ticketProm,
      sucursales, mpPorSuc, mpGlobalSorted,
      ultimasVentas,
    }
  }, [ventas, gastos, ocs, bodegas, desde, hasta, pDesde, pHasta])

  if (loadV || loadG || loadO || loadOC) {
    return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
  }

  const rangoLabel = labelRango(rango, desde, hasta)
  const tienesSucs = bodegas.length > 0
  const sucActiva = stats.sucursales[tabMp] ?? null
  const mpActivos = tienesSucs ? (stats.mpPorSuc[tabMp] ?? { totalSuc: 0, sorted: [] }) : { totalSuc: stats.ventasBrutas, sorted: stats.mpGlobalSorted }

  // ── Shared sections ──────────────────────────────────────────

  const RangoSelector = ({ mobile = false }: { mobile?: boolean }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: mobile ? 6 : 6 }}>
      {(['hoy', 'mes', 'año', 'rango'] as Rango[]).map(r => (
        <button key={r} onClick={() => setRango(r)} style={{
          padding: mobile ? '7px 0' : '5px 0',
          fontSize: 12, fontWeight: 500, textAlign: 'center',
          borderRadius: 20, border: '0.5px solid var(--border)',
          cursor: 'pointer', transition: 'all .15s',
          background: rango === r ? 'var(--text-primary)' : 'transparent',
          color: rango === r ? 'var(--surface-2)' : 'var(--text-secondary)',
        }}>
          {r.charAt(0).toUpperCase() + r.slice(1)}
        </button>
      ))}
    </div>
  )

  const RangoCustom = () => rango === 'rango' ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="date" value={customDesde} onChange={e => setCustomDesde(e.target.value)}
        style={{ flex: 1, fontSize: 13, padding: '5px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)', color: 'var(--text-primary)' }} />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
      <input type="date" value={customHasta} onChange={e => setCustomHasta(e.target.value)}
        style={{ flex: 1, fontSize: 13, padding: '5px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)', color: 'var(--text-primary)' }} />
    </div>
  ) : null

  const KpiGrid = ({ cols }: { cols: number }) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 8 }}>
      {[
        { label: 'Ventas brutas', value: fmt(stats.ventasBrutas), sub: `${stats.txCount} transacciones`, curr: stats.ventasBrutas, prev: stats.ventasBrutasPrev },
        { label: 'Ventas netas', value: fmt(stats.ventasNetas), sub: 'sin IVA', curr: null, prev: null },
        { label: 'Utilidad estimada', value: fmt(stats.utilidad), sub: `margen ${stats.margen}%`, green: true, curr: null, prev: null },
        { label: 'Transacciones', value: String(stats.txCount), sub: stats.ticketProm > 0 ? `${fmt(stats.ticketProm)} prom.` : '—', curr: null, prev: null },
      ].map(k => (
        <div key={k.label} style={{ background: 'var(--surface-1)', borderRadius: 10, padding: '12px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{k.label}</div>
          <div style={{ fontSize: cols === 4 ? 18 : 17, fontWeight: 500, color: k.green ? '#3B6D11' : 'var(--text-primary)', lineHeight: 1 }}>{k.value}</div>
          {k.curr !== null && k.prev !== null
            ? <div style={{ marginTop: 3 }}><DeltaBadge curr={k.curr} prev={k.prev} /></div>
            : <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{k.sub}</div>
          }
        </div>
      ))}
    </div>
  )

  const SucursalCards = ({ stack = false }: { stack?: boolean }) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        Ventas por sucursal
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: stack ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        {stats.sucursales.map(s => (
          <div key={s.id} style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ height: 3, background: s.color }} />
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{s.nombre}</span>
                <DeltaBadge curr={s.total} prev={s.totalPrev} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 10 }}>{fmt(s.total)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderTop: '0.5px solid var(--border)', paddingTop: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Neto</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmt(s.neto)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Ventas</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.count}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Participación</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.part}%</div>
                </div>
              </div>
            </div>
          </div>
        ))}
        {stats.sucursales.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Sin ventas en este período
          </div>
        )}
      </div>
    </div>
  )

  const MetodosPagoCard = () => (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12 }}>
      <div style={{ padding: '12px 14px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Métodos de pago
        </div>
        {tienesSucs && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bodegas.length}, 1fr)`, borderBottom: '0.5px solid var(--border)', marginBottom: 0 }}>
            {bodegas.map((b, i) => (
              <button key={b.id} onClick={() => setTabMp(i)} style={{
                padding: '8px 4px', fontSize: 12,
                fontWeight: tabMp === i ? 500 : 400,
                color: tabMp === i ? 'var(--text-primary)' : 'var(--text-muted)',
                background: tabMp === i ? 'var(--surface-1)' : 'transparent',
                border: 'none', borderRight: i < bodegas.length - 1 ? '0.5px solid var(--border)' : 'none',
                cursor: 'pointer',
              }}>
                {b.nombre ?? b.name ?? 'Sucursal'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        {mpActivos.sorted.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Sin ventas</div>
        ) : (
          <>
            {mpActivos.sorted.map(([id, total], i) => {
              const pct = mpActivos.totalSuc > 0 ? Math.round(total / mpActivos.totalSuc * 100) : 0
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < mpActivos.sorted.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: MP_COLORS[i] ?? '#888780', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{getMpLabel(id)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>{pct}%</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(total)}</span>
                </div>
              )
            })}
            {tienesSucs && sucActiva && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total {sucActiva.nombre}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(mpActivos.totalSuc)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  const GastosCard = () => (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Total gastado</div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rangoLabel}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Órdenes de compra</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(stats.totalOC)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Gastos operacionales</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(stats.totalGastos)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total salida</span>
        <span style={{ fontSize: 17, fontWeight: 500, color: '#A32D2D' }}>{fmt(stats.totalSalida)}</span>
      </div>
      <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface-1)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Resultado neto</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: stats.utilidad >= 0 ? '#3B6D11' : '#A32D2D' }}>
          {stats.utilidad >= 0 ? '+' : ''}{fmt(stats.utilidad)}
        </span>
      </div>
    </div>
  )

  // ── Mobile layout ─────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ background: 'var(--surface-0)', minHeight: '100dvh', padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 500, color: 'var(--text-primary)' }}>Dashboard</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rangoLabel}</span>
        </div>

        <RangoSelector mobile />
        {rango === 'rango' && <RangoCustom />}

        <KpiGrid cols={2} />

        {tienesSucs && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Ventas por sucursal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.sucursales.map(s => (
                <div key={s.id} style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ height: 3, background: s.color }} />
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{s.nombre}</span>
                      <DeltaBadge curr={s.total} prev={s.totalPrev} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 10 }}>{fmt(s.total)}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderTop: '0.5px solid var(--border)', paddingTop: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Neto</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmt(s.neto)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Ventas</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.count}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Participación</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.part}%</div>
                      </div>
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
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Últimas ventas</div>
            <Link to="/ventas" style={{ fontSize: 12, color: 'var(--text-accent)', textDecoration: 'none' }}>Ver todas</Link>
          </div>
          <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {stats.ultimasVentas.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Sin ventas</p>
            ) : stats.ultimasVentas.map((v, i) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < stats.ultimasVentas.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{v.numero}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v.cliente || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(+v.total_iva)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{getMpLabel(v.metodo_pago)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Desktop layout ────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>Dashboard</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 280 }}><RangoSelector /></div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{rangoLabel}</span>
        </div>
      </div>

      {rango === 'rango' && (
        <div style={{ maxWidth: 400 }}><RangoCustom /></div>
      )}

      <KpiGrid cols={4} />

      {tienesSucs ? (
        <SucursalCards />
      ) : (
        <div style={{ background: 'var(--surface-1)', borderRadius: 12, padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Configura bodegas/sucursales en Inventario para ver ventas por sucursal.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <MetodosPagoCard />
        <GastosCard />
      </div>

      <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Últimas ventas</span>
          <Link to="/ventas" style={{ fontSize: 12, color: 'var(--text-accent)', textDecoration: 'none' }}>Ver todas</Link>
        </div>
        {stats.ultimasVentas.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>Sin ventas aún</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-1)' }}>
                {['Folio', 'Cliente', 'Fecha', 'Método', 'Total'].map((h, i) => (
                  <th key={i} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', textAlign: i >= 4 ? 'right' : 'left', borderBottom: '0.5px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.ultimasVentas.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: i < stats.ultimasVentas.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 500, color: 'var(--text-accent)' }}>{v.numero}</td>
                  <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-primary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.cliente || '—'}</td>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{v.fecha}</td>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{getMpLabel(v.metodo_pago)}</td>
                  <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'right' }}>{fmt(+v.total_iva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
