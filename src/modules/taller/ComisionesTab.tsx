import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { useBodegas, usePagarComisionTecnica } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import { PagoComisionModal } from './PagoComisionModal'

/**
 * `ordenes.fecha` viene como 'YYYY-MM-DD' pero `comision_tecnica_pagada_at` es
 * un timestamp completo. Concatenarle 'T12:00:00' a un timestamp producía
 * `Invalid Date`, así que se recorta a los primeros 10 caracteres antes de
 * armar la fecha local (y así tampoco se corre de día por zona horaria).
 */
function soloFecha(valor?: string | null) {
  return valor ? valor.slice(0, 10) : ''
}

function fechaCorta(fecha?: string | null) {
  const dia = soloFecha(fecha)
  if (!dia) return '—'
  return new Date(`${dia}T12:00:00`).toLocaleDateString('es-CL')
}

const claveMes = (valor?: string | null) => soloFecha(valor).slice(0, 7)

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const plural = (n: number, singular: string, p: string) => `${n} ${n === 1 ? singular : p}`

/** Días transcurridos desde la fecha de la orden, para avisar atrasos. */
function diasDesde(fecha?: string | null) {
  const dia = soloFecha(fecha)
  if (!dia) return 0
  return Math.max(0, Math.round((Date.now() - new Date(`${dia}T12:00:00`).getTime()) / 86400000))
}

/**
 * Resumen de comisiones. Para un técnico la lista se restringe a sus propias
 * órdenes; administración puede gestionar el conjunto completo desde aquí.
 */
