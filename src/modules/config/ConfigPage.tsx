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

      <div className="grid grid-cols-2 md:flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-full md:w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={[
              'px-2 md:px-4 py-1.5 text-sm font-medium rounded-lg transition text-center',
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
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
