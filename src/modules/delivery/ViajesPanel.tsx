import { useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { codigoDelivery } from './delivery'
import type { DeliverySolicitud } from './deliveryQueries'
import { useGuardarMotoboy, useGuardarViaje, useMotoboys, useRenovarAccesoViaje, useViajes, type DeliveryViaje, type Motoboy } from './viajesQueries'

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const ESTADOS: { id: DeliveryViaje['estado']; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' }, { id: 'asignado', label: 'Asignado' },
  { id: 'en_ruta', label: 'En ruta' }, { id: 'completado', label: 'Completado' }, { id: 'cancelado', label: 'Cancelado' },
]

function rutaGoogle(v: DeliveryViaje) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', v.sucursal_direccion)
  url.searchParams.set('destination', v.sucursal_direccion)
  url.searchParams.set('waypoints', v.cliente_direccion)
  url.searchParams.set('travelmode', 'driving')
  return url.toString()
}

export function ViajesPanel({ solicitudes, onCoordinar }: {
  solicitudes: DeliverySolicitud[]
  onCoordinar: (s: DeliverySolicitud, tipo: 'retiro' | 'entrega') => void
}) {
  const { rol, esPlatformAdmin } = useAuth()
  const puedeGestionar = rol === 'admin' || rol === 'encargado' || esPlatformAdmin
  const { data: motoboys = [], error: errorMotoboys } = useMotoboys()
  const { data: viajes = [], error: errorViajes } = useViajes()
  const guardarMotoboy = useGuardarMotoboy()
  const guardarViaje = useGuardarViaje()
  const renovarAcceso = useRenovarAccesoViaje()
  const [editando, setEditando] = useState<Motoboy | 'nuevo' | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [tarifa, setTarifa] = useState('')
  const [minimo, setMinimo] = useState('0')
  const [mensaje, setMensaje] = useState('')
  const [compartir, setCompartir] = useState<{ url: string; nombre: string; telefono: string; monto: number } | null>(null)
  const solicitudesMap = useMemo(() => new Map(solicitudes.map(s => [s.id, s])), [solicitudes])
  const motoboysMap = useMemo(() => new Map(motoboys.map(m => [m.id, m])), [motoboys])
  const activos = viajes.filter(v => v.estado !== 'completado' && v.estado !== 'cancelado')
  const costoCompletado = viajes.filter(v => v.estado === 'completado').reduce((n, v) => n + Number(v.monto ?? 0), 0)

  function abrirMotoboy(m: Motoboy | 'nuevo') {
    setEditando(m)
    setNombre(m === 'nuevo' ? '' : m.nombre)
    setTelefono(m === 'nuevo' ? '' : m.telefono)
    setTarifa(m === 'nuevo' ? '' : String(m.tarifa_km))
    setMinimo(m === 'nuevo' ? '0' : String(m.minimo_viaje))
    setMensaje('')
  }

  async function guardar() {
    const t = Number(tarifa), min = Number(minimo)
    if (!nombre.trim() || tarifa.trim() === '' || !Number.isFinite(t) || t < 0 || !Number.isFinite(min) || min < 0) { setMensaje('Ingresa nombre y tarifas válidas.'); return }
    try {
      await guardarMotoboy.mutateAsync({ id: editando === 'nuevo' ? undefined : editando?.id, nombre: nombre.trim(), telefono: telefono.trim(), tarifa_km: t, minimo_viaje: min })
      setEditando(null)
      setMensaje('Motoboy guardado. Las tarifas de viajes ya asignados no cambiaron.')
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo guardar el motoboy') }
  }

  async function cambiarEstado(v: DeliveryViaje, estado: DeliveryViaje['estado']) {
    try {
      await guardarViaje.mutateAsync({ ...v, estado })
      setMensaje('Estado actualizado. Esto no registra un pago al motoboy.')
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo actualizar el viaje') }
  }

  async function generarEnlace(v: DeliveryViaje) {
    try {
      const row = await renovarAcceso.mutateAsync(v.id)
      setCompartir({ url: `${window.location.origin}/#/motoboy/viaje?token=${row.acceso_token}`, nombre: row.motoboy_nombre, telefono: row.motoboy_telefono, monto: Number(row.monto) })
      setMensaje('Enlace nuevo generado. El anterior dejó de funcionar.')
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo compartir el viaje') }
  }
  const waTelefono = compartir?.telefono.replace(/\D/g, '') ?? ''
  const waNumero = waTelefono.length === 9 && waTelefono.startsWith('9') ? `56${waTelefono}` : waTelefono
  const waUrl = compartir && waNumero ? `https://wa.me/${waNumero}?text=${encodeURIComponent(`Hola ${compartir.nombre}, aquí tienes tu viaje asignado en Pixit. Pago acordado: ${CLP.format(compartir.monto)}. ${compartir.url}`)}` : ''

  return <div className="space-y-4">
    {(errorViajes || errorMotoboys) && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">No se pudieron cargar los viajes o motoboys. Comprueba que las migraciones estén aplicadas.</div>}
    {mensaje && <div role="status" className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">{mensaje}</div>}
    {compartir && <div className="rounded-xl bg-white border border-blue-200 p-4 space-y-3"><div className="flex justify-between gap-2"><div className="text-sm font-semibold">Enlace privado de {compartir.nombre}</div><button onClick={() => setCompartir(null)} aria-label="Cerrar enlace" className="text-gray-400">×</button></div><div className="text-xs text-blue-700 break-all">{compartir.url}</div><div className="flex flex-wrap gap-2">{waUrl && <a href={waUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-green-600 text-white px-3 py-2 text-xs font-semibold">Enviar por WhatsApp ↗</a>}<button onClick={() => void navigator.clipboard.writeText(compartir.url).then(() => setMensaje('Enlace copiado.')).catch(() => setMensaje('No se pudo copiar el enlace.'))} className="rounded-lg border px-3 py-2 text-xs font-semibold">Copiar enlace</button></div><p className="text-xs text-gray-400">El enlace vence en 30 días y solo muestra este viaje.</p></div>}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs text-gray-500">Viajes por realizar</div><div className="text-2xl font-bold mt-1">{activos.length}</div></div>
      <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs text-gray-500">Motoboys activos</div><div className="text-2xl font-bold mt-1">{motoboys.filter(m => m.activo).length}</div></div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 col-span-2 md:col-span-1"><div className="text-xs text-gray-500">Costo de viajes completados</div><div className="text-2xl font-bold mt-1">{CLP.format(costoCompletado)}</div><div className="text-xs text-gray-400">No equivale a saldo pendiente de pago</div></div>
    </div>
    {puedeGestionar && <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex justify-between items-center gap-2"><div><h2 className="font-semibold">Motoboys y tarifas</h2><p className="text-xs text-gray-500">Configúralos una vez; Pixit recuerda el último asignado.</p></div><button onClick={() => abrirMotoboy('nuevo')} className="text-sm font-semibold text-blue-600">+ Agregar</button></div>
      {editando && <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4"><input aria-label="Nombre del motoboy" placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /><input aria-label="Teléfono del motoboy" placeholder="Teléfono" value={telefono} onChange={e => setTelefono(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /><input aria-label="Tarifa por kilómetro" type="number" min="0" placeholder="$ por km" value={tarifa} onChange={e => setTarifa(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /><input aria-label="Mínimo por viaje" type="number" min="0" placeholder="Mínimo" value={minimo} onChange={e => setMinimo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /><div className="flex gap-1"><button onClick={() => void guardar()} disabled={guardarMotoboy.isPending} className="flex-1 rounded-lg bg-gray-900 text-white text-sm font-semibold px-3 py-2 disabled:opacity-50">Guardar</button><button onClick={() => setEditando(null)} aria-label="Cancelar edición" className="rounded-lg border px-2">×</button></div></div>}
      <div className="mt-3 flex flex-wrap gap-2">{motoboys.map(m => <button key={m.id} onClick={() => abrirMotoboy(m)} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200">{m.nombre} · {CLP.format(Number(m.tarifa_km))}/km{!m.activo && ' · inactivo'} · Editar</button>)}</div>
    </div>}
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden"><div className="p-4 border-b border-gray-100"><h2 className="font-semibold">Viajes coordinados</h2><p className="text-xs text-gray-500">Cada retiro y entrega se coordina directamente desde su solicitud.</p></div>
      {!viajes.length && <p className="p-8 text-center text-sm text-gray-400">Todavía no hay viajes coordinados.</p>}
      <div className="divide-y divide-gray-100">{viajes.map(v => { const s = solicitudesMap.get(v.solicitud_id); const m = v.motoboy_id ? motoboysMap.get(v.motoboy_id) : undefined; return <div key={v.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0"><div className="font-semibold text-sm">{s ? codigoDelivery(s.numero) : 'Solicitud'} · {v.tipo === 'retiro' ? 'Retiro' : 'Entrega'} <span className="font-normal text-gray-500">· {v.fecha || 'sin fecha'}</span></div><div className="text-xs text-gray-500 mt-1">{v.sucursal_nombre} ↔ {v.cliente_direccion}</div><div className="text-xs text-gray-500">{m?.nombre ?? 'Sin motoboy'} · {v.distancia_km ?? '—'} km ({v.distancia_fuente === 'manual' ? 'manual' : 'ruta'}) · <span className="font-semibold text-green-700">{v.monto == null ? 'Sin monto' : CLP.format(Number(v.monto))}</span></div></div>
        <div className="flex items-center flex-wrap gap-2"><a href={rutaGoogle(v)} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border text-xs font-semibold text-blue-700">Ver ruta</a>{puedeGestionar && <><button onClick={() => void generarEnlace(v)} disabled={renovarAcceso.isPending || v.estado === 'cancelado'} className="px-3 py-2 rounded-lg border text-xs font-semibold text-blue-700 disabled:opacity-40">Compartir</button><button onClick={() => { if (s) onCoordinar(s, v.tipo) }} disabled={!s || !['asignado','pendiente','en_ruta'].includes(v.estado) || !['nueva','retiro_agendado','por_entregar','entrega_agendada'].includes(s.estado)} className="px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40">Editar coordinación</button><select aria-label={`Estado del viaje ${s ? codigoDelivery(s.numero) : v.id}`} value={v.estado} onChange={e => void cambiarEstado(v, e.target.value as DeliveryViaje['estado'])} className="border rounded-lg px-2 py-2 text-xs bg-white">{ESTADOS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></>}</div>
      </div> })}</div>
    </div>
  </div>
}
