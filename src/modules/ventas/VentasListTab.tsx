import { useState, useMemo, useRef } from 'react'
import { useVentas, useAnularVenta, useMetodosPago, useProductos } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { Venta } from '@/types'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const PAGE_SIZE = 50

type Periodo = 'hoy' | 'mes' | 'año' | 'todo' | 'rango'

function today() { return new Date().toISOString().slice(0, 10) }

function filtrarPorFecha(lista: Venta[], periodo: Periodo, desde: string, hasta: string): Venta[] {
  const hoy = today()
  if (periodo === 'hoy') return lista.filter(v => v.fecha?.startsWith(hoy))
  if (periodo === 'mes') return lista.filter(v => v.fecha?.startsWith(hoy.slice(0, 7)))
  if (periodo === 'año') return lista.filter(v => v.fecha?.startsWith(hoy.slice(0, 4)))
  if (periodo === 'rango') {
    return lista.filter(v => {
      if (!v.fecha) return false
      const d = v.fecha.slice(0, 10)
      return (!desde || d >= desde) && (!hasta || d <= hasta)
    })
  }
  return lista
}

const PERIODO_LABEL: Record<Periodo, string> = {
  hoy: 'Hoy', mes: 'Este mes', año: 'Este año', todo: 'Todo el tiempo', rango: 'Rango',
}

// Usa el costo FIFO congelado en la venta (costo_total). Para ventas anteriores a esa
// funcionalidad, que no tienen costo congelado, recae en el precio_compra actual del producto.
// Función de módulo (no closure) para no depender de react-hooks/exhaustive-deps.
function calcUtilidad(lista: Venta[], prodsMap: Map<string, number>) {
  return lista.reduce((sum, v) => {
    const costo = (v.items ?? []).reduce((cs, it) => {
      if (it.costo_total != null) return cs + it.costo_total
      if (!it.producto_id) return cs
      return cs + it.cantidad * (prodsMap.get(it.producto_id) ?? 0)
    }, 0)
    return sum + (v.total ?? 0) - costo
  }, 0)
}

