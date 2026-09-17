import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { Orden } from '@/types'
import {
  useActualizarDeliverySolicitud, useDeliveryConfig, useDeliveryEventos, useDeliveryFotos, useDeliverySolicitudes, useOrdenesDeDelivery,
  type DeliveryCambio, type DeliveryEstado, type DeliverySolicitud,
} from './deliveryQueries'
import {
  ESTADOS, TRAMOS, codigoDelivery, direccionEntrega, fechaCorta, fechaDia, hoyIso, siguientePaso, type Tramo,
} from './delivery'

const OrdenModal = lazy(() => import('@/modules/taller/OrdenModal').then(m => ({ default: m.OrdenModal })))

type Filtro = 'activas' | Tramo | 'cancelada'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'activas', label: 'Activas' },
  { id: 'retiro', label: 'Retiro' },
  { id: 'taller', label: 'En taller' },
  { id: 'entrega', label: 'Entrega' },
  { id: 'cerrada', label: 'Entregadas' },
  { id: 'cancelada', label: 'Canceladas' },
]

function coincideFiltro(s: DeliverySolicitud, f: Filtro) {
  if (f === 'activas') return s.estado !== 'entregada' && s.estado !== 'cancelada'
  if (f === 'cancelada') return s.estado === 'cancelada'
  return ESTADOS[s.estado].tramo === f && s.estado !== 'cancelada'
}

