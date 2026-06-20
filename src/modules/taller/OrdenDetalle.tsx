import { useGuardarOrden } from '@/lib/queries'
import { EstadoBadge } from '@/components/shared/Badge'
import { Money } from '@/components/shared/Money'
import { totalOrden } from './TallerPage'
import type { Orden, EstadoOrden } from '@/types'

const PIPELINE: EstadoOrden[] = ['Chequeo', 'Reparación', 'Listo', 'Entregado']

interface Props {
  orden: Orden
  ordenes: Orden[]
  onClose: () => void
  onEditar: (o: Orden) => void
}

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
  } catch {
    return iso
  }
}

function initials(nombre: string) {
  return nombre.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

export function OrdenDetalle({ orden: o, ordenes, onClose, onEditar }: Props) {
  const guardar = useGuardarOrden()

  async function cambiarEstado(estado: EstadoOrden) {
    if (o.status === estado) return
    const actualizadas = ordenes.map((x) => (x.id === o.id ? { ...x, status: estado } : x))
    await guardar.mutateAsync(actualizadas)
    // La query se invalidará vía useGuardarOrden → la fila se actualiza sola
    onClose()
  }

  const total = totalOrden(o)
  const pipelineIdx = PIPELINE.indexOf(o.status as EstadoOrden)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
      />

      {/* Drawer desde la derecha */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400">#{o.num}</span>
            <EstadoBadge estado={o.status} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditar(o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Editar
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Nombre + precio */}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{o.nombre}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-400">{fmtFecha(o.fecha)}</span>
              {total > 0 && (
                <span className="text-sm font-semibold text-gray-800">
                  <Money value={total} />
                </span>
              )}
            </div>
          </div>

          {/* Pipeline de estados */}
          <div className="flex items-center gap-1">
            {PIPELINE.map((s, i) => {
              const done = i < pipelineIdx
              const active = i === pipelineIdx
              return (
                <button
                  key={s}
                  onClick={() => cambiarEstado(s)}
                  className={[
                    'flex-1 text-center text-xs font-semibold py-1.5 rounded-lg transition',
                    active ? 'bg-blue-600 text-white' :
                    done   ? 'bg-blue-100 text-blue-700' :
                             'bg-gray-100 text-gray-400 hover:bg-gray-200',
                  ].join(' ')}
                >
                  {s}
                </button>
              )
            })}
          </div>

          {/* Tarjeta cliente */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {initials(o.nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Cliente</p>
              <p className="font-semibold text-gray-900">{o.nombre}</p>
              {o.tel && (
                <a href={`tel:${o.tel}`} className="text-sm text-blue-600 hover:underline block mt-0.5">
                  {o.tel}
                </a>
              )}
              {o.email && <p className="text-sm text-gray-500">{o.email}</p>}
              {o.rut && <p className="text-xs text-gray-400 mt-0.5">RUT: {o.rut}</p>}
            </div>
            {o.tel && (
              <a
                href={`https://wa.me/${(o.tel).replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center hover:bg-green-100 transition"
                title="WhatsApp"
              >
                <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </a>
            )}
          </div>

          {/* Tarjeta equipo */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="18" x2="12.01" y2="18" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Equipo</p>
              <p className="font-semibold text-gray-900">{o.modelo || '—'}</p>
              {o.color && <p className="text-sm text-gray-500">{o.color}</p>}
              {o.serie && <p className="text-xs text-gray-400 mt-0.5">S/N: {o.serie}</p>}
              {o.pin && (
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  {o.pin}
                </p>
              )}
            </div>
          </div>

          {/* Trabajo */}
          {o.trabajo && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Trabajo a realizar</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed">{o.trabajo}</p>
            </div>
          )}

          {/* Estado físico */}
          {o.estadoFisico && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Estado físico</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{o.estadoFisico}</p>
            </div>
          )}

          {/* Repuestos */}
          {o.repuestos && o.repuestos.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Repuestos</p>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                {o.repuestos.map((r, i) => (
                  <div
                    key={r.productId ?? i}
                    className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-gray-50 last:border-0"
                  >
                    <span className="text-gray-700">{r.name}</span>
                    <span className="text-gray-500 ml-4">
                      {r.qty ?? 1} × <Money value={r.precio} />
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-gray-50 font-semibold">
                  <span>Total repuestos</span>
                  <Money
                    value={(o.repuestos ?? []).reduce((s, r) => s + r.precio * (r.qty ?? 1), 0)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Técnico */}
          {o.tecnico && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Técnico: <strong>{o.tecnico}</strong></span>
            </div>
          )}

          {/* Fecha estimada */}
          {o.fechaEstimada && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Entrega estimada: <strong>{fmtFecha(o.fechaEstimada)}</strong></span>
            </div>
          )}

          {/* Fotos de ingreso */}
          {o.photosIngreso && o.photosIngreso.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Fotos de ingreso ({o.photosIngreso.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {o.photosIngreso.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer">
                    <div className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => onEditar(o)}
            className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition"
          >
            Editar orden
          </button>
        </div>
      </div>
    </>
  )
}
