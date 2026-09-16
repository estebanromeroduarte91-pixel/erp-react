import { useMemo, useState } from 'react'
import { Spinner } from '@/components/shared/Spinner'
import { useActualizarDeliverySolicitud, useDeliverySolicitudes, type DeliveryEstado, type DeliverySolicitud } from './deliveryQueries'

const ESTADOS: { id: DeliveryEstado; label: string; className: string }[] = [
  { id: 'nueva', label: 'Nueva', className: 'bg-blue-50 text-blue-700' },
  { id: 'contactada', label: 'Contactada', className: 'bg-violet-50 text-violet-700' },
  { id: 'agendada', label: 'Agendada', className: 'bg-amber-50 text-amber-700' },
  { id: 'en_retiro', label: 'En retiro', className: 'bg-cyan-50 text-cyan-700' },
  { id: 'recibida', label: 'Recibida', className: 'bg-green-50 text-green-700' },
  { id: 'cancelada', label: 'Cancelada', className: 'bg-red-50 text-red-600' },
]

function estadoInfo(id: DeliveryEstado) {
  return ESTADOS.find(e => e.id === id) ?? ESTADOS[0]
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function codigo(numero: number) {
  return `DEL-${String(numero).padStart(6, '0')}`
}

export function DeliveryPage() {
  const { data = [], isLoading, error } = useDeliverySolicitudes()
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState<'todos' | DeliveryEstado>('todos')
  const [seleccionada, setSeleccionada] = useState<DeliverySolicitud | null>(null)

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLocaleLowerCase('es')
    return data.filter(s => {
      if (estado !== 'todos' && s.estado !== estado) return false
      if (!q) return true
      return [codigo(s.numero), s.nombre, s.apellido, s.rut, s.telefono, s.tipo_equipo, s.marca, s.modelo, s.comuna]
        .some(v => String(v ?? '').toLocaleLowerCase('es').includes(q))
    })
  }, [data, buscar, estado])

  const nuevas = data.filter(s => s.estado === 'nueva').length
  const agendadas = data.filter(s => s.estado === 'agendada').length
  const enRetiro = data.filter(s => s.estado === 'en_retiro').length

  if (isLoading) return <div className="py-20 flex justify-center"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Delivery</h1>
            <span className="text-[11px] font-semibold rounded-full bg-green-50 text-green-700 px-2 py-0.5">Complemento activo</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Solicitudes de retiro ingresadas desde tu sitio web.</p>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">No se pudieron cargar las solicitudes de delivery.</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          ['Nuevas', nuevas, 'text-blue-600'],
          ['Agendadas', agendadas, 'text-amber-600'],
          ['En retiro', enRetiro, 'text-cyan-600'],
          ['Total', data.length, 'text-gray-900'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-xl">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por cliente, RUT, teléfono o equipo..."
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          </div>
          <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-blue-500">
            <option value="todos">Todos los estados</option>
            {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>

        {filtradas.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 grid place-items-center mb-3">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7h11v10H3z"/><path d="M14 10h3l4 4v3h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>
            </div>
            <p className="font-semibold text-gray-700">{data.length ? 'No hay coincidencias' : 'Aún no hay solicitudes'}</p>
            <p className="text-sm text-gray-400 mt-1">Las solicitudes enviadas desde stevedocs.cl aparecerán aquí.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Solicitud</th><th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Equipo</th><th className="px-4 py-3 font-semibold">Dirección</th>
                <th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold text-right">Acción</th>
              </tr></thead>
              <tbody>
                {filtradas.map(s => {
                  const info = estadoInfo(s.estado)
                  return <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-3"><div className="font-semibold text-blue-600">{codigo(s.numero)}</div><div className="text-xs text-gray-400 mt-0.5">{fechaCorta(s.creado_en)}</div></td>
                    <td className="px-4 py-3"><div className="font-medium text-gray-800">{s.nombre} {s.apellido}</div><div className="text-xs text-gray-400 mt-0.5">{s.telefono}</div></td>
                    <td className="px-4 py-3"><div className="text-gray-800">{[s.tipo_equipo, s.marca, s.modelo].filter(Boolean).join(' · ')}</div><div className="text-xs text-gray-400 mt-0.5 max-w-[230px] truncate">{s.falla}</div></td>
                    <td className="px-4 py-3"><div className="text-gray-700 max-w-[220px] truncate">{s.direccion}</div><div className="text-xs text-gray-400 mt-0.5">{s.comuna}</div></td>
                    <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${info.className}`}>{info.label}</span></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => setSeleccionada(s)} className="text-blue-600 font-semibold hover:text-blue-700">Ver detalle</button></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {seleccionada && <DetalleSolicitud solicitud={seleccionada} onClose={() => setSeleccionada(null)} />}
    </div>
  )
}

function DetalleSolicitud({ solicitud, onClose }: { solicitud: DeliverySolicitud; onClose: () => void }) {
  const actualizar = useActualizarDeliverySolicitud()
  const [estado, setEstado] = useState<DeliveryEstado>(solicitud.estado)
  const [notas, setNotas] = useState(solicitud.notas_internas ?? '')
  const [guardado, setGuardado] = useState(false)

  async function guardar() {
    await actualizar.mutateAsync({ id: solicitud.id, estado, notas_internas: notas.trim() || null })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 1800)
  }

  return <div className="fixed inset-0 z-[300] bg-black/30 flex justify-end" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex justify-between items-start z-10">
        <div><h2 className="font-bold text-gray-900">{codigo(solicitud.numero)}</h2><p className="text-xs text-gray-400 mt-0.5">Ingresada {fechaCorta(solicitud.creado_en)}</p></div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </div>
      <div className="p-5 space-y-5">
        <Seccion titulo="Cliente" filas={[
          ['Nombre', `${solicitud.nombre} ${solicitud.apellido}`], ['RUT', solicitud.rut], ['Teléfono', solicitud.telefono], ['Email', solicitud.email || '—'],
        ]} />
        <Seccion titulo="Retiro" filas={[
          ['Dirección', solicitud.direccion], ['Comuna', solicitud.comuna], ['Región', solicitud.region || '—'],
          ['Referencia', solicitud.referencia_direccion || '—'], ['Fecha preferida', solicitud.fecha_preferida || 'Sin preferencia'], ['Horario', solicitud.bloque_horario || 'Sin preferencia'],
        ]} />
        <Seccion titulo="Equipo" filas={[
          ['Tipo', solicitud.tipo_equipo], ['Marca', solicitud.marca || '—'], ['Modelo', solicitud.modelo || '—'], ['Falla descrita', solicitud.falla], ['Observaciones', solicitud.observaciones || '—'],
        ]} />
        <div className="rounded-xl border border-gray-200 p-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Estado</label>
          <select value={estado} onChange={e => setEstado(e.target.value as DeliveryEstado)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-blue-500">
            {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mt-4 mb-2">Notas internas</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4} placeholder="Coordinación, indicaciones para el retiro..." className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:border-blue-500" />
          <button onClick={guardar} disabled={actualizar.isPending} className="mt-3 w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
            {actualizar.isPending ? 'Guardando...' : guardado ? 'Guardado' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  </div>
}

function Seccion({ titulo, filas }: { titulo: string; filas: [string, string][] }) {
  return <div className="rounded-xl border border-gray-200 overflow-hidden">
    <div className="px-4 py-3 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</div>
    <div className="divide-y divide-gray-100">{filas.map(([k, v]) => <div key={k} className="px-4 py-3 grid grid-cols-[130px_1fr] gap-3 text-sm"><span className="text-gray-400">{k}</span><span className="text-gray-800 whitespace-pre-wrap">{v}</span></div>)}</div>
  </div>
}

