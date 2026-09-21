import { useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useBodegas } from '@/lib/queries'
import { codigoDelivery, direccionEntrega } from './delivery'
import type { DeliverySolicitud } from './deliveryQueries'
import { useGuardarMotoboy, useGuardarViaje, useMotoboys, useViajes, type DeliveryViaje } from './viajesQueries'

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const ESTADOS: { id: DeliveryViaje['estado']; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' }, { id: 'asignado', label: 'Asignado' },
  { id: 'en_ruta', label: 'En ruta' }, { id: 'completado', label: 'Completado' }, { id: 'cancelado', label: 'Cancelado' },
]

function numero(valor: string) { return valor.trim() === '' ? null : Number(valor) }
function direccionSucursal(direccion: string) { return direccion.trim() }
function rutaGoogle(v: DeliveryViaje) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', v.sucursal_direccion)
  url.searchParams.set('destination', v.sucursal_direccion)
  url.searchParams.set('waypoints', v.cliente_direccion)
  url.searchParams.set('travelmode', 'driving')
  return url.toString()
}

function reporte(v: DeliveryViaje, s: DeliverySolicitud | undefined) {
  return [
    `${v.tipo === 'retiro' ? 'Retiro' : 'Entrega'} ${s ? codigoDelivery(s.numero) : ''}`,
    `Cliente: ${s ? `${s.nombre} ${s.apellido}` : '—'}`,
    `Teléfono: ${s?.telefono || '—'}`,
    `Sucursal: ${v.sucursal_nombre} — ${v.sucursal_direccion}`,
    `Cliente: ${v.cliente_direccion}`,
    `Fecha: ${v.fecha || 'por coordinar'}${v.bloque ? ` · ${v.bloque}` : ''}`,
    `Ruta: ${rutaGoogle(v)}`,
    `Pago acordado: ${v.monto == null ? 'por definir' : CLP.format(v.monto)}`,
  ].join('\n')
}

