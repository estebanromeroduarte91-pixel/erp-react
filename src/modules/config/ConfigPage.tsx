import { useState } from 'react'
import { SeguimientoTab } from './SeguimientoTab'
import { ChecklistConfigTab } from './ChecklistConfigTab'
import { MensajesTab } from './MensajesTab'
import { TerminosTab } from './TerminosTab'
import { SmtpTab } from './SmtpTab'
import { DominioTab } from './DominioTab'
import { CargosTab } from './CargosTab'
import { AccesosTab } from './AccesosTab'

type Tab = 'seguimiento' | 'checklist' | 'mensajes' | 'terminos' | 'smtp' | 'dominio' | 'cargos' | 'accesos'

export function ConfigPage() {
  const [tab, setTab] = useState<Tab>('seguimiento')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'seguimiento', label: 'Seguimiento' },
    { key: 'checklist',   label: 'Checklist' },
    { key: 'mensajes',    label: 'Mensajes' },
    { key: 'terminos',    label: 'Términos' },
    { key: 'dominio',     label: 'Dominio' },
    { key: 'smtp',        label: 'SMTP' },
    { key: 'cargos',      label: 'Cargos' },
    { key: 'accesos',     label: 'Accesos' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Configuración</h2>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit flex-wrap">
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

      {tab === 'seguimiento' && <SeguimientoTab />}
      {tab === 'checklist'   && <ChecklistConfigTab />}
      {tab === 'mensajes'    && <MensajesTab />}
      {tab === 'terminos'    && <TerminosTab />}
      {tab === 'dominio'     && <DominioTab />}
      {tab === 'smtp'        && <SmtpTab />}
      {tab === 'cargos'      && <CargosTab />}
      {tab === 'accesos'     && <AccesosTab />}
    </div>
  )
}
