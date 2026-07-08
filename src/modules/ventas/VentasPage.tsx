import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { POSTab } from './POSTab'
import { VentasListTab } from './VentasListTab'
import { CajaTab } from './CajaTab'

type Tab = 'pos' | 'lista' | 'caja'

function resolveTab(param: string | null): Tab {
  if (param === 'pos') return 'pos'
  if (param === 'caja') return 'caja'
  // /ventas sin param → "Resumen" = lista de ventas
  return 'lista'
}

export function VentasPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => resolveTab(searchParams.get('tab')))

  useEffect(() => {
    setTab(resolveTab(searchParams.get('tab')))
  }, [searchParams])

  return (
    <div className="h-full flex flex-col">
      {tab === 'lista' && <VentasListTab />}
      {tab === 'pos'   && <POSTab />}
      {tab === 'caja'  && <CajaTab />}
    </div>
  )
}
