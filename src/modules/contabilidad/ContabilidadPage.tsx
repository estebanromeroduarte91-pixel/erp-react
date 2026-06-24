import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GastosTab } from './GastosTab'
import { LibroDiarioTab } from './LibroDiarioTab'
import { EstadoResultadosTab } from './EstadoResultadosTab'
import { CategoriasContablesTab } from './CategoriasContablesTab'

type Tab = 'gastos' | 'diario' | 'er' | 'categorias'

// sidebar usa ?tab=libro para el Libro Diario
function resolveTab(param: string | null): Tab {
  if (param === 'libro' || param === 'diario') return 'diario'
  if (param === 'er') return 'er'
  if (param === 'categorias') return 'categorias'
  return 'gastos'
}

export function ContabilidadPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => resolveTab(searchParams.get('tab')))

  useEffect(() => {
    setTab(resolveTab(searchParams.get('tab')))
  }, [searchParams])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'gastos', label: 'Gastos' },
    { key: 'diario', label: 'Libro Diario' },
    { key: 'er',     label: 'Estado de Resultados' },
    { key: 'categorias', label: 'Categorías' },
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
      {tab === 'categorias' && <CategoriasContablesTab />}
    </div>
  )
}
