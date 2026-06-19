import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOrdenes } from '@/lib/queries'
import { EstadoBadge } from '@/components/shared/Badge'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import { OrdenModal } from './OrdenModal'
import { OrdenDetalle } from './OrdenDetalle'
import type { EstadoOrden, Orden } from '@/types'

type TallerTab = 'ordenes' | 'equipos' | 'settings'

const TALLER_TABS: { id: TallerTab; label: string }[] = [
  { id: 'ordenes',  label: 'Órdenes' },
  { id: 'equipos',  label: 'Equipos' },
  { id: 'settings', label: 'Configuración' },
]

function resolveTallerTab(param: string | null): TallerTab {
  if (param === 'equipos')  return 'equipos'
  if (param === 'settings') return 'settings'
  return 'ordenes'
}

function TabPlaceholder({ icon, titulo, desc }: { icon: string; titulo: string; desc: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-lg font-bold text-gray-600 mb-2">{titulo}</p>
      <p className="text-sm text-gray-400 max-w-xs mx-auto">{desc}</p>
    </div>
  )
}

const ESTADOS: { value: EstadoOrden | 'todos'; label: string }[] = [
  { value: 'todos',         label: 'Todos' },
  { value: 'Chequeo',       label: 'Chequeo' },
  { value: 'Reparación',    label: 'Reparación' },
  { value: 'Listo',         label: 'Listos' },
  { value: 'Entregado',     label: 'Entregados' },
  { value: 'No reparable',  label: 'No reparables' },
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

export function TallerPage() {
  const [searchParams] = useSearchParams()
  const [tallerTab, setTallerTab] = useState<TallerTab>(() => resolveTallerTab(searchParams.get('tab')))

  useEffect(() => {
    setTallerTab(resolveTallerTab(searchParams.get('tab')))
  }, [searchParams])

  const { data: ordenes, isLoading, error } = useOrdenes()
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | 'todos'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Orden | null>(null)
  const [detalle, setDetalle] = useState<Orden | null>(null)

  const lista = useMemo(() => {
    let r = ordenes ?? []
    if (filtroEstado !== 'todos') r = r.filter((o) => o.status === filtroEstado)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(
        (o) =>
          o.nombre?.toLowerCase().includes(q) ||
          String(o.num).includes(q) ||
          o.modelo?.toLowerCase().includes(q) ||
          o.tel?.includes(q),
      )
    }
    return r
  }, [ordenes, filtroEstado, busqueda])

  function abrirNueva() {
    setEditando(null)
    setModalOpen(true)
  }

  function abrirEditar(o: Orden) {
    setDetalle(null)
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Taller</h2>
          <p className="text-sm text-gray-400 mt-0.5">{ordenes?.length ?? 0} órdenes en total</p>
        </div>
        {tallerTab === 'ordenes' && (
          <button
            onClick={abrirNueva}
            className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nueva orden
          </button>
        )}
      </div>

      {/* Tabs de sección */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        {TALLER_TABS.map(t => (
          <button key={t.id} onClick={() => setTallerTab(t.id)}
            className={[
              'px-4 py-1.5 text-sm font-medium rounded-lg transition',
              tallerTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {tallerTab === 'equipos' && (
        <TabPlaceholder icon="📱" titulo="Base de equipos" desc="Administra la base de datos de modelos de equipos y accesorios soportados." />
      )}
      {tallerTab === 'settings' && (
        <TabPlaceholder icon="⚙️" titulo="Configuración de taller" desc="Los ajustes del taller (checklist de ingreso, mensajes y seguimiento) se encuentran en Configuración → pestaña correspondiente." />
      )}

      {tallerTab === 'ordenes' && (<>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, N°, equipo..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {ESTADOS.map((e) => (
            <button
              key={e.value}
              onClick={() => setFiltroEstado(e.value)}
              className={[
                'px-3 py-1.5 text-xs font-medium rounded-lg transition',
                filtroEstado === e.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

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
                {lista.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setDetalle(o)}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">#{o.num}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtFecha(o.fecha)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{o.nombre}</p>
                      {o.tel && <p className="text-xs text-gray-400">{o.tel}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{o.modelo || '—'}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={o.status} />
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
                ))}
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

      {/* Drawer de detalle */}
      {detalle && (
        <OrdenDetalle
          orden={detalle}
          ordenes={ordenes ?? []}
          onClose={() => setDetalle(null)}
          onEditar={(o) => abrirEditar(o)}
        />
      )}
      </>)}
    </div>
  )
}
