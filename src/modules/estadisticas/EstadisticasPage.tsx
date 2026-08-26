import { useSearchParams } from 'react-router-dom'
import { ResumenTab } from './ResumenTab'
import { ReportesTab } from './ReportesTab'

type Tab = 'resumen' | 'reportes'

function resolveTab(param: string | null): Tab {
  return param === 'reportes' ? 'reportes' : 'resumen'
}

export function EstadisticasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = resolveTab(searchParams.get('tab'))

  // Cáscara delgada con pestañas, mismo patrón que VentasPage. El permiso que
  // deja entrar acá (`permisos.estadisticas`) cubre las dos pestañas: admin
  // siempre, encargado por su cargo, técnico y vendedor no.
  const TABS: { id: Tab; label: string }[] = [
    { id: 'resumen', label: 'Resumen ejecutivo' },
    { id: 'reportes', label: 'Reportes BI' },
  ]

  return (
    <div className="h-full flex flex-col overflow-y-auto px-4 pt-3 pb-6 md:px-0 md:pt-0 md:pb-0">
      <div className="flex items-center gap-2 px-0 pt-1 pb-3">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSearchParams(t.id === 'resumen' ? {} : { tab: t.id })}
            aria-pressed={tab === t.id}
            className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
              tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'resumen' && <ResumenTab />}
      {tab === 'reportes' && <ReportesTab />}
    </div>
  )
}
