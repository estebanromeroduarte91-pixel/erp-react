import { useMemo, useState, useRef } from 'react'
import { useVentasEnRango, useGastosEnRango, useOrdenesEntregadasEnRango, useBodegas, useOCsEnRango, useCostosProductos, useMetodosPago } from '@/lib/queries'
import { distribuirGastosPorSucursal } from '@/lib/gastos'
import { calcularCostoVentas, calcularResumenOperacional, fechaEfectivaOC, filtrarVentasPagadas, periodoAnteriorEquivalente, restarDias, MARGEN_OC_DIAS, type RangoComparacion } from '@/lib/metricas'
import { nombreMetodoPago } from '@/lib/metodoPago'
import { Spinner } from '@/components/shared/Spinner'
import { useIsMobile } from '@/lib/useIsMobile'
import { fechaLocal } from '@/lib/fecha'
import type { Gasto, OC } from '@/types'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const COLORES = ['#2563eb', '#0f172a', '#10b981', '#f59e0b', '#f97316', '#8b5cf6']

type Tab = 'hoy' | '7d' | '30d' | 'mes' | 'año' | 'custom'

const today = fechaLocal

function getRange(tab: Tab, from: string, to: string): { from: string; to: string } {
  const t = today()
  if (tab === 'custom' && from && to) return { from, to }
  if (tab === 'custom' && from) return { from, to: t }
  if (tab === 'custom' && to) return { from: to, to }
  // Se parte de `new Date()` (ahora, en hora local) y no de `new Date(t)`:
  // parsear 'YYYY-MM-DD' da medianoche UTC, que en Chile es el día anterior a
  // las 20:00 — restar días desde ahí corría el rango un día.
  if (tab === 'hoy') return { from: t, to: t }
  if (tab === '7d') {
    const d = new Date(); d.setDate(d.getDate() - 6)
    return { from: fechaLocal(d), to: t }
  }
  if (tab === '30d') {
    const d = new Date(); d.setDate(d.getDate() - 29)
    return { from: fechaLocal(d), to: t }
  }
  if (tab === 'año') return { from: t.slice(0, 4) + '-01-01', to: t }
  return { from: t.slice(0, 7) + '-01', to: t }
}

function getLast6(): { key: string; lbl: string; isCur: boolean }[] {
  const cur = today().slice(0, 7)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i))
    const key = fechaLocal(d).slice(0, 7)
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
function HBar({ label, value, total, color, onClick }: { label: string; value: number; total: number; color: string; onClick?: () => void }) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0
  return (
    <button type="button" onClick={onClick} disabled={!onClick} style={{ display: 'block', width: '100%', marginBottom: 8, padding: 0, border: 0, background: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: onClick ? 'pointer' : 'default' }}>
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
    </button>
  )
}

