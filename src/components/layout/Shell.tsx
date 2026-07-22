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
        {/* Franja opaca fija sobre la barra de estado (translúcida en iOS) —
            sin esto, el contenido que hace scroll queda visible "a medias"
            pasando por detrás del reloj/batería en vez de quedar tapado. */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
          height: 'env(safe-area-inset-top)', background: '#f2f2f7',
        }} />
        <PullToRefresh>
          <main style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(72px + max(env(safe-area-inset-bottom), 50px))' }}>
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
