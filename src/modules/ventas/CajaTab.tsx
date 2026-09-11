import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCajas, useCajaSesiones, useGuardarCajaSesiones, useVentasEnRango, useMetodosPago } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { CajaSesion } from '@/types'
import { fechaLocal } from '@/lib/fecha'
import { calcularTotalesCaja } from '@/lib/caja'

const today = fechaLocal
function nowTime() {
  return new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}
function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

export function CajaTab() {
  const { nombre: nombreUsuario, branchId, esAdmin } = useAuth()
  const navigate = useNavigate()
  const { data: cajas, isLoading: cargandoCajas } = useCajas()
  const { data: sesiones, isLoading: cargandoSes } = useCajaSesiones()
  // Igual que el POS: solo se usan para los totales del día (totalesHoy).
  const { data: ventas } = useVentasEnRango(today(), today())
  const { data: metodos } = useMetodosPago()
  const guardarSesiones = useGuardarCajaSesiones()

  const [cajaSelId, setCajaSelId] = useState<string>('')
  const [fondo, setFondo] = useState('')
  const [responsable, setResponsable] = useState('')
  const [cerrando, setCerrando] = useState(false)
  const [conteoEfect, setConteoEfect] = useState('')
  const [obsCliente, setObsCliente] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cajasActivas = useMemo(() => {
    const todas = (cajas ?? []).filter(c => c.activa !== false)
    // El administrador puede administrar y operar cualquiera de las cajas.
    // Los demás usuarios conservan el límite de su sucursal asignada.
    if (esAdmin || !branchId) return todas
    return todas.filter(c => !c.sucursalId || c.sucursalId === branchId)
  }, [cajas, branchId, esAdmin])
  const cajaActual = cajasActivas.find(c => c.id === cajaSelId) ?? cajasActivas[0]

  const sesionHoy = useMemo(() => {
    if (!cajaActual) return null
    return (sesiones ?? []).find(s =>
      s.fecha === today() && s.cajaId === cajaActual.id && s.estado === 'abierta'
    ) ?? null
  }, [sesiones, cajaActual])

  const totalesHoy = useMemo(() => {
    if (!cajaActual) return calcularTotalesCaja([], metodos ?? [])
    const ventasHoy = (ventas ?? []).filter(v =>
      v.estado !== 'anulada' && v.fecha === today() && v.cajaId === cajaActual.id
    )
    return calcularTotalesCaja(ventasHoy, metodos ?? [])
  }, [ventas, cajaActual, metodos])

  const esperadoEfect = totalesHoy.efectivo + (sesionHoy?.apertura?.montoInicial ?? 0)
  const contado = parseFloat(conteoEfect) || 0
  const diferencia = contado - esperadoEfect

  const historial = useMemo(() => {
    if (!cajaActual) return []
    return (sesiones ?? [])
      .filter(s => s.cajaId === cajaActual.id && s.estado === 'cerrada')
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 5)
  }, [sesiones, cajaActual])

  async function abrirCaja() {
    if (!cajaActual) return
    setGuardando(true)
    const nuevaSesion: CajaSesion = {
      id: 'cs-' + Date.now(),
      branchId: cajaActual.sucursalId ?? '',
      cajaId: cajaActual.id,
      fecha: today(),
      estado: 'abierta',
      apertura: {
        hora: nowTime(),
        responsable: responsable.trim() || nombreUsuario || '—',
        montoInicial: parseFloat(fondo) || 0,
      },
      cierre: null,
    }
    await guardarSesiones.mutateAsync([...(sesiones ?? []), nuevaSesion])
    setFondo('')
    setResponsable('')
    setGuardando(false)
  }

  async function cerrarCaja() {
    if (!sesionHoy) return
    setGuardando(true)
    const hora = nowTime()
    const updated = (sesiones ?? []).map(s =>
      s.id === sesionHoy.id
        ? {
          ...s, estado: 'cerrada' as const,
          cierre: {
            hora,
            conteoEfectivo: contado,
            diferencia,
            observaciones: obsCliente.trim(),
            totalVentas: totalesHoy._total,
            conteo: totalesHoy._count,
            desgloseMetodos: totalesHoy.desgloseMetodos,
          },
        }
        : s
    )
    await guardarSesiones.mutateAsync(updated)
    setCerrando(false)
    setConteoEfect('')
    setObsCliente('')
    setGuardando(false)
  }

  if (cargandoCajas || cargandoSes) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  if (cajasActivas.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-400 text-sm">No hay cajas configuradas.</p>
        <p className="text-gray-400 text-xs mt-1">Configura cajas en Configuración &rsaquo; Ventas.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Selector de caja */}
      {cajasActivas.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="text-xs font-semibold text-gray-500 uppercase block mb-2">Caja</label>
          <div className="flex gap-2 flex-wrap">
            {cajasActivas.map(c => (
              <button key={c.id}
                onClick={() => { setCajaSelId(c.id); setCerrando(false) }}
                className={['px-4 py-2 rounded-xl border-2 text-sm font-semibold transition',
                  (cajaActual?.id === c.id)
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'].join(' ')}>
                {c.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {cajaActual && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header caja */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">{cajaActual.nombre}</h3>
              <p className="text-xs text-gray-400">Hoy: {today()}</p>
            </div>
            <span className={[
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
              sesionHoy ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
            ].join(' ')}>
              <span className={['w-1.5 h-1.5 rounded-full', sesionHoy ? 'bg-green-500' : 'bg-gray-400'].join(' ')} />
              {sesionHoy ? 'Abierta' : 'Cerrada'}
            </span>
          </div>

          {!sesionHoy ? (
            /* Formulario apertura */
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">Ingresa el fondo inicial para abrir la caja del día.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Fondo inicial</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" value={fondo} onChange={e => setFondo(e.target.value)}
                      placeholder="0"
                      className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Responsable</label>
                  <input value={responsable} onChange={e => setResponsable(e.target.value)}
                    placeholder={nombreUsuario || 'Nombre'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <button onClick={abrirCaja} disabled={guardando}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-60 transition">
                {guardando ? 'Abriendo…' : 'Abrir caja'}
              </button>
            </div>
          ) : cerrando ? (
            /* Formulario cierre */
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Cuadratura de cierre</p>

              {/* Resumen automático */}
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2 text-sm">
                  <span className="text-gray-600">Sistema espera (efectivo + fondo)</span>
                  <span className="text-gray-700">{fmt(esperadoEfect)}</span>
                </div>
                <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Ventas por método de pago</p>
                {totalesHoy.desgloseMetodos.map(row => (
                  <div key={row.metodoId} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2 text-sm">
                    <span className="text-gray-600">
                      {row.nombre}
                      <span className="ml-1.5 text-xs text-gray-400">({row.cantidad})</span>
                    </span>
                    <span className="font-medium text-gray-800">{fmt(row.monto)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center bg-blue-50 rounded-lg px-4 py-2.5 text-sm">
                  <span className="font-semibold text-blue-700">Total ventas del día ({totalesHoy._count})</span>
                  <span className="font-bold text-blue-700">{fmt(totalesHoy._total)}</span>
                </div>
              </div>

              {/* Conteo efectivo */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Efectivo contado</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" value={conteoEfect} onChange={e => setConteoEfect(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
                {conteoEfect && (
                  <p className={['text-sm font-semibold mt-1', diferencia === 0 ? 'text-gray-400' : diferencia > 0 ? 'text-green-600' : 'text-red-600'].join(' ')}>
                    {diferencia === 0 ? 'Cuadrado exacto'
                      : diferencia > 0 ? `▲ Sobrante ${fmt(diferencia)}`
                      : `▼ Faltante ${fmt(Math.abs(diferencia))}`}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Observaciones</label>
                <textarea value={obsCliente} onChange={e => setObsCliente(e.target.value)}
                  rows={2} placeholder="Ej: faltante de $5.000, se revisará mañana..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setCerrando(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-100 transition">
                  Cancelar
                </button>
                <button onClick={cerrarCaja} disabled={guardando}
                  className="flex-1 bg-gray-900 text-white font-semibold py-2.5 rounded-xl hover:bg-gray-800 disabled:opacity-60 transition">
                  {guardando ? 'Cerrando…' : 'Confirmar cierre'}
                </button>
              </div>
            </div>
          ) : (
            /* Vista caja abierta: totales */
            <div className="px-6 py-5 space-y-4">
              <div className="text-xs text-gray-400">
                Apertura: {sesionHoy.apertura.hora} · {sesionHoy.apertura.responsable}
                {(sesionHoy.apertura.montoInicial ?? 0) > 0 && ` · Fondo ${fmt(sesionHoy.apertura.montoInicial!)}`}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Efectivo', value: totalesHoy.efectivo },
                  { label: 'Débito', value: totalesHoy.debito },
                  { label: 'Crédito', value: totalesHoy.credito },
                  { label: 'Transferencia', value: totalesHoy.transferencia },
                  { label: 'Otro', value: totalesHoy.otro },
                ].filter(r => r.value > 0 || r.label === 'Efectivo').map(r => (
                  <div key={r.label} className="bg-gray-50 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-400 mb-1">{r.label}</p>
                    <p className="font-bold text-gray-900">{fmt(r.value)}</p>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 rounded-xl px-5 py-4 flex justify-between items-center">
                <span className="text-sm font-semibold text-blue-700">Total del día ({totalesHoy._count} ventas)</span>
                <span className="text-xl font-extrabold text-blue-700">{fmt(totalesHoy._total)}</span>
              </div>

              <button onClick={() => navigate(`/ventas?tab=pos&caja=${encodeURIComponent(cajaActual.id)}`)}
                className="w-full border border-blue-200 bg-blue-50 text-blue-700 font-semibold py-3 rounded-xl hover:bg-blue-100 transition">
                Ir al POS de {cajaActual.nombre} →
              </button>

              <button onClick={() => setCerrando(true)}
                className="w-full bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-800 transition">
                Cerrar y cuadrar caja →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase">Historial reciente</p>
          </div>
          <div className="divide-y divide-gray-100">
            {historial.map(s => (
              <div key={s.id} className="px-4 py-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-4">
                  <div><p className="text-[11px] text-gray-400">Fecha</p><p className="text-gray-600">{s.fecha}</p></div>
                  <div className="text-right"><p className="text-[11px] text-gray-400">Total ventas</p><p className="font-medium text-gray-900">{fmt(s.cierre?.totalVentas ?? 0)}</p></div>
                  <div><p className="text-[11px] text-gray-400">Conteo efectivo</p><p className="text-gray-600">{fmt(s.cierre?.conteoEfectivo ?? 0)}</p></div>
                  <div className="text-right"><p className="text-[11px] text-gray-400">Diferencia</p><p className={['font-medium',
                    (s.cierre?.diferencia ?? 0) === 0 ? 'text-gray-400'
                    : (s.cierre?.diferencia ?? 0) > 0 ? 'text-green-600' : 'text-red-600'].join(' ')}>
                    {(s.cierre?.diferencia ?? 0) === 0 ? '—' : fmt(s.cierre?.diferencia ?? 0)}
                  </p></div>
                </div>
                {(s.cierre?.desgloseMetodos?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                    {s.cierre!.desgloseMetodos!.map(metodo => (
                      <div key={metodo.metodoId} className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                        <span>{metodo.nombre} · {metodo.cantidad}</span>
                        <span className="ml-2 font-semibold text-gray-800">{fmt(metodo.monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
