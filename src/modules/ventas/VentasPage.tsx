import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { POSTab } from './POSTab'
import { VentasListTab } from './VentasListTab'
import { CajaTab } from './CajaTab'
import { VentasConfigTab } from './VentasConfigTab'

type Tab = 'pos' | 'lista' | 'caja' | 'config'

function resolveTab(param: string | null): Tab {
  if (param === 'pos') return 'pos'
  if (param === 'caja') return 'caja'
  if (param === 'config') return 'config'
  return 'lista'
}

export function VentasPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => resolveTab(searchParams.get('tab')))

  useEffect(() => {
    setTab(resolveTab(searchParams.get('tab')))
  }, [searchParams])

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {tab === 'lista'  && <VentasListTab />}
      {tab === 'pos'    && <POSTab />}
      {tab === 'caja'   && <CajaTab />}
      {tab === 'config' && <VentasConfigTab />}
    </div>
  )
}