export function ViajesPanel({ solicitudes, solicitudInicialId }: { solicitudes: DeliverySolicitud[]; solicitudInicialId?: string | null }) {
  const { rol, esPlatformAdmin } = useAuth()
  const puedeGestionar = rol === 'admin' || rol === 'encargado' || esPlatformAdmin
  const { data: bodegas = [] } = useBodegas()
  const { data: motoboys = [], error: errorMotoboys } = useMotoboys()
  const { data: viajes = [], error: errorViajes } = useViajes()
  const guardarMotoboy = useGuardarMotoboy()
  const guardarViaje = useGuardarViaje()
  const [abriendoMotoboy, setAbriendoMotoboy] = useState(false)
  const [editandoMotoboyId, setEditandoMotoboyId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [tarifa, setTarifa] = useState('')
  const [minimo, setMinimo] = useState('0')
  const [formViaje, setFormViaje] = useState<{ solicitudId: string; tipo: 'retiro' | 'entrega'; viajeId?: string } | null>(null)
  const [solicitudElegida, setSolicitudElegida] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [motoboyId, setMotoboyId] = useState('')
  const [km, setKm] = useState('')
  const [nota, setNota] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)

  const solicitudesMap = useMemo(() => new Map(solicitudes.map(s => [s.id, s])), [solicitudes])
  const motoboysMap = useMemo(() => new Map(motoboys.map(m => [m.id, m])), [motoboys])
  const activas = motoboys.filter(m => m.activo)
  const pendientes = viajes.filter(v => v.estado !== 'completado' && v.estado !== 'cancelado')
  const totalPendiente = viajes.filter(v => v.estado === 'completado').reduce((n, v) => n + Number(v.monto ?? 0), 0)
  const inicial = solicitudInicialId && solicitudesMap.get(solicitudInicialId)
  const solicitud = formViaje ? solicitudesMap.get(formViaje.solicitudId) : undefined
  const sucursal = bodegas.find(b => b.id === sucursalId)
  const motoboy = motoboys.find(m => m.id === motoboyId)
  const kmNumero = numero(km)
  const monto = kmNumero != null && motoboy ? Math.max(Math.round(kmNumero * Number(motoboy.tarifa_km)), Number(motoboy.minimo_viaje)) : null

  function abrir(s: DeliverySolicitud, tipo: 'retiro' | 'entrega') {
    const existente = viajes.find(v => v.solicitud_id === s.id && v.tipo === tipo)
    setFormViaje({ solicitudId: s.id, tipo, viajeId: existente?.id })
    setSolicitudElegida(s.id)
    setSucursalId(existente?.sucursal_id ?? '')
    setMotoboyId(existente?.motoboy_id ?? '')
    setKm(existente?.distancia_km?.toString() ?? '')
    setNota(existente?.nota ?? '')
    setMensaje(null)
  }

  async function crearMotoboy() {
    const t = numero(tarifa), m = numero(minimo)
    if (!nombre.trim() || t == null || !Number.isFinite(t) || t < 0 || m == null || !Number.isFinite(m) || m < 0) { setMensaje('Ingresa nombre y tarifa válida.'); return }
    try {
      await guardarMotoboy.mutateAsync({ id: editandoMotoboyId ?? undefined, nombre: nombre.trim(), telefono: telefono.trim(), tarifa_km: t, minimo_viaje: m })
      setNombre(''); setTelefono(''); setTarifa(''); setMinimo('0'); setAbriendoMotoboy(false)
      setEditandoMotoboyId(null)
      setMensaje('Motoboy guardado. Los viajes ya registrados conservan su tarifa anterior.')
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo agregar el motoboy') }
  }

  async function guardar() {
    if (!solicitud || !formViaje || !sucursal?.id || !direccionSucursal(sucursal.direccion ?? '')) { setMensaje('Selecciona una sucursal con dirección configurada.'); return }
    if (!motoboy || kmNumero == null || !Number.isFinite(kmNumero) || kmNumero < 0) { setMensaje('Selecciona motoboy e ingresa los kilómetros recorridos.'); return }
    const cliente = formViaje.tipo === 'retiro' ? `${solicitud.direccion}, ${solicitud.comuna}` : (() => { const d = direccionEntrega(solicitud); return `${d.direccion}, ${d.comuna}` })()
    const existente = viajes.find(v => v.id === formViaje.viajeId)
    try {
      await guardarViaje.mutateAsync({
        id: formViaje.viajeId, solicitud_id: solicitud.id, tipo: formViaje.tipo,
        motoboy_id: motoboy.id, estado: existente?.estado === 'en_ruta' || existente?.estado === 'completado' ? existente.estado : 'asignado',
        sucursal_id: sucursal.id, sucursal_nombre: sucursal.nombre ?? sucursal.name ?? 'Sucursal',
        sucursal_direccion: direccionSucursal(sucursal.direccion ?? ''), cliente_direccion: cliente,
        fecha: formViaje.tipo === 'retiro' ? solicitud.fecha_preferida : solicitud.entrega_fecha,
        bloque: formViaje.tipo === 'retiro' ? solicitud.bloque_horario : solicitud.entrega_bloque,
        distancia_km: kmNumero, distancia_fuente: 'manual', tarifa_km: Number(motoboy.tarifa_km),
        minimo_viaje: Number(motoboy.minimo_viaje), nota: nota.trim() || null,
      })
      setFormViaje(null); setMensaje('Viaje guardado y asignado.')
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo guardar el viaje') }
  }

  async function cambiarEstado(v: DeliveryViaje, estado: DeliveryViaje['estado']) {
    try {
      await guardarViaje.mutateAsync({ ...v, estado })
      setMensaje(`Viaje ${estado === 'completado' ? 'completado' : 'actualizado'}. El pago al motoboy aún no se registra automáticamente.`)
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo actualizar el viaje') }
  }

  return <div className="space-y-4">
    {(errorViajes || errorMotoboys) && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">No se pudieron cargar los viajes. Es posible que falte aplicar la migración de logística.</div>}
    {mensaje && <div role="status" className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">{mensaje}</div>}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <div className="rounded-xl border bg-white p-4"><div className="text-xs text-gray-500">Viajes por realizar</div><div className="text-2xl font-bold mt-1">{pendientes.length}</div></div>
      <div className="rounded-xl border bg-white p-4"><div className="text-xs text-gray-500">Motoboys activos</div><div className="text-2xl font-bold mt-1">{activas.length}</div></div>
      <div className="rounded-xl border bg-white p-4 col-span-2 md:col-span-1"><div className="text-xs text-gray-500">Costo de viajes completados</div><div className="text-2xl font-bold mt-1">{CLP.format(totalPendiente)}</div><div className="text-xs text-gray-400">No equivale a saldo pendiente de pago</div></div>
    </div>
    {puedeGestionar && <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Motoboys y tarifas</h2><p className="text-xs text-gray-500">La tarifa se copia al viaje al asignarlo.</p></div><button onClick={() => { setEditandoMotoboyId(null); setNombre(''); setTelefono(''); setTarifa(''); setMinimo('0'); setAbriendoMotoboy(true) }} className="text-sm font-semibold text-blue-600">+ Agregar</button></div>
      {abriendoMotoboy && <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
        <input aria-label="Nombre del motoboy" placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <input aria-label="Teléfono del motoboy" placeholder="Teléfono" value={telefono} onChange={e => setTelefono(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <input aria-label="Tarifa por kilómetro" type="number" min="0" placeholder="$ por km" value={tarifa} onChange={e => setTarifa(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <input aria-label="Mínimo por viaje" type="number" min="0" placeholder="Mínimo" value={minimo} onChange={e => setMinimo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <button onClick={() => void crearMotoboy()} disabled={guardarMotoboy.isPending} className="rounded-lg bg-gray-900 text-white text-sm font-semibold px-3 py-2 disabled:opacity-50">Guardar</button>
      </div>}
      <div className="mt-3 flex flex-wrap gap-2">{motoboys.map(m => <button key={m.id} onClick={() => { setEditandoMotoboyId(m.id); setNombre(m.nombre); setTelefono(m.telefono); setTarifa(String(m.tarifa_km)); setMinimo(String(m.minimo_viaje)); setAbriendoMotoboy(true) }} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200">{m.nombre} · {CLP.format(Number(m.tarifa_km))}/km{!m.activo && ' · inactivo'} · Editar</button>)}</div>
    </div>}
    {puedeGestionar && inicial && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center justify-between gap-3"><span className="text-sm">Preparar viajes de {codigoDelivery(inicial.numero)}</span><div className="flex gap-2"><button onClick={() => abrir(inicial, 'retiro')} className="rounded-lg bg-white border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Retiro</button><button onClick={() => abrir(inicial, 'entrega')} className="rounded-lg bg-white border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Entrega</button></div></div>}
    {puedeGestionar && <div className="rounded-xl border bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-2"><span className="text-sm font-semibold">Preparar viaje desde solicitud</span><select aria-label="Solicitud para viaje" className="border rounded-lg px-3 py-2 text-sm flex-1" value={solicitudElegida} onChange={e => { setSolicitudElegida(e.target.value); const s = solicitudesMap.get(e.target.value); if (s) abrir(s, 'retiro') }}><option value="">Elegir solicitud...</option>{solicitudes.filter(s => s.estado !== 'cancelada').map(s => <option key={s.id} value={s.id}>{codigoDelivery(s.numero)} · {s.nombre} {s.apellido}</option>)}</select></div>}
    {formViaje && solicitud && <div className="rounded-xl border border-blue-200 bg-white p-4 space-y-3">
      <div className="flex justify-between"><h2 className="font-semibold">{formViaje.viajeId ? 'Editar' : 'Preparar'} {formViaje.tipo} · {codigoDelivery(solicitud.numero)}</h2><button onClick={() => setFormViaje(null)} aria-label="Cerrar formulario" className="text-gray-500">✕</button></div>
      <div className="flex gap-2"><button onClick={() => abrir(solicitud, 'retiro')} aria-pressed={formViaje.tipo === 'retiro'} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${formViaje.tipo === 'retiro' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Retiro</button><button onClick={() => abrir(solicitud, 'entrega')} aria-pressed={formViaje.tipo === 'entrega'} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${formViaje.tipo === 'entrega' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Entrega</button></div>
      <p className="text-xs text-gray-500">Dirección del cliente tomada de la solicitud. Ingresa los kilómetros totales pactados para la ruta sucursal → cliente → sucursal; aún no se calculan por mapa.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gray-600">Sucursal<select value={sucursalId} onChange={e => setSucursalId(e.target.value)} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm font-normal"><option value="">Seleccionar...</option>{bodegas.filter(b => b.activo !== false).map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}{!b.direccion ? ' · falta dirección' : ''}</option>)}</select></label>
        <label className="text-xs font-semibold text-gray-600">Motoboy<select value={motoboyId} onChange={e => setMotoboyId(e.target.value)} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm font-normal"><option value="">Seleccionar...</option>{activas.map(m => <option key={m.id} value={m.id}>{m.nombre} · {CLP.format(Number(m.tarifa_km))}/km</option>)}</select></label>
        <label className="text-xs font-semibold text-gray-600">Km pactados del viaje<input type="number" min="0" step="0.1" value={km} onChange={e => setKm(e.target.value)} placeholder="Ej: 12,5" className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm font-normal" /></label>
        <div className="rounded-lg bg-green-50 p-3"><div className="text-xs text-green-700">Monto al motoboy</div><div className="font-bold text-green-800">{monto == null ? 'Por calcular' : CLP.format(monto)}</div></div>
      </div>
      <div className="text-xs text-gray-500">Sucursal: {sucursal?.direccion || '—'}<br />Cliente: {formViaje.tipo === 'retiro' ? `${solicitud.direccion}, ${solicitud.comuna}` : (() => { const d = direccionEntrega(solicitud); return `${d.direccion}, ${d.comuna}` })()}</div>
      <input aria-label="Nota para el viaje" value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota interna opcional" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <button onClick={() => void guardar()} disabled={guardarViaje.isPending} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Guardar y asignar</button>
    </div>}
    <div className="rounded-xl border bg-white overflow-hidden"><div className="p-4 border-b"><h2 className="font-semibold">Viajes</h2><p className="text-xs text-gray-500">Ruta, responsable, costo y avance de cada retiro o entrega.</p></div>
      {!viajes.length && <p className="p-8 text-center text-sm text-gray-400">Aún no hay viajes preparados.</p>}
      <div className="divide-y">{viajes.map(v => { const s = solicitudesMap.get(v.solicitud_id); const m = v.motoboy_id ? motoboysMap.get(v.motoboy_id) : undefined; return <div key={v.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0"><div className="font-semibold text-sm">{s ? codigoDelivery(s.numero) : 'Solicitud'} · {v.tipo === 'retiro' ? 'Retiro' : 'Entrega'} <span className="font-normal text-gray-500">· {v.fecha || 'sin fecha'}</span></div><div className="text-xs text-gray-500 mt-1">{v.sucursal_nombre} ↔ {v.cliente_direccion}</div><div className="text-xs text-gray-500">{m?.nombre ?? 'Sin motoboy'} · {v.distancia_km ?? '—'} km ({v.distancia_fuente === 'manual' ? 'manual' : 'ruta'}) · {v.monto == null ? 'sin monto' : CLP.format(Number(v.monto))}</div></div>
        <div className="flex items-center flex-wrap gap-2"><a href={rutaGoogle(v)} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border text-xs font-semibold text-blue-700">Ver ruta</a><button onClick={() => { void navigator.clipboard.writeText(reporte(v, s)).then(() => setMensaje('Reporte copiado. Puedes enviarlo al motoboy.')).catch(() => setMensaje('No se pudo copiar el reporte.')) }} className="px-3 py-2 rounded-lg border text-xs font-semibold text-blue-700">Copiar reporte</button>{puedeGestionar && <><button onClick={() => { if (s) abrir(s, v.tipo) }} className="px-3 py-2 rounded-lg border text-xs font-semibold">Editar</button><select aria-label={`Estado del viaje ${s ? codigoDelivery(s.numero) : v.id}`} value={v.estado} onChange={e => void cambiarEstado(v, e.target.value as DeliveryViaje['estado'])} className="border rounded-lg px-2 py-2 text-xs bg-white">{ESTADOS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></>}</div>
      </div> })}</div>
    </div>
  </div>
}
