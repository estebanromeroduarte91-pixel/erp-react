import { useState, useMemo, useEffect } from 'react'
import { useMovimientos, useGuardarMovimientos, useProductos, useBodegas, useAjustarStock } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { Movimiento, MovProducto } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

type LineaTraslado = { producto_id: string; cantidad: number }

function ModalTraslado({ onClose }: { onClose: () => void }) {
  const { data: productos = [] } = useProductos()
  const { data: bodegas = [] } = useBodegas()
  const guardarMovimientos = useGuardarMovimientos()
  const { data: movimientos } = useMovimientos()
  const ajustarStock = useAjustarStock()
  const { nombre: usuarioNombre } = useAuth()

  const bodegasActivas = useMemo(() => bodegas.filter(b => b.activo !== false), [bodegas])
  const [origenId, setOrigenId] = useState(bodegasActivas[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(bodegasActivas[1]?.id ?? bodegasActivas[0]?.id ?? '')
  const [lineas, setLineas] = useState<LineaTraslado[]>([{ producto_id: '', cantidad: 1 }])
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const productosConStock = useMemo(
    () => productos.filter(p => p.tipo !== 'servicio'),
    [productos],
  )

  function nombreBodega(id: string) {
    const b = bodegas.find(x => x.id === id)
    return b?.nombre ?? b?.name ?? '?'
  }

  function stockOrigen(productoId: string): number {
    const p = productos.find(x => x.id === productoId)
    return Number(p?.stock_sucursales?.[origenId]) || 0
  }

  function setLinea(i: number, patch: Partial<LineaTraslado>) {
    setLineas(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  function quitarLinea(i: number) {
    setLineas(ls => ls.filter((_, idx) => idx !== i))
  }

  const resumen = useMemo(() => {
    const validas = lineas.filter(l => l.producto_id && l.cantidad > 0)
    return { nProds: validas.length, total: validas.reduce((s, l) => s + l.cantidad, 0) }
  }, [lineas])

  async function confirmar() {
    setError('')
    const validas = lineas.filter(l => l.producto_id && l.cantidad > 0)
    if (!validas.length) { setError('Agrega al menos un producto válido'); return }
    if (!origenId || !destinoId) { setError('Selecciona origen y destino'); return }
    if (origenId === destinoId) { setError('El origen y destino no pueden ser iguales'); return }
    for (const l of validas) {
      if (l.cantidad > stockOrigen(l.producto_id)) {
        const p = productos.find(x => x.id === l.producto_id)
        setError(`No hay stock suficiente de "${p?.nombre ?? '?'}" en ${nombreBodega(origenId)}`)
        return
      }
    }

    setGuardando(true)
    try {
      const ajustes = validas.flatMap(l => [
        { producto_id: l.producto_id, bodega_id: origenId, delta: -l.cantidad },
        { producto_id: l.producto_id, bodega_id: destinoId, delta: l.cantidad },
      ])
      await ajustarStock.mutateAsync(ajustes)

      const movProductos: MovProducto[] = validas.map(l => ({
        producto_id: l.producto_id,
        producto_nombre: productos.find(p => p.id === l.producto_id)?.nombre ?? '',
        cantidad: l.cantidad,
      }))
      const nuevoMov: Movimiento = {
        id: uid(),
        fecha: new Date().toISOString().split('T')[0],
        hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        tipo: 'traslado',
        productos: movProductos,
        bodega_origen: nombreBodega(origenId),
        bodega_destino: nombreBodega(destinoId),
        notas: notas || `Traslado ${nombreBodega(origenId)} → ${nombreBodega(destinoId)}`,
        usuario: usuarioNombre,
      }
      await guardarMovimientos.mutateAsync([...(movimientos ?? []), nuevoMov])
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Traslado entre sucursales
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Ruta del traslado</p>
          <div className="grid grid-cols-[1fr_32px_1fr] gap-2 items-end">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Sucursal origen</label>
              <select value={origenId} onChange={e => setOrigenId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
                {bodegasActivas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-center text-gray-400 pb-2">→</div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Sucursal destino</label>
              <select value={destinoId} onChange={e => setDestinoId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
                {bodegasActivas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Productos a trasladar</p>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={l.producto_id} onChange={e => setLinea(i, { producto_id: e.target.value })}
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
                  <option value="">Selecciona un producto…</option>
                  {productosConStock.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <span className="text-[11px] text-gray-400 w-20 flex-shrink-0 text-right">
                  {l.producto_id ? `Stock: ${stockOrigen(l.producto_id)}` : ''}
                </span>
                <input type="number" min={1} value={l.cantidad}
                  onChange={e => setLinea(i, { cantidad: Math.max(1, +e.target.value) })}
                  className="w-20 flex-shrink-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-center bg-white focus:outline-none focus:border-blue-400" />
                <button onClick={() => quitarLinea(i)} className="text-gray-300 hover:text-red-500 flex-shrink-0" aria-label="Quitar">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setLineas(ls => [...ls, { producto_id: '', cantidad: 1 }])}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 text-xs font-medium hover:bg-gray-50 transition">
            + Agregar producto
          </button>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
          {resumen.nProds
            ? <><strong>{resumen.nProds}</strong> producto{resumen.nProds !== 1 ? 's' : ''} · <strong>{resumen.total}</strong> unidades · {nombreBodega(origenId)} → {nombreBodega(destinoId)}</>
            : 'Selecciona productos para ver el resumen'}
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <label className="text-xs font-medium text-gray-600 block mb-1">Motivo / Notas (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
            placeholder="Ej: Reposición por quiebre de stock…"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 resize-none" />
        </div>

        {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}

        <div className="px-5 py-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">El stock se actualiza automáticamente</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button onClick={confirmar} disabled={guardando}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Confirmar traslado'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', traslado: 'Traslado',
}

const TIPO_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  entrada: {
    bg: 'bg-[#EAF3DE]', text: 'text-[#27500A]',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-4-4m4 4l4-4" /></svg>,
  },
  salida: {
    bg: 'bg-[#FCEBEB]', text: 'text-[#791F1F]',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-4 4m4-4l4 4" /></svg>,
  },
  ajuste: {
    bg: 'bg-[#FAEEDA]', text: 'text-[#633806]',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
  },
  traslado: {
    bg: 'bg-[#E6F1FB]', text: 'text-[#0C447C]',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  },
}

// ── Motivo del movimiento (se deduce del tipo + la referencia) ──
const ICO = 'w-4 h-4 flex-shrink-0'
const MOTIVO_ICON = {
  venta: <svg className={`${ICO} text-[#185FA5]`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  compra: <svg className={`${ICO} text-[#0F6E56]`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM3 5h11v9H3V5zm11 3h4l3 3v3h-7V8z" /></svg>,
  ajuste: <svg className={`${ICO} text-[#854F0B]`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
  traslado: <svg className={`${ICO} text-[#0C447C]`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  reparacion: <svg className={`${ICO} text-[#534AB7]`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M11.4 15.2L17.3 21a2.7 2.7 0 003.7-3.7l-5.9-5.9M11.4 15.2l2.5-3c.3-.4.7-.6 1.2-.8M11.4 15.2l-4.7 5.7a2.5 2.5 0 11-3.6-3.6l6.9-5.6m5.1-.2c.6-.2 1.2-.2 1.8-.1a4.5 4.5 0 004.5-6.3l-3.3 3.3a3 3 0 01-2.3-2.3l3.3-3.3a4.5 4.5 0 00-6.3 4.5c.1 1.1-.1 2.3-.9 3l-.1.1" /></svg>,
  generico: <svg className={`${ICO} text-gray-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" /></svg>,
}

function motivoDe(m: Movimiento): { label: string; icon: React.ReactNode } {
  const ref = (m.referencia ?? '').toUpperCase()
  if (ref.startsWith('VTA-'))  return { label: 'Venta',                icon: MOTIVO_ICON.venta }
  if (ref.startsWith('OC-'))   return { label: 'Ingreso por compra',   icon: MOTIVO_ICON.compra }
  if (m.tipo === 'ajuste')     return { label: 'Ajuste de stock',      icon: MOTIVO_ICON.ajuste }
  if (m.tipo === 'traslado')   return { label: 'Traslado',             icon: MOTIVO_ICON.traslado }
  if (m.tipo === 'salida')     return { label: 'Consumo en reparación', icon: MOTIVO_ICON.reparacion }
  if (m.tipo === 'entrada')    return { label: 'Ingreso de stock',     icon: MOTIVO_ICON.compra }
  return { label: TIPO_LABEL[m.tipo] ?? m.tipo, icon: MOTIVO_ICON.generico }
}

// ── Tarjeta de movimiento (móvil) ──
const CARD_MAX = 3

function MovimientoCard({ m }: { m: Movimiento }) {
  const [expanded, setExpanded] = useState(false)
  const estilo = TIPO_STYLE[m.tipo]
  const motivo = motivoDe(m)
  const prods = m.productos ?? []
  const visibles = expanded ? prods : prods.slice(0, CARD_MAX)
  const resto = prods.length - CARD_MAX

  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3.5 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${estilo?.bg ?? 'bg-gray-100'} ${estilo?.text ?? 'text-gray-600'}`}>
          {estilo?.icon}
          {TIPO_LABEL[m.tipo] ?? m.tipo}
        </span>
        <span className="text-[12px] text-gray-400">
          {m.fecha}{m.hora ? ` · ${m.hora}` : ''}
        </span>
      </div>

      <div className="space-y-0.5">
        {visibles.map((p, i) => (
          <p key={i} className="text-sm text-gray-800 leading-snug">
            {p.producto_nombre}
            <span className="text-gray-400 ml-1.5">×{p.cantidad}</span>
          </p>
        ))}
      </div>

      {resto > 0 && (
        <button onClick={() => setExpanded(v => !v)}
          className="w-full text-center text-[12.5px] font-medium rounded-lg py-1.5 mt-2 transition"
          style={{ background: '#f2f2f7', color: expanded ? '#6b7280' : '#3656e6' }}>
          {expanded ? 'Ver menos' : `Ver ${resto} producto${resto !== 1 ? 's' : ''} más`}
        </button>
      )}

      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
        {motivo.icon}
        <span className="text-[12.5px] text-gray-600 min-w-0">
          {motivo.label}
          {prods.length > 1 && <span className="text-gray-400"> · {prods.length} productos</span>}
        </span>
        {m.referencia && (
          <span className="text-[11px] text-gray-400 font-mono ml-auto flex-shrink-0">{m.referencia}</span>
        )}
      </div>
    </div>
  )
}

const PILLS_MAX = 3

function ProductoPills({ productos }: { productos: { producto_nombre?: string; cantidad: number }[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? productos : productos.slice(0, PILLS_MAX)
  const resto = productos.length - PILLS_MAX

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((p, i) => (
        <span key={i} className="inline-flex items-center text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5 whitespace-nowrap">
          {p.producto_nombre}
          <span className="text-gray-400 ml-1.5">×{p.cantidad}</span>
        </span>
      ))}
      {!expanded && resto > 0 && (
        <button onClick={() => setExpanded(true)}
          className="text-[11px] text-blue-600 border border-blue-200 bg-blue-50 rounded-md px-2 py-0.5 hover:bg-blue-100 transition">
          +{resto} más
        </button>
      )}
      {expanded && productos.length > PILLS_MAX && (
        <button onClick={() => setExpanded(false)}
          className="text-[11px] text-gray-400 border border-gray-200 rounded-md px-2 py-0.5 hover:bg-gray-100 transition">
          Ver menos
        </button>
      )}
    </div>
  )
}

export function MovimientosTab() {
  const { data: movimientos, isLoading } = useMovimientos()
  const guardarMovimientos = useGuardarMovimientos()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [modalTraslado, setModalTraslado] = useState(false)

  // Corrige automáticamente referencias históricas con prefijo duplicado (OC-OC- → OC-)
  useEffect(() => {
    if (!movimientos?.length) return
    const necesitaFix = movimientos.some(m => m.referencia?.startsWith('OC-OC-'))
    if (!necesitaFix) return
    const corregidos = movimientos.map(m => ({
      ...m,
      referencia: m.referencia?.startsWith('OC-OC-')
        ? m.referencia.replace('OC-OC-', 'OC-')
        : m.referencia,
    }))
    void guardarMovimientos.mutateAsync(corregidos)
  }, [movimientos]) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    let r = movimientos ?? []
    if (filtroTipo) r = r.filter((m) => m.tipo === filtroTipo)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter((m) =>
        m.referencia?.toLowerCase().includes(q) ||
        m.notas?.toLowerCase().includes(q) ||
        m.productos.some((p) => p.producto_nombre?.toLowerCase().includes(q))
      )
    }
    return r
  }, [movimientos, filtroTipo, busqueda])

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, referencia..."
            className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
          className="text-base md:text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400 text-gray-600">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => setModalTraslado(true)}
          className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Nuevo traslado
        </button>
      </div>

      {modalTraslado && <ModalTraslado onClose={() => setModalTraslado(false)} />}

      {lista.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100">
          <p className="text-center text-sm text-gray-400 py-16">Sin movimientos registrados</p>
        </div>
      )}

      {/* Tarjetas — móvil */}
      {lista.length > 0 && (
        <div className="md:hidden flex flex-col gap-2">
          {lista.map((m) => <MovimientoCard key={m.id} m={m} />)}
        </div>
      )}

      {/* Tabla — escritorio */}
      {lista.length > 0 && (
        <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '130px' }} />
              <col style={{ width: '90px' }} />
              <col />
              <col style={{ width: '120px' }} />
              <col style={{ width: '150px' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Productos</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Referencia</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const estilo = TIPO_STYLE[m.tipo]
                return (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <div className="text-[13px] text-gray-700">{m.fecha}</div>
                      {m.hora && <div className="text-[11px] text-gray-400 mt-0.5">{m.hora}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md ${estilo?.bg ?? 'bg-gray-100'} ${estilo?.text ?? 'text-gray-600'}`}>
                        {estilo?.icon}
                        {TIPO_LABEL[m.tipo] ?? m.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ProductoPills productos={m.productos} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-[12px] text-gray-500 font-mono">{m.referencia || '—'}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-[12px] text-gray-500">{m.usuario || '—'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
