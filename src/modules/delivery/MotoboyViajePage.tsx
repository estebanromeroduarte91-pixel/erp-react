import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const ENDPOINT = 'https://nfcdqdbhrsjhbnbtqewl.supabase.co/functions/v1/delivery-viaje'
const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

interface ViajeCompartido {
  numero: number
  tipo: 'retiro' | 'entrega'
  estado: string
  cliente: string
  telefono: string
  motoboy: string
  sucursal_nombre: string
  sucursal_direccion: string
  cliente_direccion: string
  fecha: string | null
  bloque: string | null
  distancia_km: number
  tarifa_km: number
  monto: number
}

function rutaGoogle(v: ViajeCompartido) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', v.sucursal_direccion)
  url.searchParams.set('destination', v.sucursal_direccion)
  url.searchParams.set('waypoints', v.cliente_direccion)
  url.searchParams.set('travelmode', 'driving')
  return url.toString()
}

export function MotoboyViajePage() {
  const location = useLocation()
  const token = new URLSearchParams(location.search).get('token') ?? ''
  const tokenValido = /^[a-f0-9]{64}$/.test(token)
  const [resultado, setResultado] = useState<{ token: string; viaje?: ViajeCompartido; error?: string } | null>(null)
  const [cargando, setCargando] = useState(true)
  const actual = resultado?.token === token ? resultado : null
  const viaje = actual?.viaje
  const error = actual?.error

  useEffect(() => {
    const controller = new AbortController()
    if (!tokenValido) return () => controller.abort()
    function cargar() {
      void fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }), signal: controller.signal, cache: 'no-store',
      }).then(async response => {
        const body = await response.json() as { ok?: boolean; viaje?: ViajeCompartido; error?: string }
        if (!response.ok || !body.ok || !body.viaje) throw new Error(body.error || 'Viaje no disponible')
        setResultado({ token, viaje: body.viaje })
      }).catch(e => {
        if (!controller.signal.aborted) setResultado({ token, error: e instanceof Error ? e.message : 'No se pudo cargar el viaje' })
      }).finally(() => { if (!controller.signal.aborted) setCargando(false) })
    }
    cargar()
    const interval = window.setInterval(cargar, 60_000)
    return () => { window.clearInterval(interval); controller.abort() }
  }, [token, tokenValido])

  return <main className="min-h-screen bg-[#f7f9fc] px-4 py-6 text-gray-900">
    <div className="mx-auto max-w-md">
      <header className="flex items-center justify-between mb-6"><span className="text-2xl font-black tracking-tight">Pixit</span><span className="text-xs text-gray-500">Viaje asignado</span></header>
      {!tokenValido ? <div role="alert" className="rounded-2xl bg-white border border-red-200 p-6 text-sm text-red-700">Este enlace no es válido.</div> : cargando || !actual ? <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center text-sm text-gray-500">Cargando viaje...</div> : error ?
        <div role="alert" className="rounded-2xl bg-white border border-red-200 p-6 text-sm text-red-700">{error}</div> : viaje &&
        <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-5">
          <div><span className="inline-flex px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">{viaje.estado === 'completado' ? 'Viaje completado' : viaje.estado === 'en_ruta' ? 'En ruta' : 'Viaje asignado'}</span>
            <h1 className="text-xl font-bold mt-3">{viaje.tipo === 'retiro' ? 'Retiro' : 'Entrega'} · DEL-{String(viaje.numero).padStart(6, '0')}</h1>
            <p className="text-sm text-gray-500 mt-1">{viaje.motoboy} · {viaje.fecha || 'Fecha por coordinar'}{viaje.bloque ? ` · ${viaje.bloque}` : ''}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4 space-y-3 text-sm">
            <div><div className="text-xs text-gray-400 font-semibold">Salida y regreso</div><div className="font-medium">{viaje.sucursal_nombre} · {viaje.sucursal_direccion}</div></div>
            <div><div className="text-xs text-gray-400 font-semibold">{viaje.tipo === 'retiro' ? 'Retirar en' : 'Entregar en'}</div><div className="font-medium">{viaje.cliente_direccion}</div></div>
            <div><div className="text-xs text-gray-400 font-semibold">Cliente</div><div className="font-medium">{viaje.cliente} · <a href={`tel:${viaje.telefono.replace(/[^+\d]/g, '')}`} className="text-blue-600">{viaje.telefono}</a></div></div>
          </div>
          <div className="border-t border-gray-100 pt-4 flex justify-between items-center gap-3"><div><div className="text-sm text-gray-500">Pago acordado</div><div className="text-xs text-gray-400">{viaje.distancia_km} km × {CLP.format(Number(viaje.tarifa_km))}/km</div></div><strong className="text-2xl text-green-700">{CLP.format(Number(viaje.monto))}</strong></div>
          <a href={rutaGoogle(viaje)} target="_blank" rel="noreferrer" className="block w-full rounded-xl bg-gray-900 text-white text-center py-3 text-sm font-semibold">Abrir ruta ↗</a>
        </div>}
      <p className="text-center text-xs text-gray-400 mt-5">Enlace privado para este viaje. No lo compartas con otras personas.</p>
    </div>
  </main>
}
