import { useState, useMemo } from 'react'
import { useGastos, useCrearGasto, useActualizarGasto, useEliminarGasto, useGastoCats, useGuardarGastoCats, usePlanCuentas, useCatCuentaMap, useAsientos, useGuardarAsientos, useBodegas } from '@/lib/queries'
import { asientoDeGasto, asientoIdDeGasto, nextNumeroAsiento } from '@/lib/contabilidad'
import { GASTO_GENERAL_ID } from '@/lib/gastos'
import { Spinner } from '@/components/shared/Spinner'
import type { Gasto, GastoCat, Bodega } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function today() { return new Date().toISOString().split('T')[0] }
function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }
function mesActual() { return today().slice(0, 7) }
// Normaliza para comparar subcategorías: sin tildes, minúsculas, espacios colapsados.
function normalizar(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

function fmtFecha(f: string) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${+d} ${meses[+m - 1]} ${y}`
}

const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Crédito', 'Cheque']

export function GastosTab() {
  const { data: gastos, isLoading } = useGastos()
  const { data: bodegas } = useBodegas()
  const { data: cats } = useGastoCats()
  const crearGasto = useCrearGasto()
  const actualizarGasto = useActualizarGasto()
  const eliminarGasto = useEliminarGasto()
  const { data: planCuentas } = usePlanCuentas()
  const { data: catCuentaMap } = useCatCuentaMap()
  const { data: asientos } = useAsientos()
  const guardarAsientos = useGuardarAsientos()

  // Mantiene el asiento de partida doble de cada gasto en sincronía (crear/editar).
  async function sincronizarAsiento(gasto: Gasto) {
    const lista = asientos ?? []
    const existente = lista.find((a) => a.id === asientoIdDeGasto(gasto.id))
    const numero = existente?.numero ?? nextNumeroAsiento(lista)
    const asiento = asientoDeGasto(gasto, planCuentas ?? [], catCuentaMap ?? {}, numero)
    const actualizada = existente
      ? lista.map((a) => (a.id === asiento.id ? asiento : a))
      : [...lista, asiento]
    await guardarAsientos.mutateAsync(actualizada)
  }

  async function eliminarAsiento(gastoId: string) {
    const id = asientoIdDeGasto(gastoId)
    await guardarAsientos.mutateAsync((asientos ?? []).filter((a) => a.id !== id))
  }

  const guardarCats = useGuardarGastoCats()
  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)

  // Drag & drop de pills. `dragIdx` afecta el render (resalta el destino), así
  // que es estado real, no un ref — leerlo durante el render no está permitido para refs.
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function onDragStart(i: number) { setDragIdx(i) }
  function onDragEnter(i: number) { setDragOver(i) }
  function onDragEnd() {
    const from = dragIdx
    if (from === null || dragOver === null || from === dragOver) {
      setDragIdx(null); setDragOver(null); return
    }
    const next = [...(cats ?? [])]
    const [moved] = next.splice(from, 1)
    next.splice(dragOver, 0, moved)
    guardarCats.mutateAsync(next)
    setDragIdx(null); setDragOver(null)
  }

  const catMap = useMemo(() => {
    const m: Record<string, GastoCat> = {}
    ;(cats ?? []).forEach(c => { m[c.nombre] = c })
    return m
  }, [cats])

  // Subcategorías canónicas por categoría (forma normalizada -> nombre a mostrar),
  // derivadas de los gastos existentes. Sirve para autocompletar y unificar duplicados.
  const subcatsPorCat = useMemo(() => {
    const m: Record<string, Map<string, string>> = {}
    ;(gastos ?? []).forEach(g => {
      const sub = (g.subcategoria ?? '').trim()
      if (!sub) return
      const cat = g.categoria ?? ''
      ;(m[cat] ??= new Map())
      const n = normalizar(sub)
      if (!m[cat].has(n)) m[cat].set(n, sub)
    })
    return m
  }, [gastos])

  const lista = useMemo(() => {
    let arr = [...(gastos ?? [])].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
    if (filtroCat) arr = arr.filter(g => g.categoria === filtroCat)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      arr = arr.filter(g => g.descripcion.toLowerCase().includes(q) || (g.categoria ?? '').toLowerCase().includes(q))
    }
    return arr
  }, [gastos, filtroCat, busqueda])

  const totalMes = useMemo(() =>
    (gastos ?? []).filter(g => g.fecha?.startsWith(mesActual())).reduce((s, g) => s + (+g.monto || 0), 0),
    [gastos]
  )
  const totalMostrado = lista.reduce((s, g) => s + (+g.monto || 0), 0)

  // Agrupar por fecha
  const grupos = useMemo(() => {
    const m: Record<string, Gasto[]> = {}
    lista.forEach(g => {
      const f = g.fecha || 'sin-fecha'
      if (!m[f]) m[f] = []
      m[f].push(g)
    })
    return Object.entries(m)
  }, [lista])

  // Resumen por categoría → subcategoría (unificando variantes por normalización).
  // Respeta la búsqueda pero muestra todas las categorías (independiente del pill).
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const resumen = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const base = (gastos ?? []).filter(g => !q ||
      g.descripcion.toLowerCase().includes(q) ||
      (g.categoria ?? '').toLowerCase().includes(q) ||
      (g.subcategoria ?? '').toLowerCase().includes(q))
    const byCat: Record<string, { total: number; subs: Record<string, { nombre: string; monto: number }> }> = {}
    base.forEach(g => {
      const cat = g.categoria || 'Sin categoría'
      const monto = +g.monto || 0
      ;(byCat[cat] ??= { total: 0, subs: {} })
      byCat[cat].total += monto
      const raw = (g.subcategoria ?? '').trim()
      const key = raw ? normalizar(raw) : '__none__'
      const nombre = raw || 'Sin subcategoría'
      ;(byCat[cat].subs[key] ??= { nombre, monto: 0 }).monto += monto
    })
    return Object.entries(byCat)
      .map(([cat, d]) => ({ cat, total: d.total, subs: Object.values(d.subs).sort((a, b) => b.monto - a.monto) }))
      .sort((a, b) => b.total - a.total)
  }, [gastos, busqueda])

  async function eliminar(g: Gasto) {
    if (!confirm(`¿Eliminar "${g.descripcion}"?`)) return
    await eliminarGasto.mutateAsync(g.id)
    await eliminarAsiento(g.id)
  }

  function abrirNuevo() { setEditando(null); setModalOpen(true) }
  function abrirEditar(g: Gasto) { setEditando(g); setModalOpen(true) }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Gasto del mes</p>
          <p className="text-2xl font-extrabold text-gray-900">{fmt(totalMes)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Total registros</p>
          <p className="text-2xl font-extrabold text-gray-900">{(gastos ?? []).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Mostrando</p>
          <p className="text-2xl font-extrabold text-gray-900">{fmt(totalMostrado)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar gasto..."
            className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={abrirNuevo}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo gasto
        </button>
      </div>

      {/* Resumen por categoría (expandible) */}
      {resumen.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">Resumen por categoría</h3>
            <p className="text-xs text-gray-400">Clic en una categoría para ver el desglose por subcategoría</p>
          </div>
          {resumen.map(r => {
            const abierta = expandidas.has(r.cat)
            const color = catMap[r.cat]?.color ?? '#9ca3af'
            return (
              <div key={r.cat} className="border-b border-gray-50 last:border-b-0">
                <button
                  onClick={() => setExpandidas(prev => {
                    const n = new Set(prev)
                    if (n.has(r.cat)) n.delete(r.cat); else n.add(r.cat)
                    return n
                  })}
                  className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50 transition text-left">
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${abierta ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-sm font-bold text-gray-800">{r.cat}</span>
                  <span className="ml-auto text-sm font-extrabold text-gray-900">{fmt(r.total)}</span>
                </button>
                {abierta && (
                  <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 pl-11 space-y-3">
                    {r.subs.map((s, i) => {
                      const pct = r.total > 0 ? Math.round((s.monto / r.total) * 100) : 0
                      return (
                        <div key={i}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-gray-700">{s.nombre}</span>
                            <span className="text-xs text-gray-400">{pct}%</span>
                            <span className="ml-auto text-sm font-bold text-gray-800">{fmt(s.monto)}</span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded overflow-hidden">
                            <div className="h-1.5 rounded" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pills de categorías (arrastrables) */}
      {(cats ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFiltroCat(null)}
            className={['px-3 py-1 rounded-full text-xs font-semibold border transition',
              filtroCat === null ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'].join(' ')}>
            Todas
          </button>
          {(cats ?? []).map((c, i) => (
            <button
              key={c.id}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragEnter={() => onDragEnter(i)}
              onDragOver={e => e.preventDefault()}
              onDragEnd={onDragEnd}
              onClick={() => setFiltroCat(filtroCat === c.nombre ? null : c.nombre)}
              className={['px-3 py-1 rounded-full text-xs font-semibold border transition flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none',
                filtroCat === c.nombre ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
                dragOver === i && dragIdx !== i ? 'ring-2 ring-offset-1 ring-blue-400 scale-105' : '',
              ].join(' ')}
              style={filtroCat === c.nombre ? { background: c.color, borderColor: c.color } : {}}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Lista agrupada por fecha */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {grupos.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">
            {busqueda || filtroCat ? 'Sin resultados' : 'No hay gastos registrados'}
          </p>
        ) : (
          <>
            {grupos.map(([fecha, rows]) => (
              <div key={fecha}>
                <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{fmtFecha(fecha)}</span>
                  <span className="text-xs font-bold text-gray-700">{fmt(rows.reduce((s, g) => s + (+g.monto || 0), 0))}</span>
                </div>
                {rows.map(g => {
                  const cat = catMap[g.categoria ?? '']
                  return (
                    <div key={g.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                        style={{ background: cat ? cat.color + '22' : '#f3f4f6' }}>
                        <span className="text-sm" style={{ color: cat?.color ?? '#9ca3af' }}>●</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: cat?.color ?? '#6b7280' }}>{g.categoria ?? 'Sin categoría'}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {g.descripcion && <span>{g.descripcion}</span>}
                          {g.subcategoria && <span className="ml-1 text-gray-300">· {g.subcategoria}</span>}
                          {g.metodo && <span className="ml-1 text-gray-300">· {g.metodo}</span>}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 flex-shrink-0">{fmt(+g.monto || 0)}</p>
                      <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => abrirEditar(g)} className="text-xs text-blue-600 hover:underline font-medium px-1">Editar</button>
                        <button onClick={() => eliminar(g)} className="text-xs text-red-500 hover:underline font-medium px-1">Eliminar</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            <div className="flex justify-end items-center gap-2 px-4 py-3 border-t border-gray-100">
              <span className="text-xs font-bold text-gray-400 uppercase">Total mostrado</span>
              <span className="text-base font-extrabold text-gray-900">{fmt(totalMostrado)}</span>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <GastoModal
          cats={cats ?? []}
          bodegas={bodegas ?? []}
          gasto={editando}
          subcatsPorCat={subcatsPorCat}
          onClose={() => setModalOpen(false)}
          onGuardar={async (g) => {
            const guardado = g.id ? g : { ...g, id: uid() }
            if (g.id) {
              await actualizarGasto.mutateAsync(guardado)
            } else {
              await crearGasto.mutateAsync(guardado)
            }
            await sincronizarAsiento(guardado)
          }}
        />
      )}
    </div>
  )
}

function GastoModal({ cats, bodegas, gasto, subcatsPorCat, onClose, onGuardar }: {
  cats: GastoCat[]
  bodegas: Bodega[]
  gasto: Gasto | null
  subcatsPorCat: Record<string, Map<string, string>>
  onClose: () => void
  onGuardar: (g: Gasto) => Promise<void>
}) {
  const [monto, setMonto] = useState(gasto?.monto?.toString() ?? '')
  const [descripcion, setDescripcion] = useState(gasto?.descripcion ?? '')
  const [categoria, setCategoria] = useState(gasto?.categoria ?? (cats[0]?.nombre ?? ''))
  const [subcategoria, setSubcategoria] = useState(gasto?.subcategoria ?? '')
  const [subOpen, setSubOpen] = useState(false)
  const [metodo, setMetodo] = useState(gasto?.metodo ?? 'Efectivo')
  const [bodegaId, setBodegaId] = useState(gasto?.bodega_id ?? '')
  const [fecha, setFecha] = useState(gasto?.fecha ?? today())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Nombre canónico si coincide con una subcategoría existente (unifica variantes).
  const canonMap = subcatsPorCat[categoria]
  const subCanonica = subcategoria.trim() ? (canonMap?.get(normalizar(subcategoria)) ?? subcategoria.trim()) : undefined
  const seUnifica = !!subcategoria.trim() && !!subCanonica && subCanonica !== subcategoria.trim()
  const subSugerencias = useMemo(() => {
    const todas = canonMap ? [...canonMap.values()] : []
    const q = normalizar(subcategoria)
    return (q ? todas.filter(s => normalizar(s).includes(q)) : todas).slice(0, 8)
  }, [canonMap, subcategoria])

  async function handleGuardar() {
    if (!monto || +monto <= 0) { setError('Ingresa un monto válido'); return }
    if (!descripcion.trim()) { setError('Agrega una descripción'); return }
    if (!bodegaId) { setError('Elige a qué sucursal corresponde este gasto'); return }
    setError(''); setGuardando(true)
    const bodega = bodegas.find(b => b.id === bodegaId)
    await onGuardar({
      id: gasto?.id ?? '',
      fecha,
      descripcion: descripcion.trim(),
      monto: +monto,
      categoria,
      subcategoria: subCanonica,
      metodo,
      bodega_id: bodegaId,
      bodega_nombre: bodegaId === GASTO_GENERAL_ID ? 'General / Compartido' : (bodega?.nombre ?? bodega?.name),
    })
    setGuardando(false)
    onClose()
  }

  const montoFmt = monto ? `$${(+monto || 0).toLocaleString('es-CL')}` : '$0'

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              {gasto ? 'Editar gasto' : 'Nuevo gasto'}
            </p>
            <p className="text-2xl font-semibold text-gray-900 leading-none">{montoFmt}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">

          {/* Fila 1: Monto + Descripción */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">$</span>
                <input
                  type="number" value={monto} onChange={e => setMonto(e.target.value)}
                  autoFocus placeholder="0"
                  className="w-full pl-7 pr-12 py-2 border border-gray-200 rounded-lg text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  onKeyDown={e => e.key === 'Enter' && handleGuardar()}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-300 pointer-events-none">CLP</span>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Descripción</label>
              <input type="text" value={descripcion}
                onChange={e => { const v = e.target.value; setDescripcion(v.charAt(0).toUpperCase() + v.slice(1)) }}
                placeholder="Ej: Agua y luz de octubre"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition" />
            </div>
          </div>

          {/* Categorías */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">Categoría</label>
            <div className="flex flex-wrap gap-1.5">
              {cats.map(c => {
                const sel = categoria === c.nombre
                return (
                  <button key={c.id} type="button" onClick={() => setCategoria(c.nombre)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition border"
                    style={sel
                      ? { borderColor: c.color, background: c.color, color: '#fff' }
                      : { borderColor: '#e5e7eb', background: '#f9fafb', color: '#6b7280' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: sel ? 'rgba(255,255,255,0.7)' : c.color }} />
                    {c.nombre}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sucursal (obligatorio, para separar utilidad por sucursal) */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Sucursal</label>
            <select value={bodegaId} onChange={e => setBodegaId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition">
              <option value="">-- Elegir sucursal --</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
              <option value={GASTO_GENERAL_ID}>General / Compartido (se reparte entre sucursales)</option>
            </select>
          </div>

          {/* Fila 2: Subcategoría + Método + Fecha */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Subcategoría <span className="normal-case font-normal text-gray-300">(opcional)</span>
              </label>
              <div className="relative">
                <input type="text" value={subcategoria}
                  onChange={e => { const v = e.target.value; setSubcategoria(v.charAt(0).toUpperCase() + v.slice(1)); setSubOpen(true) }}
                  onFocus={() => setSubOpen(true)}
                  onBlur={() => setTimeout(() => setSubOpen(false), 180)}
                  placeholder="Ej: Candela, Sucursal Centro…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition" />
                {subOpen && subSugerencias.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {subSugerencias.map((s, i) => (
                      <button key={s} type="button" onMouseDown={() => { setSubcategoria(s); setSubOpen(false) }}
                        className={['w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition',
                          s === subCanonica ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50',
                          i > 0 ? 'border-t border-gray-50' : ''].join(' ')}>
                        {s === subCanonica && (
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {seUnifica && (
                <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Se unificará con "{subCanonica}"
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Método</label>
                <select value={metodo} onChange={e => setMetodo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition">
                  {METODOS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  onClick={e => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition cursor-pointer" />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {guardando ? 'Guardando…' : gasto ? 'Guardar cambios' : 'Registrar gasto'}
          </button>
        </div>

      </div>
    </div>
  )
}
