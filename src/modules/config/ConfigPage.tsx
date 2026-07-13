import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { SmtpTab } from './SmtpTab'
import { DominioTab } from './DominioTab'
import { CargosTab } from './CargosTab'
import { AccesosTab } from './AccesosTab'

type Tab = 'dominio' | 'smtp' | 'cargos' | 'accesos'

export function ConfigPage() {
  const { esAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    return (t as Tab) ?? 'dominio'
  })

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setTab(t as Tab)
  }, [searchParams])

  const allTabs: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: 'dominio', label: 'Dominio' },
    { key: 'smtp',    label: 'SMTP' },
    { key: 'cargos',  label: 'Cargos',  adminOnly: true },
    { key: 'accesos', label: 'Accesos', adminOnly: true },
  ]
  const tabs = allTabs.filter(t => !t.adminOnly || esAdmin)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Configuración</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-6" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={[
              'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition',
              tab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dominio'             && <DominioTab />}
      {tab === 'smtp'                && <SmtpTab />}
      {tab === 'cargos'  && esAdmin  && <CargosTab />}
      {tab === 'accesos' && esAdmin  && <AccesosTab />}
    </div>
  )
}
