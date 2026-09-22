import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useBodegas } from '@/lib/queries'
import { codigoDelivery, direccionEntrega, hoyIso } from './delivery'
import { useDeliveryConfig, type DeliverySolicitud } from './deliveryQueries'
import { useCoordinarViaje, useMotoboys, useViajes } from './viajesQueries'
import { calcularPagoViaje } from './calcularPagoViaje'

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

function telefonoWhatsapp(valor: string) {
  const limpio = valor.replace(/\D/g, '')
  return limpio.length === 9 && limpio.startsWith('9') ? `56${limpio}` : limpio
}

export function CoordinarViajeModal({ solicitud, tipo, onClose, onGestionarMotoboys }: {
  solicitud: DeliverySolicitud
  tipo: 'retiro' | 'entrega'
  onClose: () => void
  onGestionarMotoboys: () => void
}) {
  const { empresaId, branchId } = useAuth()
  const { data: bodegas = [] } = useBodegas()
  const { data: motoboys = [] } = useMotoboys()
  const { data: viajes = [] } = useViajes()
  const { data: config } = useDeliveryConfig()
  const coordinar = useCoordinarViaje()
  const existente = viajes.find(v => v.solicitud_id === solicitud.id && v.tipo === tipo)
  const sucursales = bodegas.filter(b => b.activo !== false && b.direccion?.trim())
  const disponibles = motoboys.filter(m => m.activo)
  const guardada = empresaId ? window.localStorage.getItem(`delivery_sucursal_${empresaId}`) : null
  const guardadoMotoboy = empresaId ? window.localStorage.getItem(`delivery_motoboy_${empresaId}`) : null
  const [sucursalId, setSucursalId] = useState(existente?.sucursal_id ?? (sucursales.find(b => b.id === branchId)?.id || sucursales.find(b => b.id === guardada)?.id || (sucursales.length === 1 ? sucursales[0].id : '')))
  const [motoboyId, setMotoboyId] = useState(existente?.motoboy_id ?? (disponibles.find(m => m.id === guardadoMotoboy)?.id || (disponibles.length === 1 ? disponibles[0].id : '')))
  const fechaPreferida = tipo === 'retiro' ? solicitud.fecha_preferida : solicitud.entrega_fecha
  const [fecha, setFecha] = useState(fechaPreferida && fechaPreferida >= hoyIso() ? fechaPreferida : hoyIso())
  const [bloque, setBloque] = useState((tipo === 'retiro' ? solicitud.bloque_horario : solicitud.entrega_bloque) ?? config?.bloques[0] ?? '10:00 – 13:00')
  const [km, setKm] = useState(existente?.distancia_km?.toString() ?? '')
  const [error, setError] = useState('')
  const [compartir, setCompartir] = useState<{ url: string; monto: number } | null>(null)

  const sucursal = sucursales.find(b => b.id === sucursalId)
  const motoboy = disponibles.find(m => m.id === motoboyId)
  const distancia = km.trim() === '' ? null : Number(km)
  const monto = motoboy ? calcularPagoViaje(distancia, Number(motoboy.tarifa_km), Number(motoboy.minimo_viaje)) : null
  const direccionCliente = tipo === 'retiro' ? `${solicitud.direccion}, ${solicitud.comuna}` : (() => { const d = direccionEntrega(solicitud); return `${d.direccion}, ${d.comuna}` })()
  const bloques = config?.bloques.length ? config.bloques : ['10:00 – 13:00', '15:00 – 19:00']
  const opcionesBloque = bloque && !bloques.includes(bloque) ? [bloque, ...bloques] : bloques

  async function confirmar() {
    if (!sucursal || !motoboy || !fecha || !bloque || monto == null || distancia == null) {
      setError('Elige sucursal, motoboy, fecha, bloque y kilómetros para mostrar el pago acordado.')
      return
    }
    setError('')
    try {
      const result = await coordinar.mutateAsync({
        solicitudId: solicitud.id, tipo, sucursalId: sucursal.id,
        sucursalNombre: sucursal.nombre ?? sucursal.name ?? 'Sucursal',
        sucursalDireccion: sucursal.direccion!, motoboyId: motoboy.id,
        fecha, bloque, distanciaKm: distancia,
      })
      if (empresaId) {
        window.localStorage.setItem(`delivery_sucursal_${empresaId}`, sucursal.id)
        window.localStorage.setItem(`delivery_motoboy_${empresaId}`, motoboy.id)
      }
      setCompartir({ url: `${window.location.origin}/#/motoboy/viaje?token=${result.acceso_token}`, monto: Number(result.monto) })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo coordinar el viaje') }
  }

  const waTelefono = motoboy ? telefonoWhatsapp(motoboy.telefono) : ''
  const waMensaje = compartir ? `Hola ${motoboy?.nombre}, tienes ${tipo === 'retiro' ? 'un retiro' : 'una entrega'} ${codigoDelivery(solicitud.numero)}. Pago acordado: ${CLP.format(compartir.monto)}. Ver ruta y datos del viaje: ${compartir.url}` : ''
  const waUrl = waTelefono && compartir ? `https://wa.me/${waTelefono}?text=${encodeURIComponent(waMensaje)}` : ''

  return <div className="fixed inset-0 z-[320] bg-black/40 flex items-center justify-center p-3 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div role="dialog" aria-modal="true" aria-label={`Coordinar ${tipo}`} className="bg-[#f8faff] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto border border-gray-200">
      <div className="p-4 sm:p-5 flex justify-between gap-3 items-start"><div><h2 className="text-xl font-bold text-gray-900">{compartir ? 'Viaje confirmado' : `Coordinar ${tipo}`}</h2><p className="text-xs text-gray-500 mt-1">{codigoDelivery(solicitud.numero)} · Solicitud recibida desde la web</p></div><button onClick={onClose} aria-label="Cerrar" className="text-gray-400 text-xl px-2">×</button></div>
      {compartir ? <div className="px-4 sm:px-5 pb-5 space-y-4">
        <div className="rounded-xl bg-green-50 border border-green-200 p-4"><p className="font-semibold text-green-800">{tipo === 'retiro' ? 'Retiro' : 'Entrega'} asignado a {motoboy?.nombre}</p><p className="text-sm text-green-700 mt-1">Pago acordado: {CLP.format(compartir.monto)}. La solicitud y el viaje quedaron guardados juntos.</p></div>
        <div className="rounded-xl bg-white border border-gray-200 p-4"><div className="text-xs font-semibold text-gray-500 mb-2">Vista privada para el motoboy</div><div className="text-xs break-all text-blue-700">{compartir.url}</div></div>
        <div className="flex flex-col sm:flex-row gap-2">{waUrl && <a href={waUrl} target="_blank" rel="noreferrer" className="flex-1 text-center rounded-lg bg-green-600 text-white px-4 py-2.5 text-sm font-semibold">Enviar por WhatsApp ↗</a>}<button onClick={() => void navigator.clipboard.writeText(compartir.url).then(() => setError('Enlace copiado.')).catch(() => setError('No se pudo copiar el enlace.'))} className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold">Copiar enlace</button><button onClick={onClose} className="rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-semibold">Listo</button></div>
        <p className="text-xs text-gray-500">Este enlace solo muestra este viaje y vence en 30 días. Si vuelves a asignarlo, el enlace anterior deja de funcionar.</p>
        {error && <p role="status" className="text-xs text-blue-700">{error}</p>}
      </div> : <div className="px-4 sm:px-5 pb-5 space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex justify-between gap-2"><div><p className="font-semibold text-sm">{solicitud.nombre} {solicitud.apellido} · {[solicitud.marca, solicitud.modelo].filter(Boolean).join(' ') || solicitud.tipo_equipo}</p><p className="text-xs text-gray-500 mt-0.5">{solicitud.falla} · {solicitud.telefono}</p></div><span className="text-[10px] text-blue-700 font-semibold bg-blue-50 rounded-full px-2 py-1 h-fit">Datos recibidos</span></div><div className="border-t border-gray-100 mt-3 pt-3 text-xs text-gray-700"><div><span className="font-semibold">Salida y regreso:</span> {sucursal?.direccion || 'Selecciona sucursal'}</div><div className="mt-2"><span className="font-semibold">{tipo === 'retiro' ? 'Retiro' : 'Entrega'}:</span> {direccionCliente}</div></div></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-gray-600">Cuándo<div className="grid grid-cols-[1fr_1fr] gap-2 mt-1"><input aria-label="Fecha del viaje" type="date" min={hoyIso()} value={fecha} onChange={e => setFecha(e.target.value)} className="w-full min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-xs font-normal" /><select aria-label="Bloque horario" value={bloque} onChange={e => setBloque(e.target.value)} className="w-full min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-xs font-normal"><option value="">Bloque</option>{opcionesBloque.map(b => <option key={b} value={b}>{b}</option>)}</select></div></label>
          <label className="text-xs font-semibold text-gray-600">Motoboy<select value={motoboyId} onChange={e => setMotoboyId(e.target.value)} className="block w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal"><option value="">Seleccionar...</option>{disponibles.map(m => <option key={m.id} value={m.id}>{m.nombre} · {CLP.format(Number(m.tarifa_km))}/km</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Sucursal<select value={sucursalId} onChange={e => setSucursalId(e.target.value)} className="block w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal"><option value="">Seleccionar...</option>{sucursales.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Kilómetros totales del viaje<input type="number" min="0" step="0.1" value={km} onChange={e => setKm(e.target.value)} placeholder="Ej: 12" className="block w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal" /><span className="text-[10px] font-normal text-gray-400">Ingresados manualmente · ida y regreso</span></label>
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex justify-between items-center gap-3"><div><div className="text-xs font-semibold text-blue-800">Pago por este {tipo}</div><div className="text-[11px] text-gray-500 mt-0.5">{monto == null ? 'Elige motoboy e ingresa km' : `${distancia} km × ${CLP.format(Number(motoboy!.tarifa_km))}/km${Number(motoboy!.minimo_viaje) > 0 ? ` · mínimo ${CLP.format(Number(motoboy!.minimo_viaje))}` : ''}`}</div></div><strong className="text-xl text-blue-700 whitespace-nowrap">{monto == null ? '—' : CLP.format(monto)}</strong></div>
        <div className="flex justify-between text-xs text-gray-500"><span>{tipo === 'retiro' ? 'Entrega al cliente' : 'Retiro'}</span><span>{tipo === 'retiro' ? 'Se calculará cuando se coordine' : 'Registrado por separado'}</span></div>
        </div>
        {existente && <p className="text-xs text-amber-700">Al guardar cambios se generará un enlace nuevo para el motoboy; el anterior dejará de funcionar.</p>}
        {!disponibles.length && <button onClick={onGestionarMotoboys} className="text-sm text-blue-600 font-semibold">+ Agregar motoboy antes de asignar</button>}
        {!sucursales.length && <p className="text-xs text-amber-700">Configura la dirección de una sucursal en Inventario → Bodegas / Sucursales.</p>}
        {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold">Cancelar</button><button onClick={() => void confirmar()} disabled={coordinar.isPending || monto == null || !sucursal || !bloque || !fecha} className="rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{coordinar.isPending ? 'Guardando...' : `Confirmar ${tipo} y asignar →`}</button></div>
      </div>}
    </div>
  </div>
}
