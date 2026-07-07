import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOrdenes, useTraslados, useGuardarOrden } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { useIsMobile } from '@/lib/useIsMobile'
import { EstadoBadge } from '@/components/shared/Badge'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import { OrdenModal } from './OrdenModal'
import { OrdenDetallePage } from './OrdenDetallePage'
import { TrasladosTab } from './TrasladosTab'
import { EquiposTab } from './EquiposTab'
import { SeguimientoTab } from '@/modules/config/SeguimientoTab'
import { ChecklistConfigTab } from '@/modules/config/ChecklistConfigTab'
import { MensajesTab } from '@/modules/config/MensajesTab'
import { TerminosTab } from '@/modules/config/TerminosTab'
import { EquiposConfigTab } from './EquiposConfigTab'
import { totalOrden } from './utils'
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
  { value: 'Derivado',   label: 'Derivados' },
]


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
  const [tallerTab, setTallerTab] = useState<TallerTab>(() => resolveTallerTab(searchParams.get('tab')))

  useEffect(() => {
    setTallerTab(resolveTallerTab(searchParams.get('tab')))
  }, [searchParams])

  const { data: ordenes, isLoading, error } = useOrdenes()
  const { data: traslados } = useTraslados()
  const guardarOrden = useGuardarOrden()
  const { esAdmin } = useAuth()
  const [configTab, setConfigTab] = useState<TallerConfigTab>('seguimiento')
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | 'todos' | 'Derivado'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Orden | null>(null)
  const [detalleNum, setDetalleNum] = useState<string | null>(null)
  const [ordenAEliminar, setOrdenAEliminar] = useState<Orden | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [ordenAReabrir, setOrdenAReabrir] = useState<Orden | null>(null)
  const [reabriendo, setReabriendo] = useState(false)

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

  const isMobile = useIsMobile()

  function abrirNueva() {
    setEditando(null)
    setModalOpen(true)
  }

  function abrirEditar(o: Orden) {
    setEditando(o)
    setModalOpen(true)
  }

  async function confirmarEliminar() {
    if (!ordenAEliminar || !esAdmin) return
    setEliminando(true)
    await guardarOrden.mutateAsync((ordenes ?? []).filter((o) => o.id !== ordenAEliminar.id))
    setEliminando(false)
    setOrdenAEliminar(null)
  }

  async function confirmarReabrir() {
    if (!ordenAReabrir) return
    setReabriendo(true)
    try {
      await guardarOrden.mutateAsync(
        (ordenes ?? []).map((o) => o.id === ordenAReabrir.id ? { ...o, status: 'Listo' as EstadoOrden } : o)
      )
      setOrdenAReabrir(null)
    } finally {
      setReabriendo(false)
    }
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

  const STATUS_DOT: Record<string, string> = {
    Chequeo: '#f59e0b', Reparación: '#8b5cf6', Listo: '#10b981',
    Entregado: '#6b7280', 'No reparable': '#ef4444',
  }

  if (isMobile) {
    return (
      <div style={{ background: '#f2f2f7', minHeight: '100dvh' }}>
        {/* Header */}
        <div style={{ background: '#fff', padding: '16px 16px 10px', borderBottom: '0.5px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1c1c1e', margin: 0 }}>Órdenes</h1>
            <button
              onClick={abrirNueva}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >+ Nueva</button>
          </div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
            {ESTADOS_MAIN.map(e => (
              <button
                key={e.value}
                onClick={() => setFiltroEstado(e.value)}
                style={{
                  flexShrink: 0, padding: '5px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 600,
                  background: filtroEstado === e.value ? 'var(--primary)' : '#f2f2f7',
                  color: filtroEstado === e.value ? '#fff' : '#6b7280',
                }}
              >{e.label}</button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente, modelo..."
              style={{ border: 'none', background: 'none', fontSize: 14, color: '#1c1c1e', outline: 'none', flex: 1, fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {/* Lista */}
        <div style={{ padding: '8px 16px 16px' }}>
          {lista.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 48, color: '#8e8e93' }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z"/>
                </svg>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#3c3c43', margin: 0 }}>Sin órdenes</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>No hay órdenes con este filtro</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
              {lista.map((o, i) => (
                <button
                  key={o.id}
                  onClick={() => setDetalleNum(o.num)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: i < lista.length - 1 ? '0.5px solid #f2f2f7' : 'none',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[o.status] ?? '#8e8e93', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8e93', marginBottom: 1 }}>#{o.num}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[o.nombre, o.apellido].filter(Boolean).join(' ')}</div>
                    <div style={{ fontSize: 12, color: '#8e8e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.modelo ?? o.trabajo ?? ''}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_DOT[o.status] ?? '#8e8e93', background: (STATUS_DOT[o.status] ?? '#888') + '18', padding: '3px 8px', borderRadius: 99, display: 'block', marginBottom: 4 }}>{o.status}</span>
                    <span style={{ fontSize: 11, color: '#8e8e93' }}>{fmtFecha(o.fecha)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modales reutilizados del desktop */}
        {modalOpen && (
          <OrdenModal
            orden={editando}
            ordenes={ordenes ?? []}
            onClose={() => setModalOpen(false)}
          />
        )}
        {detalleNum && (
          <OrdenDetallePage
            num={detalleNum}
            onClose={() => setDetalleNum(null)}
          />
        )}
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
                        onClick={() => setDetalleNum(o.num)}
                        className={`${rowTint} hover:bg-blue-50/40 transition-colors cursor-pointer`}
                      >
                        <td className="px-4 py-3 font-semibold text-gray-700">#{o.num}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-gray-500">{fmtFecha(o.fecha)}</span>
                          <span className={`ml-2 inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 ${ageChip}`}>
                            {activa ? ageLabel(age) : 'Entregado'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{[o.nombre, o.apellido].filter(Boolean).join(' ')}</p>
                          {o.tel && <p className="text-xs text-gray-400">{o.tel}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{o.modelo || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center flex-wrap gap-1.5">
                            <EstadoBadge estado={o.status} />
                            {isDerived && (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 text-xs font-semibold">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3" />
                                </svg>
                                {derivedTsl?.tecnico ?? 'Derivado'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">
                          <Money value={totalOrden(o)} />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {o.status === 'Entregado' && (o.numero_boleta || o.venta_id) && (
                            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 text-[10px] font-semibold mr-2">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              {o.numero_boleta || 'Con venta'}
                            </span>
                          )}
                          {o.status === 'Entregado' && !o.numero_boleta && !o.venta_id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setOrdenAReabrir(o) }}
                              className="mr-2 text-xs text-amber-600 hover:underline font-medium"
                            >
                              Reabrir
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); abrirEditar(o) }}
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            Editar
                          </button>
                          {esAdmin && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setOrdenAEliminar(o) }}
                              title="Eliminar orden"
                              className="ml-3 text-gray-300 hover:text-red-500 transition-colors align-middle"
                            >
                              <svg className="w-4 h-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
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

        {/* Modal detalle orden */}
        {detalleNum && (
          <OrdenDetallePage num={detalleNum} onClose={() => setDetalleNum(null)} />
        )}

        {/* Confirmación eliminar orden */}
        {ordenAEliminar && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !eliminando) setOrdenAEliminar(null) }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
              <div className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">¿Eliminar orden #{ordenAEliminar.num}?</h3>
                  <p className="text-xs text-gray-500 mt-1">Esta acción no se puede deshacer.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setOrdenAEliminar(null)} disabled={eliminando}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition disabled:opacity-60">
                  Cancelar
                </button>
                <button onClick={confirmarEliminar} disabled={eliminando}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition disabled:opacity-60">
                  {eliminando ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {ordenAReabrir && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !reabriendo) setOrdenAReabrir(null) }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
              <div className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">Reabrir orden #{ordenAReabrir.num}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[ordenAReabrir.nombre, ordenAReabrir.apellido].filter(Boolean).join(' ')} · {ordenAReabrir.modelo || '—'}
                  </p>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 leading-relaxed">
                    Volverá al estado <strong>Listo para entregar</strong> y aparecerá en la lista activa.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setOrdenAReabrir(null)} disabled={reabriendo}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition disabled:opacity-60">
                  Cancelar
                </button>
                <button onClick={confirmarReabrir} disabled={reabriendo}
                  className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition disabled:opacity-60">
                  {reabriendo ? 'Reabriendo…' : 'Reabrir orden'}
                </button>
              </div>
            </div>
          </div>
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
