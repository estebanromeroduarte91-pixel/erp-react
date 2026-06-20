import { useState, useMemo } from 'react'
import { useGastos, useGuardarGastos, useGastoCats } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Gasto, GastoCat } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function today() { return new Date().toISOString().split('T')[0] }
function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }
function mesActual() { return today().slice(0, 7) }

function fmtFecha(f: string) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${+d} ${meses[+m - 1]} ${y}`
}

const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Crédito', 'Cheque']

export function GastosTab() {
  const { data: gastos, isLoading } = useGastos()
  const { data: cats } = useGastoCats()
  const guardar = useGuardarGastos()

  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)

  const catMap = useMemo(() => {
    const m: Record<string, GastoCat> = {}
    ;(cats ?? []).forEach(c => { m[c.nombre] = c })
    return m
  }, [cats])

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

  async function eliminar(g: Gasto) {
    if (!confirm(`¿Eliminar "${g.descripcion}"?`)) return
    await guardar.mutateAsync((gastos ?? []).filter(x => x.id !== g.id))
  }

  function abrirNuevo() { setEditando(null); setModalOpen(true) }
  function abrirEditar(g: Gasto) { setEditando(g); setModalOpen(true) }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-5">
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
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={abrirNuevo}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo gasto
        </button>
      </div>

      {/* Pills de categorías */}
      {(cats ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFiltroCat(null)}
            className={['px-3 py-1 rounded-full text-xs font-semibold border transition',
              filtroCat === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'].join(' ')}>
            Todas
          </button>
          {(cats ?? []).map(c => (
            <button
              key={c.id}
              onClick={() => setFiltroCat(filtroCat === c.nombre ? null : c.nombre)}
              className={['px-3 py-1 rounded-full text-xs font-semibold border transition flex items-center gap-1.5',
                filtroCat === c.nombre ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'].join(' ')}
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
                        <p className="text-sm font-semibold text-gray-800 truncate">{g.descripcion || '—'}</p>
                        <p className="text-xs text-gray-400">
                          <span style={{ color: cat?.color ?? '#9ca3af' }}>{g.categoria ?? 'Sin categoría'}</span>
                          {g.metodo && <span className="ml-1 text-gray-300">· {g.metodo}</span>}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 flex-shrink-0">{fmt(+g.monto || 0)}</p>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
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
          gasto={editando}
          onClose={() => setModalOpen(false)}
          onGuardar={async (g) => {
            const lista2 = gastos ?? []
            if (g.id) {
              await guardar.mutateAsync(lista2.map(x => x.id === g.id ? g : x))
            } else {
              await guardar.mutateAsync([...lista2, { ...g, id: uid() }])
            }
          }}
        />
      )}
    </div>
  )
}

function GastoModal({ cats, gasto, onClose, onGuardar }: {
  cats: GastoCat[]
  gasto: Gasto | null
  onClose: () => void
  onGuardar: (g: Gasto) => Promise<void>
}) {
  const [monto, setMonto] = useState(gasto?.monto?.toString() ?? '')
  const [descripcion, setDescripcion] = useState(gasto?.descripcion ?? '')
  const [categoria, setCategoria] = useState(gasto?.categoria ?? (cats[0]?.nombre ?? ''))
  const [metodo, setMetodo] = useState(gasto?.metodo ?? 'Efectivo')
  const [fecha, setFecha] = useState(gasto?.fecha ?? today())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function handleGuardar() {
    if (!monto || +monto <= 0) { setError('Ingresa un monto válido'); return }
    if (!descripcion.trim()) { setError('Agrega una descripción'); return }
    setError(''); setGuardando(true)
    await onGuardar({
      id: gasto?.id ?? '',
      fecha,
      descripcion: descripcion.trim(),
      monto: +monto,
      categoria,
      metodo,
    })
    setGuardando(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{gasto ? 'Editar gasto' : 'Nuevo gasto'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Monto */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">¿Cuánto?</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-300">$</span>
              <input
                type="number" value={monto} onChange={e => setMonto(e.target.value)}
                autoFocus placeholder="0"
                className="w-full pl-9 pr-3 py-3 text-3xl font-extrabold border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-400"
                onKeyDown={e => e.key === 'Enter' && handleGuardar()}
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Descripción</label>
            <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Agua y luz de octubre"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>

          {/* Categorías */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-2">Categoría</label>
            <div className="grid grid-cols-5 gap-2">
              {cats.map(c => (
                <button key={c.id} type="button" onClick={() => setCategoria(c.nombre)}
                  className={['flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition text-center',
                    categoria === c.nombre ? 'border-transparent' : 'border-gray-100 bg-gray-50 hover:border-gray-200'].join(' ')}
                  style={categoria === c.nombre ? { borderColor: c.color, background: c.color + '18' } : {}}>
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: c.color + '22', color: c.color }}>●</span>
                  <span className="text-xs font-semibold leading-tight" style={{ color: categoria === c.nombre ? c.color : '#64748b' }}>
                    {c.nombre}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Método y fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Método</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                {METODOS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : gasto ? 'Guardar cambios' : 'Registrar gasto'}
          </button>
        </div>
      </div>
    </div>
  )
}