export function DeliveryPage() {
  const { data = [], isLoading, error } = useDeliverySolicitudes()
  const { data: ordenes } = useOrdenesDeDelivery(data.map(s => s.orden_id).filter((x): x is string => !!x))
  const actualizar = useActualizarDeliverySolicitud()
  const navigate = useNavigate()
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('activas')
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null)
  const [agendando, setAgendando] = useState<{ s: DeliverySolicitud; tramo: 'retiro' | 'entrega' } | null>(null)
  const [creandoOrden, setCreandoOrden] = useState<DeliverySolicitud | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const seleccionada = data.find(s => s.id === seleccionadaId) ?? null

  function avisar(texto: string) {
    setAviso(texto)
    window.setTimeout(() => setAviso(a => (a === texto ? null : a)), 3000)
  }

  async function mover(s: DeliverySolicitud, cambio: DeliveryCambio, texto: string) {
    try {
      await actualizar.mutateAsync({ id: s.id, ...cambio })
      avisar(texto)
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo actualizar la solicitud')
    }
  }

  function ejecutarPaso(s: DeliverySolicitud) {
    const paso = siguientePaso(s.estado)
    if (!paso) return
    if (paso.accion === 'agendar_retiro') return setAgendando({ s, tramo: 'retiro' })
    if (paso.accion === 'agendar_entrega') return setAgendando({ s, tramo: 'entrega' })
    if (paso.accion === 'crear_orden') return setCreandoOrden(s)
    if (paso.accion === 'entregar_en_orden') {
      const num = s.orden_id ? ordenes?.get(s.orden_id)?.num : undefined
      if (num) return navigate(`/taller?abrir=${encodeURIComponent(num)}`)
      return void mover(s, { estado: 'entregada' }, `${codigoDelivery(s.numero)} entregada`)
    }
    void mover(s, { estado: paso.destino! }, `${codigoDelivery(s.numero)} · ${ESTADOS[paso.destino!].label}`)
  }

  const conteo = (f: Filtro) => data.filter(s => coincideFiltro(s, f)).length
  const hoy = hoyIso()

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLocaleLowerCase('es')
    return data.filter(s => {
      if (!coincideFiltro(s, filtro)) return false
      if (!q) return true
      const ot = s.orden_id ? ordenes?.get(s.orden_id)?.num : ''
      return [codigoDelivery(s.numero), s.nombre, s.apellido, s.rut, s.telefono, s.tipo_equipo, s.marca, s.modelo, s.comuna, s.direccion, ot]
        .some(v => String(v ?? '').toLocaleLowerCase('es').includes(q))
    })
  }, [data, buscar, filtro, ordenes])

  if (isLoading) return <div className="py-20 flex justify-center"><Spinner className="w-8 h-8" /></div>

  const kpis = [
    { label: 'Nuevas por contactar', valor: data.filter(s => s.estado === 'nueva').length, color: 'text-blue-600' },
    { label: 'Retiros de hoy', valor: data.filter(s => (s.estado === 'retiro_agendado' && s.fecha_preferida === hoy) || s.estado === 'en_ruta_retiro').length, color: 'text-amber-600' },
    { label: 'En taller', valor: data.filter(s => s.estado === 'en_taller').length, color: 'text-gray-900' },
    { label: 'Por entregar', valor: data.filter(s => ESTADOS[s.estado].tramo === 'entrega').length, color: 'text-red-600' },
  ]

  return (
    <div className="px-4 pt-3 pb-8 md:px-0 md:pt-0">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Delivery</h1>
        <p className="text-sm text-gray-500 mt-1">Retiro a domicilio, reparación en taller y entrega al cliente.</p>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">No se pudieron cargar las solicitudes. Recarga la página.</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {kpis.map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.valor}</div>
            <div className="text-xs text-gray-500 mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
          <div className="relative max-w-xl">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por DEL, cliente, RUT, teléfono, equipo u OT..."
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTROS.map(f => (
              <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${filtro === f.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {f.label}<span className="ml-1.5 opacity-60 tabular-nums">{conteo(f.id)}</span>
              </button>
            ))}
          </div>
        </div>

        {filtradas.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 grid place-items-center mb-3">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7h11v10H3z"/><path d="M14 10h3l4 4v3h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>
            </div>
            <p className="font-semibold text-gray-700">{data.length ? 'No hay solicitudes en este filtro' : 'Aún no hay solicitudes'}</p>
            <p className="text-sm text-gray-400 mt-1">Las solicitudes del formulario web aparecen aquí al instante.</p>
          </div>
        ) : (
          <>
            {/* Escritorio */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-semibold">Solicitud</th><th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Equipo</th><th className="px-4 py-3 font-semibold">Dirección</th>
                  <th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold text-right">Siguiente paso</th>
                </tr></thead>
                <tbody>
                  {filtradas.map(s => {
                    const info = ESTADOS[s.estado]
                    const ot = s.orden_id ? ordenes?.get(s.orden_id) : undefined
                    const paso = siguientePaso(s.estado)
                    const enEntrega = info.tramo === 'entrega' || info.tramo === 'cerrada'
                    const dir = enEntrega ? direccionEntrega(s) : { direccion: s.direccion, comuna: s.comuna }
                    const fecha = enEntrega ? s.entrega_fecha : s.fecha_preferida
                    const bloque = enEntrega ? s.entrega_bloque : s.bloque_horario
                    return (
                      <tr key={s.id} onClick={() => setSeleccionadaId(s.id)} className="border-t border-gray-100 hover:bg-gray-50/60 cursor-pointer align-top">
                        <td className="px-4 py-3"><div className="font-semibold text-blue-600 tabular-nums">{codigoDelivery(s.numero)}</div><div className="text-xs text-gray-400 mt-0.5">{fechaCorta(s.creado_en)}</div></td>
                        <td className="px-4 py-3"><div className="font-medium text-gray-800">{s.nombre} {s.apellido}</div><div className="text-xs text-gray-400 mt-0.5">{s.telefono}</div></td>
                        <td className="px-4 py-3">
                          <div className="text-gray-800">{[s.marca, s.modelo].filter(Boolean).join(' ') || s.tipo_equipo}</div>
                          <div className="text-xs text-gray-400 mt-0.5 max-w-[220px] truncate">{s.falla}</div>
                          {ot && <div className="text-xs text-gray-500 mt-0.5">OT <span className="font-semibold text-blue-600">#{ot.num}</span> · {ot.status}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-700 max-w-[220px] truncate">{dir.direccion}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{dir.comuna}{fecha ? ` · ${fechaDia(fecha)}` : ''}{bloque ? ` · ${bloque}` : ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{TRAMOS[info.tramo]}</div>
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${info.pill}`}>{info.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          {paso && (
                            <button onClick={() => ejecutarPaso(s)} disabled={actualizar.isPending}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                              {paso.label}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Celular */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtradas.map(s => {
                const info = ESTADOS[s.estado]
                const paso = siguientePaso(s.estado)
                const ot = s.orden_id ? ordenes?.get(s.orden_id) : undefined
                return (
                  <div key={s.id} className="p-4" onClick={() => setSeleccionadaId(s.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-blue-600 tabular-nums">{codigoDelivery(s.numero)}{ot ? ` · OT #${ot.num}` : ''}</div>
                        <div className="font-semibold text-gray-900 truncate">{s.nombre} {s.apellido}</div>
                        <div className="text-xs text-gray-500 truncate">{[s.marca, s.modelo].filter(Boolean).join(' ') || s.tipo_equipo} · {s.comuna}</div>
                      </div>
                      <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${info.pill}`}>{info.label}</span>
                    </div>
                    {paso && (
                      <button onClick={e => { e.stopPropagation(); ejecutarPaso(s) }} disabled={actualizar.isPending}
                        className="mt-3 w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                        {paso.label}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {seleccionada && (
        <DetalleSolicitud
          solicitud={seleccionada}
          orden={seleccionada.orden_id ? ordenes?.get(seleccionada.orden_id) : undefined}
          onClose={() => setSeleccionadaId(null)}
          onPaso={() => ejecutarPaso(seleccionada)}
          onMover={(cambio, texto) => mover(seleccionada, cambio, texto)}
          onAbrirOrden={num => navigate(`/taller?abrir=${encodeURIComponent(num)}`)}
        />
      )}

      {agendando && (
        <AgendarModal
          solicitud={agendando.s}
          tramo={agendando.tramo}
          onClose={() => setAgendando(null)}
          onGuardar={async cambio => {
            await mover(agendando.s, cambio, agendando.tramo === 'retiro' ? 'Retiro agendado' : 'Entrega agendada')
            setAgendando(null)
          }}
        />
      )}

      {creandoOrden && (
        <Suspense fallback={<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30"><Spinner className="w-8 h-8" /></div>}>
          <OrdenModal
            orden={null}
            ordenes={[]}
            onClose={() => setCreandoOrden(null)}
            prefill={{
              nombre: creandoOrden.nombre,
              apellido: creandoOrden.apellido,
              rut: creandoOrden.rut,
              tel: creandoOrden.telefono,
              email: creandoOrden.email ?? '',
              modelo: [creandoOrden.marca, creandoOrden.modelo].filter(Boolean).join(' ') || creandoOrden.tipo_equipo,
              trabajo: `${creandoOrden.falla}\n\nIngreso por Delivery ${codigoDelivery(creandoOrden.numero)}`,
            }}
            onCreated={async (orden: Orden) => {
              // La orden ya quedó creada: si el enlace falla no se relanza el
              // error, para que el modal no permita guardarla dos veces.
              try {
                await actualizar.mutateAsync({ id: creandoOrden.id, orden_id: orden.id, estado: 'en_taller' })
                avisar(`Orden #${orden.num} creada y enlazada a ${codigoDelivery(creandoOrden.numero)}`)
              } catch (e) {
                avisar(`Orden #${orden.num} creada, pero no se pudo enlazar: ${e instanceof Error ? e.message : 'error desconocido'}`)
              }
            }}
          />
        </Suspense>
      )}

      {aviso && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[400] bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-[90vw]">
          {aviso}
        </div>
      )}
    </div>
  )
}

