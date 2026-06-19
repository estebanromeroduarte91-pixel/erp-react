import { useState } from 'react'
import { POSTab } from './POSTab'
import { VentasListTab } from './VentasListTab'
import { CajaTab } from './CajaTab'

type Tab = 'pos' | 'lista' | 'caja'

export function VentasPage() {
  const [tab, setTab] = useState<Tab>('pos')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pos',   label: 'Punto de venta' },
    { key: 'lista', label: 'Ventas' },
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

      {tab === 'pos'   && <POSTab />}
      {tab === 'lista' && <VentasListTab />}
      {tab === 'caja'  && <CajaTab />}
    </div>
  )
}
