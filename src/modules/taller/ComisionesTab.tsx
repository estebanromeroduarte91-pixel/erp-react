import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useBodegas, useOrdenesLite } from '@/lib/queries'
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
  const { data: ordenes = [], isLoading } = useOrdenesLite()
  const { data: bodegas = [] } = useBodegas()
  const { rol, session, esAdmin, esPlatformAdmin } = useAuth()
  const puedeGestionar = esAdmin || esPlatformAdmin || rol === 'admin'

  const filas = useMemo(() => ordenes
    .filter(o => o.comisionTecnicaActiva && (o.comisionTecnicaMonto ?? 0) > 0 && o.venta_id)
    .filter(o => puedeGestionar || o.tecnicoId === session?.user?.id)
    .sort((a, b) => Number(a.comisionTecnicaPagada) - Number(b.comisionTecnicaPagada) || b.fecha.localeCompare(a.fecha)),
  [ordenes, puedeGestionar, session?.user?.id])

  const pendientes = filas.filter(o => !o.comisionTecnicaPagada)
  const totalPendiente = pendientes.reduce((acc, o) => acc + (o.comisionTecnicaMonto ?? 0), 0)
  const totalPagado = filas.filter(o => o.comisionTecnicaPagada).reduce((acc, o) => acc + (o.comisionTecnicaMonto ?? 0), 0)

  if (isLoading) return <div className="py-16 flex justify-center"><Spinner /></div>

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

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Detalle por orden</h3>
            <p className="text-xs text-gray-500 mt-0.5">El pago se registra desde la orden y crea el gasto automáticamente.</p>
          </div>
          <span className="text-xs text-gray-400">{filas.length} registros</span>
        </div>
        {filas.length === 0 ? (
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
                {filas.map(o => {
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
