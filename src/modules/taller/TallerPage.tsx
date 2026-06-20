import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useOrdenes, useTraslados } from '@/lib/queries'
import { EstadoBadge } from '@/components/shared/Badge'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import { OrdenModal } from './OrdenModal'
import { TrasladosTab } from './TrasladosTab'
import { EquiposTab } from './EquiposTab'
import { SeguimientoTab } from '@/modules/config/SeguimientoTab'
import { ChecklistConfigTab } from '@/modules/config/ChecklistConfigTab'
import { MensajesTab } from '@/modules/config/MensajesTab'
import { TerminosTab } from '@/modules/config/TerminosTab'
import { EquiposConfigTab } from './EquiposConfigTab'
import type { EstadoOrden, Orden } from '@/types'

type TallerTab = 'ordenes' | 'derivados' | 'equipos' | 'settings'
type TallerConfigTab = 'seguimiento' | 'checklist' | 'notificaciones' | 'terminos' | 'equipos-config'

const CONFIG_TABS: { id: TallerConfigTab; label: string }[] = [
  { id: 'seguimiento',    label: 'Seguimiento' },
  { id: 'checklist',      label: 'Checklist' },
  { id: 'notificaciones', label: 'Notificaciones' },
  { id: 'terminos',       label: 'Términos' },
  { id: 'equipos-config', label: 'Equipos' },
]


function resolveTallerTab(param: string | null): TallerTab {
  if (param === 'derivados') return 'derivados'
  if (param === 'equipos')   return 'equipos'
  if (param === 'settings')  return 'settings'
  return 'ordenes'
}

const ESTADOS_MAIN: { value: EstadoOrden | 'todos' | 'Derivado'; label: string }[] = [
  { value: 'todos',      label: 'Todos' },
  { value: 'Chequeo',    label: 'Chequeo' },
  { value: 'Reparación', label: 'Reparación' },
  { value: 'Listo',      label: 'Listos' },
  { value: 'Derivado',   label: '🔄 Derivados' },
]

export function totalOrden(o: Orden): number {
  const manual = Number(o.costo) || Number(o.presup) || 0
  if (manual) return manual
  return (o.repuestos ?? []).reduce((s, r) => s + r.precio * (r.qty ?? 1), 0)
}

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    })
  } catch {
    return iso
  }
}

