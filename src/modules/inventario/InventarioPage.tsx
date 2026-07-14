import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductosTab } from './ProductosTab'
import { BodegasTab } from './BodegasTab'
import { MovimientosTab } from './MovimientosTab'
import { CategoriasTab } from './CategoriasTab'
type Tab = 'productos' | 'categorias' | 'bodegas' | 'movimientos'

const TABS: { id: Tab; label: string; labelMobile?: string }[] = [
  { id: 'productos',   label: 'Productos' },
  { id: 'categorias',  label: 'Categorías' },
  { id: 'bodegas',     label: 'Bodegas / Sucursales', labelMobile: 'Bodegas' },
  { id: 'movimientos', label: 'Movimientos' },
]

function resolveTab(param: string | null): Tab {
  if (param === 'categorias') return 'categorias'
  if (param === 'bodegas')    return 'bodegas'
  if (param === 'movimientos') return 'movimientos'
  return 'productos'
}

export function InventarioPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => resolveTab(searchParams.get('tab')))

  useEffect(() => {
    setTab(resolveTab(searchParams.get('tab')))
  }, [searchParams])

  return (
    <div className="px-4 md:px-0">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Inventario</h2>
      </div>

      {/* Móvil: segmentado de ancho igual — los 4 tabs caben sin cortarse ni scroll */}
      <div className="md:hidden flex gap-0.5 p-1 rounded-xl mb-5" style={{ background: '#f2f2f7' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 min-w-0 text-center py-2 px-0.5 rounded-lg text-[12px] font-medium transition whitespace-nowrap"
            style={{ background: tab === t.id ? '#3656e6' : 'transparent', color: tab === t.id ? '#fff' : '#6b7280' }}>
            {t.labelMobile ?? t.label}
          </button>
        ))}
      </div>

      {/* Desktop: pills */}
      <div className="hidden md:flex gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
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
    </div>
  )
}
