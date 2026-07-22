import { useSearchParams } from 'react-router-dom'
import { GastosTab } from './GastosTab'
import { LibroDiarioTab } from './LibroDiarioTab'
import { EstadoResultadosTab } from './EstadoResultadosTab'
import { CategoriasContablesTab } from './CategoriasContablesTab'
import { PlanCuentasTab } from './PlanCuentasTab'

type Tab = 'gastos' | 'diario' | 'er' | 'categorias' | 'plan'

// sidebar usa ?tab=libro para el Libro Diario
function resolveTab(param: string | null): Tab {
  if (param === 'libro' || param === 'diario') return 'diario'
  if (param === 'er') return 'er'
  if (param === 'categorias') return 'categorias'
  return 'gastos'
}

export function ContabilidadPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = resolveTab(searchParams.get('tab'))
  const setTab = (key: Tab) => setSearchParams(key === 'gastos' ? {} : { tab: key }, { replace: true })

  const tabs: { key: Tab; label: string }[] = [
    { key: 'gastos', label: 'Gastos' },
    { key: 'diario', label: 'Libro Diario' },
    { key: 'er',     label: 'Estado de Resultados' },
    { key: 'categorias', label: 'Categorías' },
    { key: 'plan',       label: 'Plan de cuentas' },
  ]

  return (
    <div className="px-4 md:px-0">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Contabilidad</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            id={`tour-contabilidad-tab-${t.key}`}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition"
            style={{ background: tab === t.key ? '#3656e6' : '#f2f2f7', color: tab === t.key ? '#fff' : '#6b7280' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gastos' && <GastosTab />}
      {tab === 'diario' && <LibroDiarioTab />}
      {tab === 'er'     && <EstadoResultadosTab />}
      {tab === 'categorias' && <CategoriasContablesTab />}
      {tab === 'plan'       && <PlanCuentasTab />}
    </div>
  )
}
