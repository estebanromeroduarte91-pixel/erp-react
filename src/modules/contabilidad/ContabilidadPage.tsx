import { useState } from 'react'
import { GastosTab } from './GastosTab'
import { LibroDiarioTab } from './LibroDiarioTab'
import { EstadoResultadosTab } from './EstadoResultadosTab'

type Tab = 'gastos' | 'diario' | 'er'

export function ContabilidadPage() {
  const [tab, setTab] = useState<Tab>('gastos')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'gastos', label: 'Gastos' },
    { key: 'diario', label: 'Libro Diario' },
    { key: 'er',     label: 'Estado de Resultados' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Contabilidad</h2>
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

      {tab === 'gastos' && <GastosTab />}
      {tab === 'diario' && <LibroDiarioTab />}
      {tab === 'er'     && <EstadoResultadosTab />}
    </div>
  )
}