// Días que la orden lleva en el taller
function ordenAge(o: Orden): number {
  if (!o.fecha) return 0
  const d = new Date(o.fecha)
  if (isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
}

function ageLabel(age: number): string {
  if (age === 0) return 'Hoy'
  if (age === 1) return '1 día'
  return `${age} días`
}

export function TallerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [tallerTab, setTallerTab] = useState<TallerTab>(() => resolveTallerTab(searchParams.get('tab')))

  useEffect(() => {
    setTallerTab(resolveTallerTab(searchParams.get('tab')))
  }, [searchParams])

  const { data: ordenes, isLoading, error } = useOrdenes()
  const { data: traslados } = useTraslados()
  const [configTab, setConfigTab] = useState<TallerConfigTab>('seguimiento')
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | 'todos' | 'Derivado'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Orden | null>(null)

  // IDs de órdenes con traslados activos (no retornados)
  const derivadoIds = useMemo(
    () => new Set((traslados ?? []).filter((t) => t.estado !== 'retornado' && t.order_id).map((t) => t.order_id!)),
    [traslados],
  )

  const lista = useMemo(() => {
    let r = ordenes ?? []
    if (filtroEstado === 'todos') {
      r = r.filter((o) => o.status !== 'Entregado')
    } else if (filtroEstado === 'Derivado') {
      r = r.filter((o) => o.status !== 'Entregado' && derivadoIds.has(o.id))
    } else {
      r = r.filter((o) => o.status === filtroEstado)
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(
        (o) =>
          o.nombre?.toLowerCase().includes(q) ||
          String(o.num).includes(q) ||
          o.modelo?.toLowerCase().includes(q) ||
          o.tel?.includes(q) ||
          o.rut?.toLowerCase().includes(q),
      )
    }
    return r
  }, [ordenes, filtroEstado, busqueda, derivadoIds])

  // Stats
  const stats = useMemo(() => {
    const all = ordenes ?? []
    return {
      abiertas:  all.filter((o) => o.status !== 'Entregado').length,
      listos:    all.filter((o) => o.status === 'Listo').length,
      entregadas: all.filter((o) => o.status === 'Entregado').length,
      derivadas:  derivadoIds.size,
    }
  }, [ordenes, derivadoIds])

  function abrirNueva() {
    setEditando(null)
    setModalOpen(true)
  }

  function abrirEditar(o: Orden) {
    setEditando(o)
    setModalOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="w-8 h-8" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">
        Error al cargar órdenes: {String(error)}
      </div>
    )
  }

  return (
    <div>
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="mr-auto">
          <h2 className="text-xl font-bold text-gray-900">Taller</h2>
          <p className="text-sm text-gray-400 mt-0.5">{ordenes?.length ?? 0} órdenes en total</p>
        </div>
        {tallerTab === 'ordenes' && (<>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, N°, RUT, equipo..."
              className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 w-64"
            />
          </div>
          <button
            onClick={abrirNueva}
            className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nueva orden
          </button>
        </>)}
      </div>


      {tallerTab === 'derivados' && <TrasladosTab />}
      {tallerTab === 'equipos'   && <EquiposTab />}

      {tallerTab === 'settings' && (
        <div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit flex-wrap">
            {CONFIG_TABS.map(t => (
              <button key={t.id} onClick={() => setConfigTab(t.id)}
                className={[
                  'px-4 py-1.5 text-sm font-medium rounded-lg transition',
                  configTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}>
                {t.label}
              </button>
            ))}
          </div>
          {configTab === 'seguimiento'    && <SeguimientoTab />}
          {configTab === 'checklist'      && <ChecklistConfigTab />}
          {configTab === 'notificaciones' && <MensajesTab />}
          {configTab === 'terminos'       && <TerminosTab />}
          {configTab === 'equipos-config' && <EquiposConfigTab />}
        </div>
      )}

      {tallerTab === 'ordenes' && (<>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatCard
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            iconBg="bg-amber-100 text-amber-700"
            label="Órdenes abiertas"
            value={stats.abiertas}
            onClick={() => setFiltroEstado('todos')}
          />
          <StatCard
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            iconBg="bg-green-100 text-green-700"
            label="Listos para entregar"
            value={stats.listos}
            valueColor="text-green-700"
            onClick={() => setFiltroEstado('Listo')}
          />
          <StatCard
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
            iconBg="bg-orange-100 text-orange-700"
            label="Derivados (activos)"
            value={stats.derivadas}
            valueColor="text-orange-700"
            onClick={() => setFiltroEstado('Derivado')}
          />
          <StatCard
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            iconBg="bg-purple-100 text-purple-700"
            label="Órdenes entregadas"
            value={stats.entregadas}
            valueColor="text-purple-700"
            onClick={() => setFiltroEstado('Entregado')}
          />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-1 mb-4 border-b border-gray-200 pb-3">
          <div className="flex flex-wrap items-center gap-1 flex-1">
            {ESTADOS_MAIN.map((e) => (
              <button
                key={e.value}
                onClick={() => setFiltroEstado(e.value)}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition',
                  filtroEstado === e.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                ].join(' ')}
              >
                {e.label}
                {e.value === 'Derivado' && stats.derivadas > 0 && (
                  <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${filtroEstado === 'Derivado' ? 'bg-white/30 text-white' : 'bg-orange-200 text-orange-800'}`}>
                    {stats.derivadas}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="pl-3 border-l border-gray-200 ml-1">
            <button
              onClick={() => setFiltroEstado('Entregado')}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition',
                filtroEstado === 'Entregado'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              ].join(' ')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
              Entregados
            </button>
          </div>
        </div>

        {/* Banner archivo si está en "Entregado" */}
        {filtroEstado === 'Entregado' && (
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 text-sm text-gray-500">
            <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            <span>Historial — estas órdenes ya fueron entregadas.</span>
            <button onClick={() => setFiltroEstado('todos')} className="ml-auto text-blue-600 text-xs font-medium hover:underline">
              ← Volver al activo
            </button>
          </div>
        )}

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {lista.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              {busqueda || filtroEstado !== 'todos'
                ? 'Sin resultados para ese filtro'
                : 'No hay órdenes todavía'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">N°</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Equipo</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Estado</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Precio</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lista.map((o) => {
                    const isDerived = derivadoIds.has(o.id)
                    const derivedTsl = isDerived
                      ? (traslados ?? []).find((t) => t.order_id === o.id && t.estado !== 'retornado')
                      : null
                    const activa = o.status !== 'Entregado'
                    const age = ordenAge(o)
                    const rowTint = activa ? (age > 14 ? 'bg-red-50/60' : age > 7 ? 'bg-amber-50/60' : '') : ''
                    const ageChip = !activa
                      ? 'bg-gray-100 text-gray-500'
                      : age > 14 ? 'bg-red-100 text-red-700'
                      : age > 7 ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                    return (
                      <tr
                        key={o.id}
                        onClick={() => navigate(`/taller/orden/${o.num}`)}
                        className={`${rowTint} hover:bg-blue-50/40 transition-colors cursor-pointer`}
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-gray-700">#{o.num}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-gray-500">{fmtFecha(o.fecha)}</span>
                          <span className={`ml-2 inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 ${ageChip}`}>
                            {activa ? ageLabel(age) : 'Entregado'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{o.nombre}</p>
                          {o.tel && <p className="text-xs text-gray-400">{o.tel}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{o.modelo || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center flex-wrap gap-1.5">
                            <EstadoBadge estado={o.status} />
                            {isDerived && (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 text-xs font-semibold">
                                🔄 {derivedTsl?.tecnico ?? 'Derivado'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">
                          <Money value={totalOrden(o)} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); abrirEditar(o) }}
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal nueva / editar orden */}
        {modalOpen && (
          <OrdenModal
            orden={editando}
            ordenes={ordenes ?? []}
            onClose={() => setModalOpen(false)}
          />
        )}

      </>)}
    </div>
  )
}

function StatCard({
  icon, iconBg, label, value, valueColor = 'text-gray-900', onClick,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: number
  valueColor?: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 text-left hover:shadow-sm transition w-full"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
        <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
      </div>
    </button>
  )
}