export function ComisionesTab() {
  const { data: bodegas = [] } = useBodegas()
  const { rol, session, esAdmin, esPlatformAdmin, empresaId } = useAuth()
  const puedeGestionar = esAdmin || esPlatformAdmin || rol === 'admin'
  const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState('')
  // El mes arranca en el actual y filtra por FECHA DE PAGO, así que solo afecta
  // a las comisiones ya pagadas. Lo pendiente es deuda viva y se muestra
  // completo: una comisión de julio sin pagar tiene que verse en septiembre.
  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), 1) })
  const [estado, setEstado] = useState<'pendiente' | 'pagada' | 'confirmar' | 'anulada'>('pendiente')
  // Orden cuyo pago se está registrando. El mismo modal que usa la ficha de la
  // orden, para que el flujo y el gasto que genera sean idénticos por los dos lados.
  const [pagando, setPagando] = useState<{ id: string; tecnico: string; monto: number } | null>(null)
  const pagarComision = usePagarComisionTecnica()
  const { data: ordenes = [], isLoading, error } = useQuery({
    queryKey: ['comisiones-tecnicas', empresaId, session?.user?.id, puedeGestionar],
    enabled: !!empresaId && !!session?.user?.id,
    queryFn: async () => {
      let query = supabase
        .from('ordenes')
        .select('id, num, fecha, modelo, trabajo, tecnico, tecnico_id, branch_id, venta_id, comision_tecnica_activa, comision_tecnica_bruto, comision_tecnica_base, comision_tecnica_porcentaje, comision_tecnica_monto, comision_tecnica_pagada, comision_tecnica_pagada_at')
        .eq('empresa_id', empresaId!)
        .eq('is_draft', false)
        .eq('comision_tecnica_activa', true)
      if (!puedeGestionar) query = query.eq('tecnico_id', session!.user.id)
      const { data, error: queryError } = await query.order('fecha', { ascending: false })
      if (queryError) throw queryError
      const ventaIds = [...new Set((data ?? []).map(row => row.venta_id).filter((id): id is string => !!id))]
      const estadosVenta = new Map<string, string>()
      if (ventaIds.length) {
        const { data: ventas, error: ventasError } = await supabase
          .from('ventas')
          .select('id, estado')
          .eq('empresa_id', empresaId!)
          .in('id', ventaIds)
        if (ventasError) throw ventasError
        ventas?.forEach(venta => estadosVenta.set(venta.id, venta.estado))
      }
      return (data ?? []).map(row => {
        const bruto = Number(row.comision_tecnica_bruto ?? 0)
        const porcentaje = Number(row.comision_tecnica_porcentaje ?? 0)
        const baseEstimada = Math.round(bruto / 1.19)
        const montoEstimado = Math.round(baseEstimada * porcentaje / 100)
        return {
        id: row.id, num: row.num, fecha: row.fecha, modelo: row.modelo, trabajo: row.trabajo,
        tecnico: row.tecnico, tecnicoId: row.tecnico_id, branchId: row.branch_id,
        venta_id: row.venta_id, ventaEstado: row.venta_id ? estadosVenta.get(row.venta_id) : undefined,
        comisionTecnicaActiva: row.comision_tecnica_activa,
        comisionTecnicaBruto: bruto,
        comisionTecnicaBase: row.comision_tecnica_base == null ? baseEstimada : Number(row.comision_tecnica_base),
        comisionTecnicaPorcentaje: porcentaje,
        comisionTecnicaMonto: row.comision_tecnica_monto == null ? montoEstimado : Number(row.comision_tecnica_monto),
        comisionTecnicaPagada: Boolean(row.comision_tecnica_pagada),
        comisionTecnicaPagadaAt: row.comision_tecnica_pagada_at,
      }})
    },
  })

  const filas = useMemo(() => ordenes
    .filter(o => o.comisionTecnicaActiva && (o.comisionTecnicaMonto ?? 0) > 0)
    .filter(o => puedeGestionar || o.tecnicoId === session?.user?.id)
    .sort((a, b) => Number(a.comisionTecnicaPagada) - Number(b.comisionTecnicaPagada) || b.fecha.localeCompare(a.fecha)),
  [ordenes, puedeGestionar, session?.user?.id])

  const mesClave = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`
  const mesEtiqueta = `${MESES[mes.getMonth()]} ${mes.getFullYear()}`
  const suma = (lista: typeof filas) => lista.reduce((acc, o) => acc + (o.comisionTecnicaMonto ?? 0), 0)

  const ventaVigente = (orden: typeof filas[number]) => orden.ventaEstado === 'pagada'
  const pendientes = filas.filter(o => ventaVigente(o) && !o.comisionTecnicaPagada)
  const porConfirmar = filas.filter(o => !o.venta_id)
  const anuladas = filas.filter(o => !!o.venta_id && !ventaVigente(o) && !o.comisionTecnicaPagada)
  // Las pagadas SÍ se acotan al mes, por su fecha de pago.
  const pagadasDelMes = filas.filter(o => o.comisionTecnicaPagada && claveMes(o.comisionTecnicaPagadaAt) === mesClave)
  const totalPendiente = suma(pendientes)
  const totalPorConfirmar = suma(porConfirmar)
  const totalPagado = suma(pagadasDelMes)
  const porTecnico = useMemo(() => Object.values(filas.reduce<Record<string, {
    id: string; nombre: string; pendientes: number; porConfirmar: number; pagadas: number; total: number; ordenes: number; ordenesPendientes: number
  }>>((acc, orden) => {
    const id = orden.tecnicoId || orden.tecnico || 'sin-tecnico'
    if (!acc[id]) acc[id] = { id, nombre: orden.tecnico || 'Sin técnico asignado', pendientes: 0, porConfirmar: 0, pagadas: 0, total: 0, ordenes: 0, ordenesPendientes: 0 }
    const monto = orden.comisionTecnicaMonto ?? 0
    acc[id].total += monto
    acc[id].ordenes += 1
    // `pagadas` cuenta solo lo pagado en el mes elegido; lo pendiente va completo.
    if (orden.comisionTecnicaPagada) {
      if (claveMes(orden.comisionTecnicaPagadaAt) === mesClave) acc[id].pagadas += monto
    } else if (orden.ventaEstado === 'pagada') { acc[id].pendientes += monto; acc[id].ordenesPendientes += 1 }
    else acc[id].porConfirmar += monto
    return acc
  }, {})).filter(p => p.pendientes > 0 || p.pagadas > 0 || p.porConfirmar > 0)
    .sort((a, b) => b.pendientes - a.pendientes || b.pagadas - a.pagadas), [filas, mesClave])
  const porEstado = estado === 'pagada' ? pagadasDelMes : estado === 'pendiente' ? pendientes : estado === 'confirmar' ? porConfirmar : anuladas
  const filasVisibles = (tecnicoSeleccionado
    ? porEstado.filter(o => (o.tecnicoId || o.tecnico || 'sin-tecnico') === tecnicoSeleccionado)
    : porEstado
  ).slice().sort((a, b) => estado === 'pagada'
    ? soloFecha(b.comisionTecnicaPagadaAt).localeCompare(soloFecha(a.comisionTecnicaPagadaAt))
    : a.fecha.localeCompare(b.fecha))

  if (isLoading) return <div className="py-16 flex justify-center"><Spinner /></div>
  if (error) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
      No se pudieron cargar las comisiones. Falta aplicar la migración de comisiones técnicas en la base de datos.
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Comisiones</h2>
          <p className="text-sm text-gray-500 mt-1">
            {puedeGestionar ? 'Qué debes pagar, qué ya pagaste y el detalle de cada orden.' : 'Tus comisiones y su estado de pago.'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Mes anterior" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition">‹</button>
          <span className="min-w-[150px] text-center text-sm font-bold text-gray-900 capitalize">{mesEtiqueta}</span>
          <button type="button" aria-label="Mes siguiente" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition">›</button>
        </div>
      </div>

      {/* Cada tarjeta declara su alcance: dos son acumuladas y una es del mes.
          Sin decirlo, tres cifras lado a lado con reglas distintas confunden. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Kpi label="Por pagar" value={totalPendiente} tone="amber"
          detalle={plural(pendientes.length, 'orden', 'órdenes')} alcance="acumulado, todos los meses" />
        <Kpi label="Pagado" value={totalPagado} tone="green"
          detalle={plural(pagadasDelMes.length, 'orden', 'órdenes')} alcance={`pagado en ${mesEtiqueta}`} />
        <Kpi label="Por confirmar venta" value={totalPorConfirmar} tone="blue"
          detalle={plural(porConfirmar.length, 'orden', 'órdenes')} alcance="acumulado, todos los meses" />
        <Kpi label="Ventas no vigentes" value={suma(anuladas)} tone="gray"
          detalle={plural(anuladas.length, 'orden', 'órdenes')} alcance="no se pueden pagar" />
      </div>

      {puedeGestionar && porTecnico.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Por empleado</h3>
            <p className="text-xs text-gray-500 mt-0.5">Lo que le debes a cada uno, y lo que le pagaste en {mesEtiqueta}.</p>
          </div>
          {/* Tabla y no tarjetas: una grilla de tres columnas se ve rota con un
              solo empleado, que es el caso normal en un taller chico. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Empleado</th>
                  <th className="text-right font-semibold px-4 py-3">Órdenes por pagar</th>
                  <th className="text-right font-semibold px-4 py-3">Por pagar</th>
                  <th className="text-right font-semibold px-5 py-3">Pagado en {MESES[mes.getMonth()]}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {porTecnico.map(persona => (
                  <tr key={persona.id}
                    onClick={() => setTecnicoSeleccionado(actual => actual === persona.id ? '' : persona.id)}
                    className={`cursor-pointer transition ${tecnicoSeleccionado === persona.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-5 py-3 font-semibold text-gray-900">{persona.nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {persona.ordenesPendientes || <span className="text-gray-300">0</span>}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${persona.pendientes ? 'font-bold text-amber-700' : 'text-gray-300'}`}>
                      <Money value={persona.pendientes} />
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums ${persona.pagadas ? 'text-gray-700' : 'text-gray-300'}`}>
                      <Money value={persona.pagadas} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold text-gray-900">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{porTecnico.reduce((a, p) => a + p.ordenesPendientes, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums"><Money value={totalPendiente} /></td>
                  <td className="px-5 py-3 text-right tabular-nums"><Money value={totalPagado} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Detalle por orden</h3>
            <p className="text-xs text-gray-500 mt-0.5">El pago se registra desde la orden y crea el gasto automáticamente.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {puedeGestionar && porTecnico.length > 1 && <select value={tecnicoSeleccionado} onChange={e => setTecnicoSeleccionado(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700">
              <option value="">Todos los empleados</option>
              {porTecnico.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>}
            <div className="flex gap-1 flex-wrap">
              {([
                ['pendiente', 'Por pagar', pendientes.length],
                ['pagada', `Pagadas en ${MESES[mes.getMonth()]}`, pagadasDelMes.length],
                ['confirmar', 'Por confirmar', porConfirmar.length],
                ['anulada', 'No vigentes', anuladas.length],
              ] as const).map(([id, label, n]) => (
                <button key={id} type="button" onClick={() => setEstado(id)} aria-pressed={estado === id}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition ${
                    estado === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {label} <span className="opacity-60 font-bold">{n}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {filasVisibles.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">
            {estado === 'pagada' ? `No pagaste comisiones en ${mesEtiqueta}.`
              : estado === 'pendiente' ? 'No hay comisiones por pagar. Estás al día.'
              : estado === 'confirmar' ? 'No hay comisiones esperando confirmación de venta.'
              : 'No hay comisiones vinculadas a ventas anuladas o no vigentes.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Orden</th>
                  {puedeGestionar && <th className="text-left font-semibold px-4 py-3">Técnico</th>}
                  <th className="text-left font-semibold px-4 py-3">Sucursal</th>
                  <th className="text-left font-semibold px-4 py-3">{estado === 'pagada' ? 'Pagada el' : 'Fecha de la orden'}</th>
                  <th className="text-right font-semibold px-4 py-3">Bruto cobrado</th>
                  <th className="text-right font-semibold px-4 py-3">Comisión</th>
                  {puedeGestionar && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filasVisibles.map(o => {
                  const sucursal = bodegas.find(b => b.id === o.branchId)?.nombre ?? 'Sin sucursal'
                  return <tr key={o.id} className="hover:bg-gray-50/70">
                    <td className="px-5 py-3.5">
                      <Link to={`/taller?abrir=${encodeURIComponent(o.num)}`} className="font-semibold text-blue-600 hover:text-blue-700">OT #{o.num}</Link>
                      <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[210px]">{o.modelo || o.trabajo || fechaCorta(o.fecha)}</div>
                    </td>
                    {puedeGestionar && <td className="px-4 py-3.5 text-gray-700">{o.tecnico || 'Sin técnico'}</td>}
                    <td className="px-4 py-3.5 text-gray-600">{sucursal}</td>
                    <td className="px-4 py-3.5 text-gray-600 tabular-nums whitespace-nowrap">
                      {estado === 'pagada' ? fechaCorta(o.comisionTecnicaPagadaAt) : fechaCorta(o.fecha)}
                      {estado === 'pagada' && <span className="block text-xs text-gray-400">orden del {fechaCorta(o.fecha)}</span>}
                      {estado === 'pendiente' && diasDesde(o.fecha) > 30 &&
                        <span className="block text-xs font-semibold text-amber-700">hace {diasDesde(o.fecha)} días</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right text-gray-700"><Money value={o.comisionTecnicaBruto ?? 0} /></td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-900 tabular-nums">
                      <Money value={o.comisionTecnicaMonto ?? 0} />
                      {(o.comisionTecnicaPorcentaje ?? 0) > 0 && <span className="block text-xs font-normal text-gray-400">
                        {o.comisionTecnicaPorcentaje}% sobre <Money value={o.comisionTecnicaBase ?? 0} />
                      </span>}
                    </td>
                    {puedeGestionar && <td className="px-5 py-3.5 text-right">
                      {/* Solo se paga lo que ya tiene venta confirmada; sin venta
                          la comisión todavía no es exigible. */}
                      {!o.comisionTecnicaPagada && ventaVigente(o) && (
                        <button type="button"
                          onClick={() => setPagando({ id: o.id, tecnico: o.tecnico || 'Técnico asignado', monto: o.comisionTecnicaMonto ?? 0 })}
                          className="whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-900 hover:bg-gray-50 transition">
                          Pagar
                        </button>
                      )}
                    </td>}
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagando && (
        <PagoComisionModal
          tecnico={pagando.tecnico}
          monto={pagando.monto}
          onClose={() => setPagando(null)}
          onConfirm={async ({ fecha, metodo }) => {
            await pagarComision.mutateAsync({ ordenId: pagando.id, fecha, metodo })
            setPagando(null)
          }}
        />
      )}
    </div>
  )
}

function Kpi({ label, value, tone, detalle, alcance }: {
  label: string; value: number; tone: 'amber' | 'green' | 'blue' | 'gray'; detalle: string; alcance: string
}) {
  const color = value === 0 ? 'text-gray-300'
    : tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-emerald-700' : tone === 'blue' ? 'text-blue-700' : 'text-gray-600'
  return <div className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    <div className={`text-2xl font-bold mt-2 tabular-nums ${color}`}><Money value={value} /></div>
    <div className="text-xs text-gray-500 mt-1">{detalle}</div>
    <div className="text-[11px] text-gray-400 mt-0.5">{alcance}</div>
  </div>
}
