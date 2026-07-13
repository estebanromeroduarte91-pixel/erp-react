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
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Inventario</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={[
              'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition',
              tab === t.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}>
            <span className="md:hidden">{t.labelMobile ?? t.label}</span>
            <span className="hidden md:inline">{t.label}</span>
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