export function VentasListTab() {
  const { data: ventas, isLoading } = useVentas()
  const { data: metodos } = useMetodosPago()
  const { data: productos } = useProductos()
  const anularVenta = useAnularVenta()
  const { esAdmin } = useAuth()

  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todas' | 'pagada' | 'anulada' | 'pendiente'>('todas')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(PAGE_SIZE)
  const [detalle, setDetalle] = useState<Venta | null>(null)
  const desdeRef = useRef<HTMLInputElement>(null)
  const hastaRef = useRef<HTMLInputElement>(null)

  const mpMap = useMemo(() => {
    const m: Record<string, string> = {}
    ;(metodos ?? []).forEach(mp => { m[mp.id] = mp.label })
    return m
  }, [metodos])

  const prodsMap = useMemo(() => {
    const m = new Map<string, number>()
    ;(productos ?? []).forEach(p => { if (p.id) m.set(p.id, p.precio_compra ?? 0) })
    return m
  }, [productos])

  const historico = useMemo(() => {
    const todas = (ventas ?? []).filter(v => v.estado === 'pagada')
    return {
      count: todas.length,
      total: todas.reduce((s, v) => s + (v.total_iva ?? 0), 0),
      utilidad: calcUtilidad(todas, prodsMap),
    }
  }, [ventas, prodsMap])

  const activas = useMemo(() => (ventas ?? []).filter(v => v.estado !== 'anulada'), [ventas])
  const periodoFiltrado = useMemo(() => filtrarPorFecha(activas, periodo, desde, hasta), [activas, periodo, desde, hasta])

  const totalVentas = periodoFiltrado.reduce((s, v) => s + (v.total_iva ?? 0), 0)
  const totalNeto = periodoFiltrado.reduce((s, v) => s + (v.total ?? 0), 0)
  const utilidad = useMemo(() => calcUtilidad(periodoFiltrado, prodsMap), [periodoFiltrado, prodsMap])

  const metodosSorted = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {}
    periodoFiltrado.forEach(v => {
      const k = v.metodo_pago || 'otro'
      if (!map[k]) map[k] = { total: 0, count: 0 }
      map[k].total += v.total_iva ?? 0
      map[k].count++
    })
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }, [periodoFiltrado])

  const lista = useMemo(() => {
    const arr = [...(ventas ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha))
    let filtered = filtroEstado === 'todas'
      ? filtrarPorFecha(arr, periodo, desde, hasta)
      : filtrarPorFecha(arr.filter(v => v.estado === filtroEstado), periodo, desde, hasta)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().replace(/[.-]/g, '')
      filtered = filtered.filter(v =>
        v.numero.toLowerCase().includes(busqueda.toLowerCase()) ||
        v.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
        (v.numero.replace(/[.-]/g, '')).includes(q)
      )
    }
    return filtered
  }, [ventas, filtroEstado, busqueda, periodo, desde, hasta])

  function aplicarRango() {
    setPeriodo('rango')
    setPage(PAGE_SIZE)
  }

  async function anular(v: Venta) {
    if (!esAdmin) return
    if (!confirm(`¿Anular la venta ${v.numero}?`)) return
    await anularVenta.mutateAsync(v.id)
  }

  const visible = lista.slice(0, page)
  const hayMas = lista.length > page

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="space-y-4">
      {/* Filtro período */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {(['hoy', 'mes', 'año', 'todo'] as Periodo[]).map((p, i) => (
            <button
              key={p}
              onClick={() => { setPeriodo(p); setPage(PAGE_SIZE) }}
              className={['px-3 py-1.5 text-xs font-semibold transition',
                i > 0 ? 'border-l border-gray-200' : '',
                periodo === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'].join(' ')}
            >{PERIODO_LABEL[p]}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div onClick={() => desdeRef.current?.showPicker()} className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg cursor-pointer bg-white hover:border-blue-300 transition">
            <svg className="w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <input ref={desdeRef} type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="border-none outline-none text-base md:text-xs text-gray-700 bg-transparent w-28 cursor-pointer pointer-events-none" />
          </div>
          <span className="text-gray-300 text-sm">—</span>
          <div onClick={() => hastaRef.current?.showPicker()} className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg cursor-pointer bg-white hover:border-blue-300 transition">
            <svg className="w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <input ref={hastaRef} type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="border-none outline-none text-base md:text-xs text-gray-700 bg-transparent w-28 cursor-pointer pointer-events-none" />
          </div>
          <button onClick={aplicarRango} className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 transition">
            Aplicar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 border-t-2 border-t-emerald-500">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Ventas c/IVA</p>
          <p className="text-xs text-blue-600 font-medium mb-2">{PERIODO_LABEL[periodo]}</p>
          <p className="text-2xl font-extrabold text-emerald-600">{fmt(totalVentas)}</p>
          <p className="text-xs text-gray-400 mt-1">{periodoFiltrado.length} venta{periodoFiltrado.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 border-t-2 border-t-blue-500">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Neto sin IVA</p>
          <p className="text-xs text-blue-600 font-medium mb-2">{PERIODO_LABEL[periodo]}</p>
          <p className="text-2xl font-extrabold text-blue-600">{fmt(totalNeto)}</p>
          <p className="text-xs text-gray-400 mt-1">IVA: {fmt(totalVentas - totalNeto)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 border-t-2 border-t-violet-500">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Utilidad neta</p>
          <p className="text-xs text-blue-600 font-medium mb-2">{PERIODO_LABEL[periodo]}</p>
          <p className={`text-2xl font-extrabold ${utilidad >= 0 ? 'text-violet-600' : 'text-red-500'}`}>{fmt(utilidad)}</p>
          <p className="text-xs text-gray-400 mt-1">Neto − costo productos</p>
        </div>
      </div>

      {/* 2-col: Métodos de pago | Resumen histórico */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Métodos de pago — {PERIODO_LABEL[periodo]}</p>
          {metodosSorted.length === 0 ? (
            <p className="text-xs text-gray-400">Sin ventas en este período</p>
          ) : (
            <div className="space-y-3">
              {metodosSorted.map(([k, { total, count }]) => {
                const pct = totalVentas > 0 ? Math.round(total / totalVentas * 100) : 0
                return (
                  <div key={k}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-gray-700">{mpMap[k] ?? k}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{count} venta{count !== 1 ? 's' : ''} · {pct}%</span>
                        <span className="text-sm font-bold text-gray-900">{fmt(total)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Resumen histórico</p>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Total ventas registradas</p>
              <p className="text-2xl font-extrabold text-gray-900">{historico.count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Acumulado histórico</p>
              <p className="text-2xl font-extrabold text-emerald-600">{fmt(historico.total)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Utilidad histórica total</p>
              <p className={`text-2xl font-extrabold ${historico.utilidad >= 0 ? 'text-violet-600' : 'text-red-500'}`}>{fmt(historico.utilidad)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPage(PAGE_SIZE) }}
              placeholder="Buscar por número o cliente..."
              className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-full md:w-auto">
            {([['todas', 'Todas'], ['pagada', 'Pagadas'], ['pendiente', 'Pendiente'], ['anulada', 'Anuladas']] as const).map(([e, lbl]) => (
              <button key={e} onClick={() => { setFiltroEstado(e); setPage(PAGE_SIZE) }}
                className={['flex-1 md:flex-none px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg transition text-center',
                  filtroEstado === e ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'].join(' ')}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400 px-4 py-2">{lista.length} ventas</p>

        {lista.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>
              <path d="M2.5 3h2.2l2.3 11.2a1.6 1.6 0 001.6 1.3h8.7a1.6 1.6 0 001.55-1.25L21 7H6"/>
            </svg>
            <p className="text-sm text-gray-400">{busqueda || filtroEstado !== 'todas' ? 'Sin resultados' : 'No hay ventas en este período'}</p>
          </div>
        ) : (
          <>
            {/* Cards — mobile */}
            <div className="md:hidden divide-y divide-gray-100">
              {visible.map(v => (
                <div key={v.id} className="px-4 py-3 active:bg-gray-50 cursor-pointer" onClick={() => setDetalle(v)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-semibold text-blue-600">{v.numero}</span>
                    <span className={`font-bold text-sm ${v.estado === 'anulada' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {fmt(v.total_iva)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{v.cliente || '—'}</span>
                    <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
                      v.estado === 'pagada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'].join(' ')}>
                      {v.estado === 'pagada' ? 'Pagada' : 'Anulada'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {mpMap[v.metodo_pago] ?? v.metodo_pago ?? '—'} · {v.tipo_doc ?? 'boleta'} · {v.fecha}
                  </p>
                </div>
              ))}
            </div>
            {/* Tabla — desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">N°</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Método</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Doc.</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visible.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetalle(v)}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">{v.numero}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{v.fecha}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{v.cliente}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{mpMap[v.metodo_pago] ?? v.metodo_pago ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 capitalize">{v.tipo_doc ?? 'boleta'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${v.estado === 'anulada' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {fmt(v.total_iva)}
                        </span>
                        <div className="text-xs text-gray-400">Neto: {fmt(v.total)}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          v.estado === 'pagada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'].join(' ')}>
                          {v.estado === 'pagada' ? 'Pagada' : 'Anulada'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setDetalle(v)} className="text-xs text-blue-600 hover:underline font-medium">Ver</button>
                          {v.estado === 'pagada' && esAdmin && (
                            <button onClick={() => anular(v)} className="text-xs text-red-500 hover:underline font-medium">Anular</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hayMas && (
              <div className="text-center py-4 border-t border-gray-100">
                <button onClick={() => setPage(p => p + PAGE_SIZE)}
                  className="px-5 py-2 bg-gray-100 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition">
                  Ver más ({lista.length - page} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Drawer detalle venta */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDetalle(null)} />
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
              <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Método de pago</span>
                  <span className="font-medium">{mpMap[detalle.metodo_pago] ?? detalle.metodo_pago}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Documento</span>
                  <span className="font-medium capitalize">{detalle.tipo_doc ?? 'boleta'}</span>
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
                <span>Subtotal neto</span><span>{fmt(detalle.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 mb-3">
                <span>IVA (19%)</span><span>{fmt(detalle.total_iva - detalle.total)}</span>
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
