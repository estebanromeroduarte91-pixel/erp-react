import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { useBodegas } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'

function fechaCorta(fecha?: string) {
  if (!fecha) return '—'
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL')
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
        .not('comision_tecnica_monto', 'is', null)
        .not('venta_id', 'is', null)
      if (!puedeGestionar) query = query.eq('tecnico_id', session!.user.id)
      const { data, error: queryError } = await query.order('fecha', { ascending: false })
      if (queryError) throw queryError
      return (data ?? []).map(row => ({
        id: row.id, num: row.num, fecha: row.fecha, modelo: row.modelo, trabajo: row.trabajo,
        tecnico: row.tecnico, tecnicoId: row.tecnico_id, branchId: row.branch_id,
        venta_id: row.venta_id, comisionTecnicaActiva: row.comision_tecnica_activa,
        comisionTecnicaBruto: Number(row.comision_tecnica_bruto ?? 0),
        comisionTecnicaBase: Number(row.comision_tecnica_base ?? 0),
        comisionTecnicaPorcentaje: Number(row.comision_tecnica_porcentaje ?? 0),
        comisionTecnicaMonto: Number(row.comision_tecnica_monto ?? 0),
        comisionTecnicaPagada: Boolean(row.comision_tecnica_pagada),
        comisionTecnicaPagadaAt: row.comision_tecnica_pagada_at,
      }))
    },
  })

  const filas = useMemo(() => ordenes
    .filter(o => o.comisionTecnicaActiva && (o.comisionTecnicaMonto ?? 0) > 0 && o.venta_id)
    .filter(o => puedeGestionar || o.tecnicoId === session?.user?.id)
    .sort((a, b) => Number(a.comisionTecnicaPagada) - Number(b.comisionTecnicaPagada) || b.fecha.localeCompare(a.fecha)),
  [ordenes, puedeGestionar, session?.user?.id])

  const pendientes = filas.filter(o => !o.comisionTecnicaPagada)
  const totalPendiente = pendientes.reduce((acc, o) => acc + (o.comisionTecnicaMonto ?? 0), 0)
  const totalPagado = filas.filter(o => o.comisionTecnicaPagada).reduce((acc, o) => acc + (o.comisionTecnicaMonto ?? 0), 0)
  const porTecnico = useMemo(() => Object.values(filas.reduce<Record<string, {
    id: string; nombre: string; pendientes: number; pagadas: number; total: number; ordenes: number
  }>>((acc, orden) => {
    const id = orden.tecnicoId || orden.tecnico || 'sin-tecnico'
    if (!acc[id]) acc[id] = { id, nombre: orden.tecnico || 'Sin técnico asignado', pendientes: 0, pagadas: 0, total: 0, ordenes: 0 }
    const monto = orden.comisionTecnicaMonto ?? 0
    acc[id].total += monto
    acc[id].ordenes += 1
    if (orden.comisionTecnicaPagada) acc[id].pagadas += monto
    else acc[id].pendientes += monto
    return acc
  }, {})).sort((a, b) => b.pendientes - a.pendientes || b.total - a.total), [filas])
  const filasVisibles = tecnicoSeleccionado ? filas.filter(o => (o.tecnicoId || o.tecnico || 'sin-tecnico') === tecnicoSeleccionado) : filas

  if (isLoading) return <div className="py-16 flex justify-center"><Spinner /></div>
  if (error) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
      No se pudieron cargar las comisiones. Falta aplicar la migración de comisiones técnicas en la base de datos.
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Comisiones</h2>
        <p className="text-sm text-gray-500 mt-1">
          {puedeGestionar ? 'Comisiones de los técnicos y estado de pago.' : 'Tus comisiones asignadas y su estado de pago.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Kpi label="Pendiente de pago" value={totalPendiente} tone="amber" />
        <Kpi label="Comisiones pagadas" value={totalPagado} tone="green" />
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Órdenes con comisión</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{filas.length}</div>
          <div className="text-xs text-gray-500 mt-1">{pendientes.length} pendientes</div>
        </div>
      </div>

      {puedeGestionar && porTecnico.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Resumen por empleado</h3>
            <p className="text-xs text-gray-500 mt-0.5">Montos acumulados de comisiones por técnico.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-gray-100">
            {porTecnico.map(persona => (
              <button
                type="button"
                key={persona.id}
                onClick={() => setTecnicoSeleccionado(actual => actual === persona.id ? '' : persona.id)}
                className={`bg-white p-5 text-left transition hover:bg-blue-50/50 ${tecnicoSeleccionado === persona.id ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/40' : ''}`}
              >
                <div className="font-semibold text-gray-900 truncate">{persona.nombre}</div>
                <div className="mt-3 flex justify-between gap-3 text-sm"><span className="text-gray-500">Pendiente</span><span className="font-semibold text-amber-700"><Money value={persona.pendientes} /></span></div>
                <div className="mt-1.5 flex justify-between gap-3 text-sm"><span className="text-gray-500">Pagado</span><span className="font-semibold text-emerald-700"><Money value={persona.pagadas} /></span></div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between gap-3 text-xs text-gray-500"><span>{persona.ordenes} órdenes</span><span className="font-semibold text-gray-800"><Money value={persona.total} /></span></div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Detalle por orden</h3>
            <p className="text-xs text-gray-500 mt-0.5">El pago se registra desde la orden y crea el gasto automáticamente.</p>
          </div>
          <div className="flex items-center gap-3">
            {puedeGestionar && porTecnico.length > 1 && <select value={tecnicoSeleccionado} onChange={e => setTecnicoSeleccionado(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700">
              <option value="">Todos los empleados</option>
              {porTecnico.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>}
            <span className="text-xs text-gray-400">{filasVisibles.length} registros</span>
          </div>
        </div>
        {filasVisibles.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">No hay comisiones registradas todavía.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Orden</th>
                  {puedeGestionar && <th className="text-left font-semibold px-4 py-3">Técnico</th>}
                  <th className="text-left font-semibold px-4 py-3">Sucursal</th>
                  <th className="text-right font-semibold px-4 py-3">Bruto cobrado</th>
                  <th className="text-right font-semibold px-4 py-3">Neto comisionable</th>
                  <th className="text-right font-semibold px-4 py-3">Comisión</th>
                  <th className="text-left font-semibold px-5 py-3">Estado</th>
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
                    <td className="px-4 py-3.5 text-right text-gray-700"><Money value={o.comisionTecnicaBruto ?? 0} /></td>
                    <td className="px-4 py-3.5 text-right text-gray-700"><Money value={o.comisionTecnicaBase ?? 0} /></td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-900"><Money value={o.comisionTecnicaMonto ?? 0} /></td>
                    <td className="px-5 py-3.5">
                      {o.comisionTecnicaPagada ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Pagada · {fechaCorta(o.comisionTecnicaPagadaAt)}</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Pendiente</span>
                      )}
                    </td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'green' }) {
  const color = tone === 'amber' ? 'text-amber-700' : 'text-emerald-700'
  return <div className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    <div className={`text-2xl font-bold mt-2 ${color}`}><Money value={value} /></div>
  </div>
}
