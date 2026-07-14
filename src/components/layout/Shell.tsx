import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileTabBar } from './MobileTabBar'
import { PullToRefresh } from './PullToRefresh'
import { useIsMobile } from '@/lib/useIsMobile'

export function Shell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div style={{ minHeight: '100dvh', background: '#f2f2f7' }}>
        <PullToRefresh>
          <main style={{ paddingBottom: 'calc(72px + max(env(safe-area-inset-bottom), 50px))' }}>
            {children}
          </main>
        </PullToRefresh>
        <MobileTabBar />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      <Sidebar />
      <Topbar />
      <main style={{ marginLeft: 'var(--sidebar-w)', paddingTop: 58, minHeight: '100vh' }}>
        <div style={{ padding: 24 }}>{children}</div>
      </main>
    </div>
  )
}
