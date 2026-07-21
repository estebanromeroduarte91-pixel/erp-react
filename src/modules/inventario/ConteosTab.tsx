import { useState, useMemo } from 'react'
import { useBodegas, useBuscarProductos, useConteos, useGuardarConteos, useFijarStock } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { ConteoInventario, ConteoItem, Producto } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function today() { return new Date().toISOString().split('T')[0] }

function fmtFecha(f: string) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${+d} ${meses[+m - 1]} ${y}`
}

// Fila contada, antes de confirmar. `sistema` se vuelve a leer al confirmar,
// por si alguien vendió mientras se hacía el conteo.
type Fila = { producto: Producto; contado: number }

export function ConteosTab() {
  const { data: bodegas = [] } = useBodegas()
  const { data: conteos = [], isLoading } = useConteos()
  const guardarConteos = useGuardarConteos()
  const fijarStock = useFijarStock()
  const { nombre: nombreUsuario } = useAuth()

  const [enCurso, setEnCurso] = useState(false)
  const [bodegaId, setBodegaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filas, setFilas] = useState<Fila[]>([])
  const [guardando, setGuardando] = useState(false)
  const [detalle, setDetalle] = useState<ConteoInventario | null>(null)

  const { data: resultados = [], isFetching } = useBuscarProductos(busqueda)
  const bodega = bodegas.find(b => b.id === bodegaId)

  const yaContados = useMemo(() => new Set(filas.map(f => f.producto.id)), [filas])
  const sugerencias = resultados.filter(p => p.tipo !== 'servicio' && !yaContados.has(p.id))

  const conDiferencia = filas.filter(f => f.contado !== (f.producto.stock_sucursales?.[bodegaId] ?? 0))

  function iniciar() {
    if (!bodegaId) return
    setFilas([]); setBusqueda(''); setEnCurso(true)
  }

  function agregar(p: Producto) {
    setFilas(f => [{ producto: p, contado: 0 }, ...f])
    setBusqueda('')
  }

  function setContado(id: string, v: string) {
    const n = Math.max(0, parseInt(v, 10) || 0)
    setFilas(f => f.map(x => x.producto.id === id ? { ...x, contado: n } : x))
  }

  function quitar(id: string) {
    setFilas(f => f.filter(x => x.producto.id !== id))
  }

  async function confirmar() {
    if (!filas.length || !bodega) return
    if (!confirm(`Se ajustará el stock de ${conDiferencia.length} producto(s) en ${bodega.nombre ?? bodega.name}. ¿Continuar?`)) return
    setGuardando(true)
    try {
      const items: ConteoItem[] = filas.map(f => {
        const sistema = f.producto.stock_sucursales?.[bodegaId] ?? 0
        return {
          producto_id: f.producto.id,
          producto_nombre: f.producto.nombre,
          sku: f.producto.sku,
          sistema,
          contado: f.contado,
          diferencia: f.contado - sistema,
        }
      })
      // Ajusta solo lo que realmente cambió. fijarStock reconcilia además los lotes FIFO.
      for (const it of items) {
        if (it.diferencia === 0) continue
        await fijarStock.mutateAsync({ producto_id: it.producto_id, bodega_id: bodegaId, cantidad: it.contado })
      }
      const conteo: ConteoInventario = {
        id: uid(),
        fecha: today(),
        bodega_id: bodegaId,
        bodega_nombre: bodega.nombre ?? bodega.name ?? '',
        usuario: nombreUsuario || '—',
        items,
        creado_en: new Date().toISOString(),
      }
      await guardarConteos.mutateAsync([conteo, ...conteos])
      setEnCurso(false); setFilas([])
    } finally {
      setGuardando(false)
    }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  // ── Conteo en curso ────────────────────────────────────────
  if (enCurso) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs text-gray-400">Contando en</p>
              <p className="text-sm font-semibold text-gray-900">{bodega?.nombre ?? bodega?.name}</p>
            </div>
            <button onClick={() => { if (!filas.length || confirm('¿Descartar el conteo?')) { setEnCurso(false); setFilas([]) } }}
              className="text-xs font-medium text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              Cancelar
            </button>
          </div>

          <div className="relative">
            <input
              autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto por nombre o SKU…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
            />
            {busqueda.trim() && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                {isFetching && <div className="px-4 py-3 text-xs text-gray-400">Buscando…</div>}
                {!isFetching && sugerencias.length === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-400">Sin resultados</div>
                )}
                {sugerencias.map(p => (
                  <button key={p.id} onClick={() => agregar(p)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                    <p className="text-sm font-medium text-gray-800">{p.nombre}</p>
                    <p className="text-xs text-gray-400">
                      {p.sku ?? 'Sin SKU'} · sistema: {p.stock_sucursales?.[bodegaId] ?? 0}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lista contada */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {filas.length} contado{filas.length !== 1 ? 's' : ''}
            </span>
            {conDiferencia.length > 0 && (
              <span className="text-xs font-semibold text-amber-700">{conDiferencia.length} con diferencia</span>
            )}
          </div>

          {filas.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10 px-4">
              Busca un producto arriba y anota cuántas unidades hay realmente.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {filas.map(f => {
                const sistema = f.producto.stock_sucursales?.[bodegaId] ?? 0
                const dif = f.contado - sistema
                return (
                  <div key={f.producto.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{f.producto.nombre}</p>
                      <p className="text-xs text-gray-400">
                        {f.producto.sku ?? 'Sin SKU'} · sistema: {sistema}
                      </p>
                    </div>
                    <input
                      type="number" min="0" inputMode="numeric"
                      value={f.contado}
                      onChange={e => setContado(f.producto.id, e.target.value)}
                      onFocus={e => e.currentTarget.select()}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-base md:text-sm text-right bg-gray-50 focus:outline-none focus:border-blue-400"
                    />
                    <span className={[
                      'text-xs font-bold w-12 text-right flex-shrink-0',
                      dif === 0 ? 'text-gray-300' : dif > 0 ? 'text-green-600' : 'text-red-600',
                    ].join(' ')}>
                      {dif === 0 ? '—' : (dif > 0 ? '+' : '') + dif}
                    </span>
                    <button onClick={() => quitar(f.producto.id)}
                      className="text-gray-300 hover:text-red-500 text-lg leading-none flex-shrink-0">✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button onClick={confirmar} disabled={!filas.length || guardando}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
          {guardando ? 'Ajustando stock…' : `Confirmar conteo (${conDiferencia.length} ajuste${conDiferencia.length !== 1 ? 's' : ''})`}
        </button>
        <p className="text-xs text-gray-400 text-center pb-2">
          Ajusta el stock y deja el registro. No afecta la utilidad.
        </p>
      </div>
    )
  }

  // ── Inicio + historial ─────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-1">Nueva toma de inventario</p>
        <p className="text-xs text-gray-400 mb-3">
          Cuenta lo que hay físicamente y el sistema ajusta las diferencias, dejando registro de quién contó y qué cambió.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={bodegaId} onChange={e => setBodegaId(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
            <option value="">-- Elegir sucursal --</option>
            {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
          </select>
          <button onClick={iniciar} disabled={!bodegaId}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
            Iniciar conteo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conteos anteriores</span>
        </div>
        {conteos.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">Aún no hay conteos registrados</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {conteos.map(c => {
              const difs = c.items.filter(i => i.diferencia !== 0).length
              return (
                <button key={c.id} onClick={() => setDetalle(c)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{c.bodega_nombre}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(c.fecha)} · {c.usuario}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500">{c.items.length} producto{c.items.length !== 1 ? 's' : ''}</p>
                    <p className={`text-xs font-semibold ${difs > 0 ? 'text-amber-700' : 'text-gray-300'}`}>
                      {difs > 0 ? `${difs} con diferencia` : 'Sin diferencias'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Detalle de un conteo */}
      {detalle && (
        <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center bg-black/40 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">{detalle.bodega_nombre}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{fmtFecha(detalle.fecha)} · contó {detalle.usuario}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto divide-y divide-gray-50">
              {detalle.items.map(i => (
                <div key={i.producto_id} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{i.producto_nombre}</p>
                    <p className="text-xs text-gray-400">{i.sku ?? 'Sin SKU'}</p>
                  </div>
                  <span className="text-xs text-gray-400 w-20 text-right">{i.sistema} → {i.contado}</span>
                  <span className={[
                    'text-xs font-bold w-10 text-right',
                    i.diferencia === 0 ? 'text-gray-300' : i.diferencia > 0 ? 'text-green-600' : 'text-red-600',
                  ].join(' ')}>
                    {i.diferencia === 0 ? '—' : (i.diferencia > 0 ? '+' : '') + i.diferencia}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
