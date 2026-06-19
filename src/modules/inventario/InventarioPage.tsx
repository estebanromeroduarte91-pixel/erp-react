import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductosTab } from './ProductosTab'
import { BodegasTab } from './BodegasTab'
import { MovimientosTab } from './MovimientosTab'
import { CategoriasTab } from './CategoriasTab'
import { KitsTab } from './KitsTab'

type Tab = 'productos' | 'categorias' | 'kits' | 'bodegas' | 'movimientos'

const TABS: { id: Tab; label: string }[] = [
  { id: 'productos',   label: 'Productos' },
  { id: 'categorias',  label: 'Categorías' },
  { id: 'kits',        label: 'Kits / Equipos' },
  { id: 'bodegas',     label: 'Bodegas / Sucursales' },
  { id: 'movimientos', label: 'Movimientos' },
]

function resolveTab(param: string | null): Tab {
  if (param === 'categorias') return 'categorias'
  if (param === 'kits')       return 'kits'
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

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={[
              'px-4 py-1.5 text-sm font-medium rounded-lg transition',
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'productos'   && <ProductosTab />}
      {tab === 'categorias'  && <CategoriasTab />}
      {tab === 'kits'        && <KitsTab />}
      {tab === 'bodegas'     && <BodegasTab />}
      {tab === 'movimientos' && <MovimientosTab />}
    </div>
  )
}
