import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { usePuedeUsarModulo } from '@/lib/queries'
import { ModuloBloqueado } from '@/components/shared/ModuloBloqueado'
import { GeneralTab } from './GeneralTab'
import { SmtpTab } from './SmtpTab'
import { CargosTab } from './CargosTab'
import { AccesosTab } from './AccesosTab'
import { NotificacionesTab } from './NotificacionesTab'
import { SuscripcionTab } from './SuscripcionTab'
import { TributarioTab } from './TributarioTab'

type Tab = 'general' | 'smtp' | 'tributario' | 'cargos' | 'accesos' | 'notificaciones' | 'suscripcion'

const TABS_VALIDOS: Tab[] = ['general', 'smtp', 'tributario', 'cargos', 'accesos', 'notificaciones', 'suscripcion']
function resolveConfigTab(param: string | null): Tab {
  // La antigua pestaña `dominio` permitía que cada cliente ocupara un dominio
  // de la cuenta Resend de Pixit. El envío administrado ahora usa únicamente
  // pixit.cl; los enlaces guardados a esa pestaña se llevan a Correo.
  if (param === 'dominio') return 'smtp'
  return TABS_VALIDOS.includes(param as Tab) ? (param as Tab) : 'general'
}

export function ConfigPage() {
  const { esAdmin } = useAuth()
  const puedeAccesos = usePuedeUsarModulo('accesos')
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = resolveConfigTab(searchParams.get('tab'))
  const tab = tabParam
  const setTab = (key: Tab) => setSearchParams(key === 'general' ? {} : { tab: key }, { replace: true })

  const allTabs: { key: Tab; label: string; adminOnly?: boolean; requierePlan?: boolean }[] = [
    { key: 'general', label: 'General', adminOnly: true },
    { key: 'smtp',    label: 'Correo', adminOnly: true },
    // Solo admin: el RUT define a nombre de quién se emiten los documentos,
    // y un trigger en la base rechaza el cambio si no lo hace un admin.
    { key: 'tributario', label: 'Tributario', adminOnly: true },
    { key: 'cargos',  label: 'Cargos',  adminOnly: true, requierePlan: true },
    { key: 'accesos', label: 'Accesos', adminOnly: true, requierePlan: true },
    { key: 'notificaciones', label: 'Notificaciones', adminOnly: true },
    // "Mi Plan" siempre visible para el admin — tiene que poder ver su plan
    // aunque sea Starter, no tendría sentido gatearla por el plan mismo.
    { key: 'suscripcion', label: 'Mi Plan', adminOnly: true },
  ]
  const tabs = allTabs.filter(t => (!t.adminOnly || esAdmin) && (!t.requierePlan || puedeAccesos))

  return (
    <div className="px-4 md:px-0">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Configuración</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-6" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            id={`tour-config-tab-${t.key}`}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition"
            style={{ background: tab === t.key ? '#3656e6' : '#f2f2f7', color: tab === t.key ? '#fff' : '#6b7280' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && esAdmin  && <GeneralTab />}
      {tab === 'smtp' && esAdmin     && <SmtpTab />}
      {tab === 'tributario' && esAdmin && <TributarioTab />}
      {tab === 'cargos'  && esAdmin  && (puedeAccesos ? <CargosTab /> : <ModuloBloqueado nombre="Gestión de permisos" />)}
      {tab === 'accesos' && esAdmin  && (puedeAccesos ? <AccesosTab /> : <ModuloBloqueado nombre="Gestión de permisos" />)}
      {tab === 'notificaciones' && esAdmin && <NotificacionesTab />}
      {tab === 'suscripcion' && esAdmin && <SuscripcionTab />}
    </div>
  )
}
