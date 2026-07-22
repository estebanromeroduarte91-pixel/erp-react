import { useSearchParams } from 'react-router-dom'
import { ProductosTab } from './ProductosTab'
import { BodegasTab } from './BodegasTab'
import { MovimientosTab } from './MovimientosTab'
import { CategoriasTab } from './CategoriasTab'
import { ConteosTab } from './ConteosTab'
type Tab = 'productos' | 'categorias' | 'bodegas' | 'movimientos' | 'conteos'

const TABS: { id: Tab; label: string; labelMobile?: string }[] = [
  { id: 'productos',   label: 'Productos' },
  { id: 'categorias',  label: 'Categorías', labelMobile: 'Categ.' },
  { id: 'bodegas',     label: 'Bodegas / Sucursales', labelMobile: 'Bodegas' },
  { id: 'movimientos', label: 'Movimientos', labelMobile: 'Movim.' },
  { id: 'conteos',     label: 'Toma de inventario', labelMobile: 'Conteo' },
]

function resolveTab(param: string | null): Tab {
  if (param === 'categorias') return 'categorias'
  if (param === 'bodegas')    return 'bodegas'
  if (param === 'movimientos') return 'movimientos'
  if (param === 'conteos')    return 'conteos'
  return 'productos'
}

export function InventarioPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // El tab se deriva DIRECTO de la URL (fuente única de verdad) para que la píldora
  // resaltada y el contenido nunca queden desincronizados, incluso con atrás/adelante
  // del navegador o navegación desde el menú lateral.
  const tab = resolveTab(searchParams.get('tab'))
  const setTab = (id: Tab) => setSearchParams(id === 'productos' ? {} : { tab: id }, { replace: true })

  return (
    <div className="px-4 md:px-0">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Inventario</h2>
      </div>

      {/* Móvil: segmentado de ancho igual — los 4 tabs caben sin cortarse ni scroll */}
      <div className="md:hidden flex gap-0 p-0.5 rounded-full mb-5" style={{ background: '#f2f2f7' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            id={`tour-inventario-tab-${t.id}`}
            className="flex-1 min-w-0 text-center py-2 px-0 rounded-full text-[12px] font-medium transition whitespace-nowrap"
            style={{ background: tab === t.id ? '#3656e6' : 'transparent', color: tab === t.id ? '#fff' : '#6b7280' }}>
            {t.labelMobile ?? t.label}
          </button>
        ))}
      </div>

      {/* Desktop: pills */}
      <div className="hidden md:flex gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            id={`tour-inventario-tab-${t.id}`}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition"
            style={{ background: tab === t.id ? '#3656e6' : '#f2f2f7', color: tab === t.id ? '#fff' : '#6b7280' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'productos'   && <ProductosTab />}
      {tab === 'categorias'  && <CategoriasTab />}
      {tab === 'bodegas'     && <BodegasTab />}
      {tab === 'movimientos' && <MovimientosTab />}
      {tab === 'conteos'     && <ConteosTab />}
    </div>
  )
}
