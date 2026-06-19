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

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        {(['clientes', 'proveedores'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={[
              'px-4 py-1.5 text-sm font-medium rounded-lg transition capitalize',
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}>
            {t === 'clientes' ? 'Clientes' : 'Proveedores'}
          </button>
        ))}
      </div>

      {tab === 'clientes'    && <ClientesTab />}
      {tab === 'proveedores' && <ProveedoresTab />}
    </div>
  )
}
