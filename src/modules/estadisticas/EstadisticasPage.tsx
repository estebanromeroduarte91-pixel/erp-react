import { useSearchParams } from 'react-router-dom'
import { ResumenTab } from './ResumenTab'
import { ReportesTab } from './ReportesTab'
import { MetaVentasTab } from './MetaVentasTab'
import { CierresTab } from './CierresTab'
import { usePuedeCerrarMes } from '@/lib/queries/useCierre'

type Tab = 'resumen' | 'metas' | 'reportes' | 'cierres'

function resolveTab(param: string | null): Tab {
  return param === 'reportes' || param === 'metas' || param === 'cierres' ? param : 'resumen'
}

export function EstadisticasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: puedeCerrar = false } = usePuedeCerrarMes()
  const pedida = resolveTab(searchParams.get('tab'))
  // Cierres es solo del dueño de la empresa (y de Pixit): el resto vuelve al resumen.
  const tab = pedida === 'cierres' && !puedeCerrar ? 'resumen' : pedida

  // Cáscara delgada con pestañas, mismo patrón que VentasPage. El permiso que
  // deja entrar acá (`permisos.estadisticas`) cubre las dos pestañas: admin
  // siempre, encargado por su cargo, técnico y vendedor no.
  const TABS: { id: Tab; label: string }[] = [
    { id: 'resumen', label: 'Resumen ejecutivo' },
    { id: 'metas', label: 'Metas' },
    { id: 'reportes', label: 'Reportes BI' },
    ...(puedeCerrar ? [{ id: 'cierres' as Tab, label: 'Cierres' }] : []),
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
      {tab === 'metas' && <MetaVentasTab />}
      {tab === 'reportes' && <ReportesTab />}
      {tab === 'cierres' && <CierresTab />}
    </div>
  )
}
