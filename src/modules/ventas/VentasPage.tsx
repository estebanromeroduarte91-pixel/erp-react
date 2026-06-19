import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { POSTab } from './POSTab'
import { VentasListTab } from './VentasListTab'
import { CajaTab } from './CajaTab'

type Tab = 'pos' | 'lista' | 'caja'

function resolveTab(param: string | null): Tab {
  if (param === 'pos') return 'pos'
  if (param === 'caja') return 'caja'
  // /ventas sin param → "Resumen" = lista de ventas
  return 'lista'
}

export function VentasPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => resolveTab(searchParams.get('tab')))

  useEffect(() => {
    setTab(resolveTab(searchParams.get('tab')))
  }, [searchParams])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'lista', label: 'Ventas' },
    { key: 'pos',   label: 'Punto de venta' },
    { key: 'caja',  label: 'Caja' },
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Ventas</h2>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={[
              'px-4 py-1.5 text-sm font-medium rounded-lg transition',
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lista' && <VentasListTab />}
      {tab === 'pos'   && <POSTab />}
      {tab === 'caja'  && <CajaTab />}
    </div>
  )
}
