import { useMemo, useState } from 'react'
import {
  useCancelarTrasladoInterno,
  useCrearTrasladoInterno,
  useOrdenesLite,
  useRecibirTrasladoInterno,
  useTrasladosInternos,
  type OrdenLista,
} from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { Bodega, TrasladoInternoOrden } from '@/types'

function nombreBodega(bodega: Bodega | undefined) {
  return bodega?.nombre ?? bodega?.name ?? 'Sucursal'
}

function fechaHora(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function mensajeError(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : fallback
}

export function TrasladoInternoModal({ orden, bodegas, onClose }: {
  orden: OrdenLista
  bodegas: Bodega[]
  onClose: () => void
}) {
  const crear = useCrearTrasladoInterno()
  const [destinoId, setDestinoId] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const origen = bodegas.find(b => b.id === orden.branchId)
  const destinos = bodegas.filter(b => b.id !== orden.branchId && b.activo !== false)

  async function confirmar() {
    if (!destinoId) return
    setError('')
    try {
      await crear.mutateAsync({ ordenId: orden.id, destinoId, nota })
      onClose()
    } catch (e) {
      setError(mensajeError(e, 'No se pudo iniciar el traslado.'))
    }
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-4"
      onClick={e => { if (e.target === e.currentTarget && !crear.isPending) onClose() }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Trasladar orden #{orden.num}</h3>
            <p className="mt-0.5 text-xs text-gray-400">
              {[orden.nombre, orden.apellido].filter(Boolean).join(' ')} · {orden.modelo ?? 'Equipo'}
            </p>
          </div>
          <button onClick={onClose} disabled={crear.isPending} aria-label="Cerrar"
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50">✕</button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">Sucursal actual</p>
            <p className="mt-1 text-sm font-semibold text-blue-900">{nombreBodega(origen)}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Enviar a *</label>
            <select value={destinoId} onChange={e => setDestinoId(e.target.value)} autoFocus
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base outline-none focus:border-blue-400 md:text-sm">
              <option value="">Selecciona la sucursal destino…</option>
              {destinos.map(b => <option key={b.id} value={b.id}>{nombreBodega(b)}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Nota para destino <span className="font-normal text-gray-400">(opcional)</span></label>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} maxLength={500}
              placeholder="Ej: Cliente retirará en destino, revisar cargador…"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-blue-400 md:text-sm" />
          </div>

          {destinos.length === 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Debes tener al menos dos sucursales activas para trasladar una orden.</p>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button onClick={onClose} disabled={crear.isPending}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={() => void confirmar()} disabled={!destinoId || crear.isPending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {crear.isPending ? 'Enviando…' : 'Enviar a sucursal'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OrdenResumen({ traslado, orden }: { traslado: TrasladoInternoOrden; orden?: OrdenLista }) {
  return (
    <button onClick={() => { window.location.hash = `#/taller?abrir=${encodeURIComponent(traslado.orden_num)}` }}
      className="text-left hover:underline">
      <span className="block font-mono text-sm font-bold text-blue-600">#{traslado.orden_num}</span>
      <span className="block text-xs text-gray-500">
        {orden ? [orden.nombre, orden.apellido].filter(Boolean).join(' ') : 'Ver orden'}
      </span>
      {orden?.modelo && <span className="block max-w-52 truncate text-xs text-gray-400">{orden.modelo}</span>}
    </button>
  )
}

export function TrasladosInternosTab() {
  const { data: traslados = [], isLoading, error } = useTrasladosInternos()
  const { data: ordenes = [] } = useOrdenesLite()
  const { esAdmin, branchId } = useAuth()
  const recibir = useRecibirTrasladoInterno()
  const cancelar = useCancelarTrasladoInterno()
  const [procesandoId, setProcesandoId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')

  const ordenPorId = useMemo(() => new Map(ordenes.map(o => [o.id, o])), [ordenes])
  const relevantes = useMemo(() => {
    if (esAdmin) return traslados
    if (!branchId) return []
    return traslados.filter(t => t.origen_id === branchId || t.destino_id === branchId)
  }, [traslados, esAdmin, branchId])
  const activos = relevantes.filter(t => t.estado === 'en_transito')
  const porRecibir = activos.filter(t => !!branchId && t.destino_id === branchId)
  const enviados = activos.filter(t => esAdmin || (!!branchId && t.origen_id === branchId))
  const historial = relevantes.filter(t => t.estado !== 'en_transito').slice(0, 100)

  async function confirmarRecepcion(t: TrasladoInternoOrden) {
    setProcesandoId(t.id)
    setMensaje('')
    try {
      await recibir.mutateAsync(t.id)
      setMensaje(`Orden #${t.orden_num} recibida en ${t.destino_nombre}.`)
    } catch (e) {
      setMensaje(mensajeError(e, 'No se pudo recibir la orden.'))
    } finally {
      setProcesandoId(null)
    }
  }

  async function cancelarEnvio(t: TrasladoInternoOrden) {
    if (!window.confirm(`¿Cancelar el traslado de la orden #${t.orden_num}?`)) return
    setProcesandoId(t.id)
    setMensaje('')
    try {
      await cancelar.mutateAsync(t.id)
      setMensaje(`Traslado de la orden #${t.orden_num} cancelado.`)
    } catch (e) {
      setMensaje(mensajeError(e, 'No se pudo cancelar el traslado.'))
    } finally {
      setProcesandoId(null)
    }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>

  if (error) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
      No se pudieron cargar los traslados internos. Verifica que esté aplicada la migración de Supabase.
    </div>
  )

  return (
    <div>
      <div className="mb-5">
        <h3 className="text-lg font-bold text-gray-900">Traslados entre sucursales</h3>
        <p className="mt-0.5 text-sm text-gray-500">Controla la entrega física de cada equipo sin perder su historial.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-2xl font-bold text-blue-700">{porRecibir.length}</div>
          <div className="mt-0.5 text-xs text-blue-700/70">Por recibir</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-2xl font-bold text-amber-700">{enviados.length}</div>
          <div className="mt-0.5 text-xs text-amber-700/70">En tránsito</div>
        </div>
        <div className="col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:col-span-1">
          <div className="text-2xl font-bold text-gray-700">{historial.filter(t => t.estado === 'recibido').length}</div>
          <div className="mt-0.5 text-xs text-gray-500">Recibidos</div>
        </div>
      </div>

      {mensaje && <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{mensaje}</div>}

      {!esAdmin && !branchId && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu usuario no tiene una sucursal asignada. Un administrador debe asignarla para que puedas enviar o recibir órdenes.
        </div>
      )}

      <section className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-gray-800">Por recibir</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">{porRecibir.length}</span>
        </div>
        {porRecibir.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">No hay órdenes pendientes de recepción.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {porRecibir.map(t => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-44 flex-1"><OrdenResumen traslado={t} orden={ordenPorId.get(t.orden_id)} /></div>
                <div className="min-w-40 flex-1 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{t.origen_nombre}</span> → <span className="font-medium text-gray-700">{t.destino_nombre}</span>
                  <span className="mt-1 block text-gray-400">Enviado {fechaHora(t.creado_en)}{t.enviado_por_nombre ? ` por ${t.enviado_por_nombre}` : ''}</span>
                  {t.nota && <span className="mt-1 block text-gray-600">{t.nota}</span>}
                </div>
                <button onClick={() => void confirmarRecepcion(t)} disabled={procesandoId === t.id}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {procesandoId === t.id ? 'Recibiendo…' : 'Recibir orden'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-gray-800">En tránsito</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{enviados.length}</span>
        </div>
        {enviados.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">No hay órdenes enviadas.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {enviados.map(t => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-44 flex-1"><OrdenResumen traslado={t} orden={ordenPorId.get(t.orden_id)} /></div>
                <div className="min-w-40 flex-1 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{t.origen_nombre}</span> → <span className="font-medium text-gray-700">{t.destino_nombre}</span>
                  <span className="mt-1 block text-gray-400">Esperando recepción · {fechaHora(t.creado_en)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {esAdmin && (
                    <button onClick={() => void confirmarRecepcion(t)} disabled={procesandoId === t.id}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                      Recibir
                    </button>
                  )}
                  <button onClick={() => void cancelarEnvio(t)} disabled={procesandoId === t.id}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {historial.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">Historial reciente</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr><th className="px-4 py-3">Orden</th><th className="px-4 py-3">Recorrido</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Fecha</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historial.map(t => (
                  <tr key={t.id}>
                    <td className="px-4 py-3"><OrdenResumen traslado={t} orden={ordenPorId.get(t.orden_id)} /></td>
                    <td className="px-4 py-3 text-xs text-gray-600">{t.origen_nombre} → {t.destino_nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${t.estado === 'recibido' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {t.estado === 'recibido' ? 'Recibido' : 'Cancelado'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">{fechaHora(t.recibido_en ?? t.cancelado_en ?? t.creado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