// Collapsible desglose section
function Desglose({ entries, total, color, label, nota, sub, onSelect }: {
  entries: [string, number][]
  total: number
  color: string
  label: string
  nota?: string
  /** Segundo nivel: por categoría, el detalle por subcategoría. */
  sub?: Record<string, [string, number][]>
  onSelect?: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
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
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>Por {label}</div>
          {nota && <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8 }}>{nota}</div>}
          {entries.map(([name, val]) => {
            const detalle = sub?.[name]
            const expandida = abierta === name
            return (
              <div key={name}>
                <HBar
                  label={detalle ? `${name} ${expandida ? '▾' : '▸'}` : name}
                  value={val} total={total} color={color}
                  // Con subcategorías, el clic abre el detalle acá mismo: es lo
                  // que se quiere ver (cuánto se llevó cada empleado, cada
                  // canal) y sacarlo a un modal obliga a perder el contexto de
                  // las demás categorías.
                  onClick={detalle
                    ? () => setAbierta(a => a === name ? null : name)
                    : (onSelect ? () => onSelect(name) : undefined)}
                />
                {expandida && detalle && (
                  <div style={{ margin: '2px 0 8px', paddingLeft: 10, borderLeft: `2px solid ${color}55` }}>
                    {detalle.map(([subNombre, subVal]) => (
                      <div key={subNombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#4b5563' }}>
                        <span>{subNombre}</span>
                        <strong>{fmt(subVal)}</strong>
                      </div>
                    ))}
                    {onSelect && (
                      <button onClick={() => onSelect(name)}
                        style={{ marginTop: 4, background: 'none', border: 'none', padding: 0, fontSize: 10, fontWeight: 600, color, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Ver movimientos →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DetalleDesglose({ tipo, nombre, gastos, compras, range, onClose }: {
  tipo: 'gastos' | 'compras'
  nombre: string
  gastos: Gasto[]
  compras: OC[]
  range: { from: string; to: string }
  onClose: () => void
}) {
  const esCompras = tipo === 'compras'
  const total = esCompras
    ? compras.reduce((s, o) => s + (+o.total || 0), 0)
    : gastos.reduce((s, g) => s + (+g.monto || 0), 0)
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 680, maxHeight: '86dvh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(15,23,42,.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#111827' }}>{nombre}</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>
              {esCompras ? 'Compras al proveedor' : 'Gastos de la categoría'} · {range.from} al {range.to}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle" style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: '#f3f4f6', color: '#6b7280', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 20px 16px' }}>
          {esCompras ? compras.map(o => (
            <div key={o.id} style={{ padding: '13px 0', borderBottom: '1px solid #eef2f7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>OC {o.numero || '—'}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{o.fecha} · {o.bodega_nombre || 'Sin sucursal'}</div>
                </div>
                <strong style={{ fontSize: 13, color: '#111827', whiteSpace: 'nowrap' }}>{fmt(+o.total || 0)}</strong>
              </div>
              {(o.items ?? []).length > 0 && (
                <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 8, background: '#f8fafc' }}>
                  {o.items.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', fontSize: 11 }}>
                      <span style={{ color: '#475569' }}>{item.producto_nombre} · {item.cantidad} ud.</span>
                      <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmt(+item.subtotal || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )) : gastos.map(g => (
            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid #eef2f7' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 650, color: '#1f2937' }}>{g.descripcion || 'Sin descripción'}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{g.fecha}{g.subcategoria ? ` · ${g.subcategoria}` : ''}{g.bodega_nombre ? ` · ${g.bodega_nombre}` : ''}</div>
              </div>
              <strong style={{ fontSize: 13, color: '#111827', whiteSpace: 'nowrap' }}>{fmt(+g.monto || 0)}</strong>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #e5e7eb', background: '#f8fafc' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{esCompras ? compras.length : gastos.length} registro{(esCompras ? compras.length : gastos.length) !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: esCompras ? '#2563eb' : '#ef4444' }}>Total {fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}

// Variación contra el período anterior equivalente. Un monto suelto no dice si
// el mes viene bien o mal; el porcentaje es lo que convierte el dato en señal.
function Delta({ actual, previo }: { actual: number; previo: number }) {
  if (!previo) return <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, marginBottom: 0 }}>sin período anterior</p>
  const pct = Math.round((actual - previo) / Math.abs(previo) * 100)
  const sube = actual >= previo
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: sube ? '#059669' : '#dc2626', marginTop: 3, marginBottom: 0 }}>
      {sube ? '▲' : '▼'} {Math.abs(pct)}% vs período anterior
    </p>
  )
}

const CARD: React.CSSProperties = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 18px' }
const KPI_LAB: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, marginTop: 0 }
const KPI_VAL: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1.1, margin: 0 }
const KPI_SUB: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginTop: 3, marginBottom: 0 }
const CT: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2, marginTop: 0 }
const CS: React.CSSProperties = { fontSize: 11, color: '#9ca3af', marginBottom: 12, marginTop: 0 }

export type SeccionResumen = 'resumen' | 'gastos' | 'compras' | 'operacion'

export function ResumenTab({ seccion = 'resumen', mostrarEncabezado = true }: {
  seccion?: SeccionResumen
  mostrarEncabezado?: boolean
}) {
  const [tab, setTab] = useState<Tab>('mes')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detalle, setDetalle] = useState<{ tipo: 'gastos' | 'compras'; nombre: string } | null>(null)
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  const last6 = useMemo(() => getLast6(), [])
  const range = useMemo(() => getRange(tab, from, to), [tab, from, to])
  const range6 = useMemo(() => ({ from: `${last6[0].key}-01`, to: today() }), [last6])
  // El gráfico de la tarjeta muestra seis meses y el desglose el período
  // elegido. Sin decirlo, parecen dos cifras contradictorias de lo mismo.
  const notaPeriodo = useMemo(
    () => range.from === range.to ? range.from : `${range.from} al ${range.to}`,
    [range],
  )
  // Período anterior equivalente: sin comparación, un monto suelto no dice si
  // el mes viene bien o mal. Se reusa el mismo helper del Dashboard para que
  // las dos pantallas comparen igual.
  const rangoComparacion: RangoComparacion =
    tab === 'hoy' ? 'hoy' : tab === 'mes' ? 'mes' : tab === 'año' ? 'año' : 'rango'
  const previo = useMemo(
    () => periodoAnteriorEquivalente(rangoComparacion, range.from, range.to),
    [rangoComparacion, range],
  )
  // Las ventas se piden cubriendo también el período anterior; si no, no habría
  // con qué comparar.
  const rangoVentas = useMemo(() => ({
    from: previo.desde < range.from ? previo.desde : range.from,
    to: range.to,
  }), [previo, range])

  const queryRange = useMemo(() => ({
    from: [range.from, range6.from, previo.desde].sort()[0],
    to: range.to > range6.to ? range.to : range6.to,
  }), [range, range6, previo])

  // Esta pantalla usaba useVentas(), que baja la tabla ENTERA de ventas —
  // paginando de a 1000 hasta traerlas todas— y encima con el join de
  // venta_items en cada fila (el payload más pesado de la app). Todo eso para
  // después descartar en el navegador lo que cae fuera del rango elegido.
  // Los totales de acá solo miran el rango, así que se pide solo el rango.
  // getRange() siempre devuelve fechas válidas (cae al mes actual), así que
  // la query nunca queda deshabilitada.
  const { data: ventas, isLoading: loadV } = useVentasEnRango(rangoVentas.from, range.to)
  const { data: gastos, isLoading: loadG } = useGastosEnRango(queryRange.from, queryRange.to)
  const { data: ordenes, isLoading: loadO } = useOrdenesEntregadasEnRango(queryRange.from, queryRange.to)
  // Ver el comentario del Dashboard: margen hacia atrás porque las compras se
  // cuentan por la fecha de recepción y el servidor filtra por la de creación.
  const { data: ocs, isLoading: loadOC } = useOCsEnRango(restarDias(queryRange.from, MARGEN_OC_DIAS), queryRange.to)
  const { data: bodegas = [] } = useBodegas()
  // `venta.metodo_pago` guarda el ID del método, no su nombre: sin este mapeo
  // la tarjeta mostraba cosas como "mpt7zej50ss1s". Mismo criterio que el
  // Dashboard, incluida la capitalización de los métodos por defecto, que se
  // guardan con id en minúscula ("efectivo", "transfer").
  const { data: metodosPago = [] } = useMetodosPago()
  // Mismo criterio que Ventas y Dashboard: si el id ya no está en la lista
  // (el método se borró), no se expone tal cual — quedaría un "mpt7zej50ss1s"
  // ilegible en la tarjeta.
  const nombreMetodo = useMemo(() => (id: string) => nombreMetodoPago(id, metodosPago), [metodosPago])
  const productosSinCosto = useMemo(() => [...new Set((ventas ?? []).flatMap(v => (v.items ?? [])
    .filter(item => item.costo_total == null && item.producto_id)
    .map(item => item.producto_id!)))], [ventas])
  const { data: costosProductos = [], isLoading: loadCostos } = useCostosProductos(productosSinCosto)

  const inRange = (f?: string) => !!f && f >= range.from && f <= range.to

  const stats = useMemo(() => {
    const ventasArr = filtrarVentasPagadas(ventas ?? []).filter(v => inRange(v.fecha))
    const gastosArr = (gastos ?? []).filter(g => inRange(g.fecha))
    const ocsArr = (ocs ?? []).filter(o => ['recibida', 'confirmada'].includes(o.estado) && inRange(fechaEfectivaOC(o)))
    const fechaEntrega = (o: { deliveredAt?: string; fecha: string }) => o.deliveredAt?.slice(0, 10) || o.fecha
    const ordeArr = (ordenes ?? []).filter(o => inRange(fechaEntrega(o)))

    const prodCostoMap = new Map(costosProductos.map(p => [p.id, p.precio_compra]))
    const resumen = calcularResumenOperacional(ventasArr, gastosArr, prodCostoMap)
    const totalVentas = resumen.ventasBrutas
    const ventasNetas = resumen.ventasNetas
    const totalGastos = resumen.gastos
    const totalCompras = ocsArr.reduce((s, o) => s + (+o.total || 0), 0)
    const totalCosto = resumen.costoVentas
    const utilidad = resumen.resultadoOperacional
    const ordenesOk = ordeArr.length
    const ticketProm = resumen.ticketPromedio

    // Ventas por sucursal
    const maxBSales = Math.max(...bodegas.map(b => ventasArr.filter(v => v.branchId === b.id).reduce((s, v) => s + (+v.total_iva || 0), 0)), 1)
    const bSales = bodegas
      .map(b => ({
        nombre: b.nombre ?? b.name ?? '—',
        total: ventasArr.filter(v => v.branchId === b.id).reduce((s, v) => s + (+v.total_iva || 0), 0),
      }))
      .filter(b => b.total > 0)
      .sort((a, b) => b.total - a.total)
    const idsBodegasVentas = new Set(bodegas.map(b => b.id))
    const totalSinSucursal = ventasArr
      .filter(v => !v.branchId || !idsBodegasVentas.has(v.branchId))
      .reduce((s, v) => s + (+v.total_iva || 0), 0)
    if (totalSinSucursal > 0) bSales.push({ nombre: 'Sin sucursal', total: totalSinSucursal })

    // Utilidad por sucursal: ventas de la sucursal menos sus gastos (directos + prorrateo
    // de los gastos "General/Compartido" según % de ventas netas). El costo de compras (OC)
    // no se resta acá: eso ya lo maneja el costeo FIFO al momento de la venta.
    const ventasNetasPorSucursal: Record<string, number> = {}
    bodegas.forEach(b => {
      ventasNetasPorSucursal[b.id] = ventasArr.filter(v => v.branchId === b.id).reduce((s, v) => s + (+v.total || 0), 0)
    })
    const distribucionGastos = distribuirGastosPorSucursal(gastosArr, bodegas, ventasNetasPorSucursal)
    const gastosPorSuc = distribucionGastos.porSucursal
    const bUtil = bodegas
      .map(b => {
        const bV = ventasArr.filter(v => v.branchId === b.id)
        return {
          nombre: b.nombre ?? b.name ?? '—',
          util: bV.reduce((s, v) => s + (+v.total || 0), 0) - calcularCostoVentas(bV, prodCostoMap) - (gastosPorSuc[b.id] ?? 0),
        }
      })
      .filter(b => b.util !== 0)
      .sort((a, b) => b.util - a.util)
    const ventasSinSucursal = ventasArr.filter(v => !v.branchId || !idsBodegasVentas.has(v.branchId))
    if (ventasSinSucursal.length > 0 || distribucionGastos.noAsignado > 0) {
      bUtil.push({
        nombre: 'Sin sucursal / no asignado',
        util: ventasSinSucursal.reduce((s, v) => s + (+v.total || 0), 0)
          - calcularCostoVentas(ventasSinSucursal, prodCostoMap)
          - distribucionGastos.noAsignado,
      })
    }

    // Comparación con el período anterior.
    const ventasPrev = filtrarVentasPagadas(ventas ?? [])
      .filter(v => !!v.fecha && v.fecha >= previo.desde && v.fecha <= previo.hasta)
    const brutasPrev = ventasPrev.reduce((s, v) => s + (+v.total_iva || 0), 0)
    const cantPrev = ventasPrev.length
    const ticketPrev = cantPrev > 0 ? Math.round(brutasPrev / cantPrev) : 0
    const ordenesPrev = (ordenes ?? []).filter(o => {
      const f = fechaEntrega(o)
      return f >= previo.desde && f <= previo.hasta
    }).length

    // Métodos de pago del período (esto solo existía en el Dashboard).
    const mpMap: Record<string, number> = {}
    ventasArr.forEach(v => {
      const mp = nombreMetodo(v.metodo_pago || '')
      mpMap[mp] = (mpMap[mp] ?? 0) + (+v.total_iva || 0)
    })
    const mpSorted = Object.entries(mpMap).sort((a, b) => b[1] - a[1])

    // Top productos
    const prodMap: Record<string, { nombre: string; qty: number; revenue: number }> = {}
    ventasArr.forEach(v => (v.items ?? []).forEach(it => {
      const k = it.producto_id || `nombre:${it.producto_nombre || '—'}`
      if (!prodMap[k]) prodMap[k] = { nombre: k, qty: 0, revenue: 0 }
      prodMap[k].nombre = it.producto_nombre || '—'
      prodMap[k].qty += (+it.cantidad || 1)
      prodMap[k].revenue += (+it.subtotal || 0)
    }))
    const topProds = Object.values(prodMap).sort((a, b) => b.qty - a.qty).slice(0, 3)
    const maxQty = Math.max(...topProds.map(p => p.qty), 1)
    // El ranking por dinero es OTRO: lo más vendido por unidades rara vez es lo
    // que más factura. Los dos importan y por eso van lado a lado.
    const topProdsPlata = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 3)
    const maxRevenue = Math.max(...topProdsPlata.map(p => p.revenue), 1)

    // Los desgloses siguen el PERÍODO ELEGIDO, no los seis meses del gráfico.
    // Antes estaban fijos en seis meses: se cambiaba a "7 días" arriba y estos
    // números no se movían, así que parecía que el filtro no funcionaba.
    // El gráfico de barras sí se queda en seis meses — para eso está, y su
    // título lo dice.
    const catMap: Record<string, number> = {}
    gastosArr.forEach(g => { catMap[g.categoria || 'Sin categoría'] = (catMap[g.categoria || 'Sin categoría'] || 0) + (+g.monto || 0) })
    const catSorted = Object.entries(catMap).sort((a, b) => b[1] - a[1])
    const catPrevMap: Record<string, number> = {}
    ;(gastos ?? []).filter(g => !!g.fecha && g.fecha >= previo.desde && g.fecha <= previo.hasta)
      .forEach(g => {
        const categoria = g.categoria || 'Sin categoría'
        catPrevMap[categoria] = (catPrevMap[categoria] ?? 0) + (+g.monto || 0)
      })
    const catComparacion = [...new Set([...Object.keys(catMap), ...Object.keys(catPrevMap)])]
      .map(nombre => ({ nombre, actual: catMap[nombre] ?? 0, anterior: catPrevMap[nombre] ?? 0 }))
      .sort((a, b) => b.actual - a.actual)

    // Desglose de cada categoría de gasto por subcategoría: es donde viven el
    // empleado en Sueldos y Comisiones, y el canal en Publicidad. El dato ya se
    // guardaba; lo que faltaba era mostrarlo sin salir de la tarjeta.
    const subPorCat: Record<string, [string, number][]> = {}
    for (const [cat] of Object.entries(catMap)) {
      const sub: Record<string, number> = {}
      gastosArr.filter(g => (g.categoria || 'Sin categoría') === cat)
        .forEach(g => {
          const k = g.subcategoria?.trim() || 'Sin detalle'
          sub[k] = (sub[k] ?? 0) + (+g.monto || 0)
        })
      const filas = Object.entries(sub).sort((a, b) => b[1] - a[1])
      // Una sola fila "Sin detalle" no aporta nada: es repetir el total.
      if (filas.length > 1 || (filas.length === 1 && filas[0][0] !== 'Sin detalle')) {
        subPorCat[cat] = filas
      }
    }


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
      ordenes: ordeAll.filter(o => fechaEntrega(o).startsWith(m.key)).length,
    }))
    const maxMG = Math.max(...meses6.map(m => m.gastos), 1)
    const maxMC = Math.max(...meses6.map(m => m.compras), 1)
    const maxMO = Math.max(...meses6.map(m => m.ordenes), 1)

    return {
      totalVentas, ventasNetas, totalGastos, totalCompras, totalCosto, utilidad, ordenesOk, ticketProm,
      bSales, maxBSales, bUtil, topProds, maxQty, topProdsPlata, maxRevenue, catSorted, catComparacion, provSorted, subPorCat, mpSorted,
      brutasPrev, ticketPrev, ordenesPrev,
      meses6, maxMG, maxMC, maxMO,
      cntVentas: resumen.cantidadVentas,
      // Totales del PERÍODO, que son los que corresponden a los desgloses.
      totalGastosPeriodo: gastosArr.reduce((s, g) => s + (+g.monto || 0), 0),
      totalComprasPeriodo: ocsArr.reduce((s, o) => s + (+o.total || 0), 0),
      gastosPeriodo: gastosArr,
      ocsPeriodo: ocsArr,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas, gastos, ordenes, ocs, costosProductos, bodegas, range, range6, last6, previo, nombreMetodo])

  const isMobile = useIsMobile()

  if (loadV || loadG || loadO || loadOC || loadCostos) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  const TABS: { id: Tab; label: string }[] = [
    { id: 'hoy', label: 'Hoy' },
    { id: '7d', label: '7 días' },
    { id: '30d', label: '30 días' },
    { id: 'mes', label: 'Este mes' },
    { id: 'año', label: 'Este año' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...(isMobile ? { padding: '0 0 8px' } : {}) }}>

      {/* Header + range selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', ...(isMobile ? { background: '#fff', padding: '16px 16px 12px', borderBottom: '0.5px solid #e5e7eb' } : {}) }}>
        {mostrarEncabezado && <h2 style={{ fontSize: isMobile ? 22 : 18, fontWeight: 800, color: '#111827', margin: 0, marginRight: 'auto' }}>
          {seccion === 'resumen' ? 'Resumen ejecutivo' : seccion === 'gastos' ? 'Gastos' : seccion === 'compras' ? 'Compras' : 'Operación'}
        </h2>}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setFrom(''); setTo('') }}
              style={{
                flexShrink: 0, padding: '6px 14px', border: 'none', borderRadius: 99, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                background: tab === t.id ? '#3656e6' : '#F2F2F7',
                color: tab === t.id ? '#fff' : '#6b7280',
              }}
            >{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...(isMobile ? { width: '100%' } : {}) }}>
          <div
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, background: tab === 'custom' && from ? '#eff6ff' : '#f9fafb', border: `1px solid ${tab === 'custom' && from ? '#93c5fd' : '#e5e7eb'}`, borderRadius: 8, padding: '8px 11px', cursor: 'pointer', flex: isMobile ? 1 : 'none' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={from ? '#3656e6' : '#9ca3af'} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: from ? '#374151' : '#9ca3af' }}>{from ? from.split('-').reverse().join('/') : 'Desde'}</span>
            <input
              ref={fromRef}
              type="date"
              value={from}
              onChange={e => {
                setFrom(e.target.value)
                setTab('custom')
              }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', cursor: 'pointer' }}
            />
          </div>
          <span style={{ fontSize: 11, color: '#d1d5db', fontWeight: 600, flexShrink: 0 }}>→</span>
          <div
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, background: tab === 'custom' && to ? '#eff6ff' : '#f9fafb', border: `1px solid ${tab === 'custom' && to ? '#93c5fd' : '#e5e7eb'}`, borderRadius: 8, padding: '8px 11px', cursor: 'pointer', flex: isMobile ? 1 : 'none' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={to ? '#3656e6' : '#9ca3af'} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: to ? '#374151' : '#9ca3af' }}>{to ? to.split('-').reverse().join('/') : 'Hasta'}</span>
            <input
              ref={toRef}
              type="date"
              value={to}
              onChange={e => {
                setTo(e.target.value)
                setTab('custom')
              }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* KPIs — cuánto vendí, cuánto me quedó, cuánto trabajé, a qué precio */}
      {(seccion === 'resumen' || seccion === 'operacion') && <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
        <div style={CARD}>
          <p style={KPI_LAB}>Ventas con IVA</p>
          <p style={KPI_VAL}>{fmt(stats.totalVentas)}</p>
          <p style={KPI_SUB}>{stats.cntVentas} venta{stats.cntVentas !== 1 ? 's' : ''} · neto {fmt(stats.ventasNetas)}</p>
          <Delta actual={stats.totalVentas} previo={stats.brutasPrev} />
        </div>
        <div style={CARD}>
          <p style={KPI_LAB}>Resultado operacional</p>
          <p style={{ ...KPI_VAL, color: stats.utilidad >= 0 ? '#10b981' : '#ef4444' }}>{fmt(stats.utilidad)}</p>
          <p style={KPI_SUB}>Ventas netas − costo vendido − gastos</p>
        </div>
        <div style={CARD}>
          <p style={KPI_LAB}>Órdenes entregadas</p>
          <p style={{ ...KPI_VAL, color: '#f59e0b' }}>{stats.ordenesOk}</p>
          <p style={KPI_SUB}>Reparaciones</p>
          <Delta actual={stats.ordenesOk} previo={stats.ordenesPrev} />
        </div>
        <div style={CARD}>
          <p style={KPI_LAB}>Ticket promedio</p>
          <p style={KPI_VAL}>{fmt(stats.ticketProm)}</p>
          <p style={KPI_SUB}>Con IVA</p>
          <Delta actual={stats.ticketProm} previo={stats.ticketPrev} />
        </div>
      </div>}

      {/* De dónde vino la plata */}
      {seccion === 'resumen' && <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>

        {/* Ventas por sucursal */}
        <div style={CARD}>
          <p style={CT}>Ventas por sucursal</p>
          <p style={CS}>Monto con IVA</p>
          {stats.bSales.length ? stats.bSales.map((b, i) => (
            <HBar key={i} label={b.nombre} value={b.total} total={stats.totalVentas} color={COLORES[i] ?? '#64748b'} />
          )) : <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin ventas en el período</p>}
        </div>

        {/* Utilidad por sucursal */}
        <div style={CARD}>
          <p style={CT}>Resultado por sucursal</p>
          <p style={CS}>Ventas netas − Costo de productos − Gastos asignados</p>
          {stats.bUtil.length ? stats.bUtil.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#374151', fontWeight: 600 }}>{b.nombre}</span>
              <span style={{ fontWeight: 700, color: b.util >= 0 ? '#10b981' : '#ef4444' }}>{fmt(b.util)}</span>
            </div>
          )) : <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin datos de sucursales</p>}
        </div>

        {/* Top productos por unidades */}
        <div style={CARD}>
          <p style={CT}>Más vendidos por unidades</p>
          <p style={CS}>Cantidad en el período</p>
          {stats.topProds.length ? stats.topProds.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: i < stats.topProds.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#fef9c3' : '#ecefff', color: i === 0 ? '#b45309' : '#3656e6', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <span style={{ fontSize: 11, color: '#374151', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
              <strong style={{ fontSize: 11, color: '#111827' }}>{p.qty} un</strong>
            </div>
          )) : <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin ventas en el período</p>}
        </div>

        {/* Top productos por dinero — ranking distinto y también necesario:
            lo que más se vende por unidades rara vez es lo que más factura. */}
        <div style={CARD}>
          <p style={CT}>Más vendidos por dinero</p>
          <p style={CS}>Ingreso neto generado</p>
          {stats.topProdsPlata.length ? stats.topProdsPlata.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: i < stats.topProdsPlata.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#d1fae5' : '#ecfdf5', color: '#059669', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <span style={{ fontSize: 11, color: '#374151', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
              <strong style={{ fontSize: 11, color: '#111827' }}>{fmt(p.revenue)}</strong>
            </div>
          )) : <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin ventas en el período</p>}
        </div>
      </div>}

      {/* Métodos de pago — estaba solo en el Dashboard. Va a todo el ancho:
          es una lista corta y sola en una grilla de tres dejaba dos huecos. */}
      {seccion === 'resumen' && <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <div style={CARD}>
          <p style={CT}>Métodos de pago</p>
          <p style={CS}>Monto con IVA</p>
          {stats.mpSorted.length ? stats.mpSorted.map(([nombre, val], i) => (
            <HBar key={nombre} label={nombre} value={val} total={stats.totalVentas} color={COLORES[i] ?? '#64748b'} />
          )) : <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin ventas en el período</p>}
        </div>
      </div>}

      {/* Tendencia y desgloses — el gráfico son 6 meses, el detalle el período */}
      <div style={{ display: 'grid', gridTemplateColumns: seccion === 'resumen' && !isMobile ? 'repeat(3, 1fr)' : '1fr', gap: 12 }}>

        {/* Gastos por mes */}
        {(seccion === 'resumen' || seccion === 'gastos') && <div style={CARD}>
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
          {seccion === 'resumen' && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
              <p style={{ ...KPI_LAB, marginBottom: 7 }}>Principales categorías</p>
              {stats.catSorted.slice(0, 3).map(([nombre, valor]) => (
                <HBar key={nombre} label={nombre} value={valor} total={stats.totalGastosPeriodo} color="#ef4444" />
              ))}
            </div>
          )}
          {seccion === 'gastos' && <Desglose entries={stats.catSorted} total={stats.totalGastosPeriodo} color="#ef4444" label="categoría" nota={notaPeriodo} sub={stats.subPorCat}
            onSelect={nombre => setDetalle({ tipo: 'gastos', nombre })} />}
          {seccion === 'gastos' && stats.catComparacion.length > 0 && (
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <p style={CT}>Gasto real por categoría</p>
              <p style={CS}>Comparación con el período anterior equivalente; no usa presupuestos.</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  {['Categoría', 'Período actual', 'Período anterior', 'Variación', '% ventas netas'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: i ? 'right' : 'left', color: '#9ca3af', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{stats.catComparacion.map(f => {
                  const variacion = f.actual - f.anterior
                  const pctVentas = stats.ventasNetas ? f.actual / stats.ventasNetas * 100 : 0
                  return <tr key={f.nombre} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 6px', fontWeight: 700, color: '#374151' }}>{f.nombre}</td>
                    <td style={{ padding: '9px 6px', textAlign: 'right', color: '#111827' }}>{fmt(f.actual)}</td>
                    <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6b7280' }}>{fmt(f.anterior)}</td>
                    <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: variacion > 0 ? '#dc2626' : variacion < 0 ? '#059669' : '#6b7280' }}>
                      {variacion > 0 ? '+' : ''}{fmt(variacion)}
                    </td>
                    <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6b7280' }}>{pctVentas.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%</td>
                  </tr>
                })}</tbody>
              </table>
            </div>
          )}
        </div>}

        {/* Compras por mes */}
        {(seccion === 'resumen' || seccion === 'compras') && <div style={CARD}>
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
          {seccion === 'resumen' && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
              <p style={{ ...KPI_LAB, marginBottom: 7 }}>Principales proveedores</p>
              {stats.provSorted.slice(0, 3).map(([nombre, valor]) => (
                <HBar key={nombre} label={nombre} value={valor} total={stats.totalComprasPeriodo} color="#2563eb" />
              ))}
            </div>
          )}
          {seccion === 'compras' && <Desglose entries={stats.provSorted} total={stats.totalComprasPeriodo} color="#2563eb" label="proveedor" nota={notaPeriodo}
            onSelect={nombre => setDetalle({ tipo: 'compras', nombre })} />}
        </div>}

        {/* Órdenes completadas por mes */}
        {(seccion === 'resumen' || seccion === 'operacion') && <div style={CARD}>
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
              <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', marginBottom: 2 }}>TICKET PROMEDIO · PERÍODO SELECCIONADO</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#92400e' }}>{fmt(stats.ticketProm)}</div>
            </div>
          )}
        </div>}
      </div>
      {detalle && (
        <DetalleDesglose
          tipo={detalle.tipo}
          nombre={detalle.nombre}
          range={range}
          gastos={detalle.tipo === 'gastos'
            ? stats.gastosPeriodo.filter(g => (g.categoria || 'Sin categoría') === detalle.nombre)
            : []}
          compras={detalle.tipo === 'compras'
            ? stats.ocsPeriodo.filter(o => (o.proveedor_nombre || 'Sin proveedor') === detalle.nombre)
            : []}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  )
}
