import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClientesTab } from './ClientesTab'
import { ProveedoresTab } from './ProveedoresTab'

type Tab = 'clientes' | 'proveedores'

export function ContactosPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => searchParams.get('tab') === 'proveedores' ? 'proveedores' : 'clientes')

  useEffect(() => {
    setTab(searchParams.get('tab') === 'proveedores' ? 'proveedores' : 'clientes')
  }, [searchParams])

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Contactos</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
        {(['clientes', 'proveedores'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition"
            style={{ background: tab === t ? '#3656e6' : '#f2f2f7', color: tab === t ? '#fff' : '#6b7280' }}>
            {t === 'clientes' ? 'Clientes' : 'Proveedores'}
          </button>
        ))}
      </div>

      {tab === 'clientes'    && <ClientesTab />}
      {tab === 'proveedores' && <ProveedoresTab />}
    </div>
  )
}