// ── Agendar retiro o entrega ─────────────────────────────────────────────────
function AgendarModal({ solicitud, tramo, onClose, onGuardar }: {
  solicitud: DeliverySolicitud
  tramo: 'retiro' | 'entrega'
  onClose: () => void
  onGuardar: (cambio: DeliveryCambio) => Promise<void>
}) {
  const { rol, esPlatformAdmin } = useAuth()
  const puedeEditarDireccion = rol === 'admin' || rol === 'encargado' || esPlatformAdmin
  const esRetiro = tramo === 'retiro'
  const entrega = direccionEntrega(solicitud)
  const { data: config } = useDeliveryConfig()
  const bloquesConfig = config?.bloques.length ? config.bloques : ['10:00 – 13:00', '15:00 – 19:00']
  const [fecha, setFecha] = useState((esRetiro ? solicitud.fecha_preferida : solicitud.entrega_fecha) ?? hoyIso())
  const [bloque, setBloque] = useState((esRetiro ? solicitud.bloque_horario : solicitud.entrega_bloque) ?? '')
  const [otraDireccion, setOtraDireccion] = useState(!!solicitud.entrega_direccion)
  const [direccion, setDireccion] = useState(solicitud.entrega_direccion ?? '')
  const [comuna, setComuna] = useState(solicitud.entrega_comuna ?? '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const cambio: DeliveryCambio = esRetiro
      ? { estado: 'retiro_agendado', fecha_preferida: fecha, bloque_horario: bloque || bloques[0] }
      : { estado: 'entrega_agendada', entrega_fecha: fecha, entrega_bloque: bloque || bloques[0] }
    if (!esRetiro && puedeEditarDireccion) {
      cambio.entrega_direccion = otraDireccion && direccion.trim() ? direccion.trim() : null
      cambio.entrega_comuna = otraDireccion && direccion.trim() ? comuna.trim() || null : null
    }
    await onGuardar(cambio)
    setGuardando(false)
  }

  const bloques = !bloque || bloquesConfig.includes(bloque) ? bloquesConfig : [bloque, ...bloquesConfig]

  return (
    <div className="fixed inset-0 z-[320] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{esRetiro ? 'Agendar retiro' : 'Agendar entrega'}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{codigoDelivery(solicitud.numero)} · {solicitud.nombre} {solicitud.apellido} · <a className="text-blue-600 font-semibold" href={`tel:${solicitud.telefono.replace(/\s/g, '')}`}>{solicitud.telefono}</a></p>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{esRetiro ? 'Retirar en' : 'Entregar en'}</div>
            {esRetiro ? `${solicitud.direccion}, ${solicitud.comuna}` : `${entrega.direccion}, ${entrega.comuna}`}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-500 mb-1">Fecha</span>
              <input id="delivery-agendar-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-500 mb-1">Bloque</span>
              <select id="delivery-agendar-bloque" value={bloque || bloques[0]} onChange={e => setBloque(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500">
                {bloques.map(b => <option key={b}>{b}</option>)}
              </select>
            </label>
          </div>
          {!esRetiro && puedeEditarDireccion && (
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input id="delivery-agendar-otra" type="checkbox" checked={otraDireccion} onChange={e => setOtraDireccion(e.target.checked)} />
                Entregar en otra dirección
              </label>
              {otraDireccion && (
                <div className="grid grid-cols-[1fr_140px] gap-2 mt-2">
                  <input id="delivery-agendar-dir" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                  <input id="delivery-agendar-comuna" value={comuna} onChange={e => setComuna(e.target.value)} placeholder="Comuna" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !fecha} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {guardando ? 'Guardando...' : esRetiro ? 'Agendar retiro' : 'Agendar entrega'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panel de detalle ─────────────────────────────────────────────────────────
function DetalleSolicitud({ solicitud: s, orden, onClose, onPaso, onMover, onAbrirOrden }: {
  solicitud: DeliverySolicitud
  orden?: { num: string; status: string }
  onClose: () => void
  onPaso: () => void
  onMover: (cambio: DeliveryCambio, texto: string) => Promise<void>
  onAbrirOrden: (num: string) => void
}) {
  const { rol, esPlatformAdmin } = useAuth()
  const puedeEditar = rol === 'admin' || rol === 'encargado' || esPlatformAdmin
  const { data: eventos = [] } = useDeliveryEventos(s.id)
  const { data: fotos = [] } = useDeliveryFotos(s.fotos ?? [])
  const [notas, setNotas] = useState(s.notas_internas ?? '')
  const [editando, setEditando] = useState(false)
  const info = ESTADOS[s.estado]
  const paso = siguientePaso(s.estado)
  const entrega = direccionEntrega(s)
  const wa = s.telefono.replace(/\D/g, '')

  const recorrido: DeliveryEstado[] = ['nueva', 'retiro_agendado', 'en_ruta_retiro', 'en_taller', 'por_entregar', 'entrega_agendada', 'en_ruta_entrega', 'entregada']
  const idxActual = recorrido.indexOf(s.estado)
  const cuando = (estado: DeliveryEstado) => [...eventos].reverse().find(e => e.estado_nuevo === estado)?.creado_en

  return (
    <div className="fixed inset-0 z-[300] bg-black/30 flex justify-end" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex justify-between items-start gap-3 z-10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900 tabular-nums">{codigoDelivery(s.numero)}</h2>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${info.pill}`}>{info.label}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Ingresada {fechaCorta(s.creado_en)}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700 p-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
        </div>

        <div className="p-5 space-y-5">
          {paso && (
            <button onClick={onPaso} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">{paso.label}</button>
          )}

          {orden && (
            <button onClick={() => onAbrirOrden(orden.num)} className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50">
              <span><span className="text-gray-500">Orden de taller</span> <span className="font-semibold text-blue-600">#{orden.num}</span> · {orden.status}</span>
              <span className="text-blue-600 font-semibold">Abrir ›</span>
            </button>
          )}

          <div className="flex gap-2">
            <a href={`tel:${s.telefono.replace(/\s/g, '')}`} className="flex-1 text-center py-2 rounded-lg bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200">Llamar</a>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 rounded-lg bg-green-100 text-sm font-semibold text-green-700 hover:bg-green-200">WhatsApp</a>
          </div>

          {editando ? (
            <EditarDatos solicitud={s} onCancel={() => setEditando(false)} onGuardar={async cambio => { await onMover(cambio, 'Datos actualizados'); setEditando(false) }} />
          ) : (
            <>
              <Seccion titulo="Cliente" accion={puedeEditar ? { label: 'Editar', onClick: () => setEditando(true) } : undefined} filas={[
                ['Nombre', `${s.nombre} ${s.apellido}`], ['RUT', s.rut], ['Teléfono', s.telefono], ['Correo', s.email || '—'],
              ]} />
              <Seccion titulo="Retiro" filas={[
                ['Dirección', `${s.direccion}, ${s.comuna}`], ['Referencia', s.referencia_direccion || '—'],
                ['Fecha', s.fecha_preferida ? fechaDia(s.fecha_preferida) : 'Sin preferencia'], ['Bloque', s.bloque_horario || 'Sin preferencia'],
              ]} />
              <Seccion titulo="Entrega" filas={[
                ['Dirección', `${entrega.direccion}, ${entrega.comuna}${s.entrega_direccion ? '' : ' (misma del retiro)'}`],
                ['Fecha', s.entrega_fecha ? fechaDia(s.entrega_fecha) : 'Por agendar'], ['Bloque', s.entrega_bloque || 'Por agendar'],
              ]} />
              <Seccion titulo="Equipo" filas={[
                ['Equipo', [s.tipo_equipo, s.marca, s.modelo].filter(Boolean).join(' · ')], ['Falla', s.falla], ['Observaciones', s.observaciones || '—'],
              ]} />
            </>
          )}

          {fotos.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Fotos del cliente</div>
              <div className="flex gap-2 flex-wrap">
                {fotos.map(url => (
                  <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto enviada por el cliente" className="w-24 h-24 object-cover rounded-lg border border-gray-200" /></a>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Recorrido</div>
            {s.estado === 'cancelada' && <p className="text-sm text-red-600 mb-3">Solicitud cancelada {cuando('cancelada') ? `el ${fechaCorta(cuando('cancelada')!)}` : ''}</p>}
            <ol className="space-y-2">
              {recorrido.map((estado, i) => {
                const hecho = idxActual >= 0 && i < idxActual
                const actual = i === idxActual
                const fecha = cuando(estado)
                return (
                  <li key={estado} className="flex items-center gap-3 text-sm">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${actual ? 'bg-blue-600 ring-4 ring-blue-100' : hecho ? 'bg-green-600' : 'bg-gray-200'}`} />
                    <span className={`flex-1 ${actual ? 'font-semibold text-gray-900' : hecho ? 'text-gray-700' : 'text-gray-400'}`}>{ESTADOS[estado].label}</span>
                    <span className="text-xs text-gray-400 tabular-nums">{fecha && (hecho || actual) ? fechaCorta(fecha) : ''}</span>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <label htmlFor="delivery-notas" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Notas internas</label>
            <textarea id="delivery-notas" value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Coordinación, indicaciones para el retiro..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:border-blue-500" />
            <button onClick={() => onMover({ notas_internas: notas.trim() || null }, 'Notas guardadas')} disabled={(s.notas_internas ?? '') === notas}
              className="mt-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-40">Guardar notas</button>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <label htmlFor="delivery-estado-manual" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Corregir estado</label>
            <div className="flex gap-2">
              <select id="delivery-estado-manual" value={s.estado} onChange={e => void onMover({ estado: e.target.value as DeliveryEstado }, `Estado: ${ESTADOS[e.target.value as DeliveryEstado].label}`)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500">
                {(Object.keys(ESTADOS) as DeliveryEstado[]).map(k => <option key={k} value={k}>{ESTADOS[k].label}</option>)}
              </select>
              {s.estado !== 'cancelada' && s.estado !== 'entregada' && (
                <button onClick={() => { if (confirm(`¿Cancelar ${codigoDelivery(s.numero)}?`)) void onMover({ estado: 'cancelada' }, 'Solicitud cancelada') }}
                  className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100">Cancelar solicitud</button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">Cuando la orden enlazada queda Lista o Entregada, el estado se actualiza solo.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditarDatos({ solicitud: s, onCancel, onGuardar }: {
  solicitud: DeliverySolicitud
  onCancel: () => void
  onGuardar: (cambio: DeliveryCambio) => Promise<void>
}) {
  const [f, setF] = useState({
    nombre: s.nombre, apellido: s.apellido, rut: s.rut, telefono: s.telefono, email: s.email ?? '',
    direccion: s.direccion, comuna: s.comuna, referencia_direccion: s.referencia_direccion ?? '',
    marca: s.marca ?? '', modelo: s.modelo ?? '', falla: s.falla,
  })
  const [guardando, setGuardando] = useState(false)
  const campo = (k: keyof typeof f, label: string, largo = false) => (
    <label className={`block ${largo ? 'col-span-2' : ''}`}>
      <span className="block text-xs font-semibold text-gray-500 mb-1">{label}</span>
      <input id={`delivery-editar-${k}`} value={f[k]} onChange={e => setF(v => ({ ...v, [k]: e.target.value }))}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
    </label>
  )
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Editar datos</div>
      <div className="grid grid-cols-2 gap-3">
        {campo('nombre', 'Nombre')}{campo('apellido', 'Apellido')}
        {campo('rut', 'RUT')}{campo('telefono', 'Teléfono')}
        {campo('email', 'Correo', true)}
        {campo('direccion', 'Dirección de retiro', true)}
        {campo('comuna', 'Comuna')}{campo('referencia_direccion', 'Referencia')}
        {campo('marca', 'Marca')}{campo('modelo', 'Modelo')}
        {campo('falla', 'Falla', true)}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button>
        <button disabled={guardando} onClick={async () => {
          setGuardando(true)
          await onGuardar({ ...f, email: f.email.trim() || null, referencia_direccion: f.referencia_direccion.trim() || null, marca: f.marca.trim() || null, modelo: f.modelo.trim() || null })
          setGuardando(false)
        }} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function Seccion({ titulo, filas, accion }: { titulo: string; filas: [string, string][]; accion?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</span>
        {accion && <button onClick={accion.onClick} className="text-xs font-semibold text-blue-600 hover:text-blue-700">{accion.label}</button>}
      </div>
      <div className="divide-y divide-gray-100">
        {filas.map(([k, v]) => (
          <div key={k} className="px-4 py-2.5 grid grid-cols-[110px_1fr] gap-3 text-sm">
            <span className="text-gray-400">{k}</span><span className="text-gray-800 whitespace-pre-wrap break-words">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
