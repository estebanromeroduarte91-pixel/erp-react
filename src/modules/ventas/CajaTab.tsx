import { useState, useMemo } from 'react'
import { useCajas, useCajaSesiones, useGuardarCajaSesiones, useVentas, useMetodosPago } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { CajaSesion } from '@/types'

function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function nowTime() {
  return new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}
function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

export function CajaTab() {
  const { nombre: nombreUsuario, branchId } = useAuth()
  const { data: cajas, isLoading: cargandoCajas } = useCajas()
  const { data: sesiones, isLoading: cargandoSes } = useCajaSesiones()
  const { data: ventas } = useVentas()
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
    if (!branchId) return todas
    return todas.filter(c => !c.sucursalId || c.sucursalId === branchId)
  }, [cajas, branchId])
  const cajaActual = cajasActivas.find(c => c.id === cajaSelId) ?? cajasActivas[0]

  const sesionHoy = useMemo(() => {
    if (!cajaActual) return null
    return (sesiones ?? []).find(s =>
      s.fecha === today() && s.cajaId === cajaActual.id && s.estado === 'abierta'
    ) ?? null
  }, [sesiones, cajaActual])

  const totalesHoy = useMemo(() => {
    if (!cajaActual) return { efectivo: 0, debito: 0, credito: 0, transferencia: 0, otro: 0, _total: 0, _count: 0 }
    const mpMap: Record<string, string> = {}
    ;(metodos ?? []).forEach(m => { mpMap[m.id] = (m.label ?? '').toLowerCase() })

    const ventasHoy = (ventas ?? []).filter(v =>
      v.estado !== 'anulada' && v.fecha === today() && v.cajaId === cajaActual.id
    )
    const totales = { efectivo: 0, debito: 0, credito: 0, transferencia: 0, otro: 0, _total: 0, _count: 0 }
    ventasHoy.forEach(v => {
      const label = mpMap[v.metodo_pago] ?? v.metodo_pago ?? ''
      const monto = +v.total_iva || 0
      totales._total += monto
      totales._count++
      if (label.includes('efect')) totales.efectivo += monto
      else if (label.includes('debit') || label.includes('deb')) totales.debito += monto
      else if (label.includes('credit') || label.includes('cred')) totales.credito += monto
      else if (label.includes('transf')) totales.transferencia += monto
      else totales.otro += monto
    })
    return totales
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
                {[
                  { label: 'Sistema espera (efectivo + fondo)', value: esperadoEfect, bold: false },
                  ...(totalesHoy.debito > 0 ? [{ label: 'Débito (automático)', value: totalesHoy.debito, bold: false }] : []),
                  ...(totalesHoy.credito > 0 ? [{ label: 'Crédito (automático)', value: totalesHoy.credito, bold: false }] : []),
                  ...(totalesHoy.transferencia > 0 ? [{ label: 'Transferencia (automático)', value: totalesHoy.transferencia, bold: false }] : []),
                  { label: 'Total ventas del día', value: totalesHoy._total, bold: true },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2 text-sm">
                    <span className={row.bold ? 'font-semibold text-gray-800' : 'text-gray-600'}>{row.label}</span>
                    <span className={row.bold ? 'font-bold text-gray-900' : 'text-gray-700'}>{fmt(row.value)}</span>
                  </div>
                ))}
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50">
                <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Fecha</th>
                <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Total ventas</th>
                <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Conteo efectivo</th>
                <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {historial.map(s => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-gray-600">{s.fecha}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {fmt(s.cierre?.totalVentas ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {fmt(s.cierre?.conteoEfectivo ?? 0)}
                  </td>
                  <td className={['px-4 py-3 text-right font-medium',
                    (s.cierre?.diferencia ?? 0) === 0 ? 'text-gray-400'
                    : (s.cierre?.diferencia ?? 0) > 0 ? 'text-green-600' : 'text-red-600'].join(' ')}>
                    {(s.cierre?.diferencia ?? 0) === 0 ? '—' : fmt(s.cierre?.diferencia ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
