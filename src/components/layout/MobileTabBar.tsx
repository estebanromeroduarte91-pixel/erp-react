import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const TABS = [
  {
    to: '/dashboard',
    label: 'Inicio',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1.4"/><rect x="14" y="3" width="7" height="5" rx="1.4"/>
        <rect x="14" y="12" width="7" height="9" rx="1.4"/><rect x="3" y="16" width="7" height="5" rx="1.4"/>
      </svg>
    ),
  },
  {
    to: '/estadisticas',
    label: 'Stats',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
      </svg>
    ),
  },
  {
    to: '/taller',
    label: 'OTs',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z"/>
      </svg>
    ),
  },
  {
    to: '/buscar',
    label: 'Buscar',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
]

const MAS_ITEMS = [
  { to: '/ventas', label: 'Ventas', icon: '🛒' },
  { to: '/inventario', label: 'Inventario', icon: '📦' },
  { to: '/contactos', label: 'Clientes', icon: '👥' },
  { to: '/compras', label: 'Compras / OC', icon: '📋' },
  { to: '/contabilidad', label: 'Gastos', icon: '💸' },
  { to: '/config', label: 'Configuración', icon: '⚙️' },
]

export function MobileTabBar() {
  const { pathname } = useLocation()
  const { logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const masActive = MAS_ITEMS.some(i => i.to === pathname)

  return (
    <>
      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200 }}
        />
      )}

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: drawerOpen ? 72 : -400, zIndex: 201,
        background: '#fff', borderRadius: '20px 20px 0 0',
        padding: '8px 0 8px',
        transition: 'bottom 0.3s ease',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      }}>
        <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 99, margin: '4px auto 16px' }} />
        {MAS_ITEMS.map(item => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setDrawerOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '13px 24px',
              textDecoration: 'none',
              color: pathname === item.to ? 'var(--primary)' : 'var(--gray-700)',
              background: pathname === item.to ? 'var(--primary-light)' : 'transparent',
              fontWeight: pathname === item.to ? 700 : 500,
              fontSize: 15,
            }}
          >
            <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <div style={{ borderTop: '1px solid var(--gray-100)', margin: '8px 0 0' }}>
          <button
            onClick={() => { setDrawerOpen(false); logout() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '13px 24px', width: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#ef4444', fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>🚪</span>
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        height: 72, background: 'rgba(255,255,255,0.95)',
        borderTop: '0.5px solid var(--gray-200)',
        display: 'flex', alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {TABS.map(tab => {
          const active = pathname === tab.to
          return (
            <Link
              key={tab.to}
              to={tab.to}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 3, textDecoration: 'none', paddingTop: 8,
                color: active ? 'var(--primary)' : 'var(--gray-400)',
              }}
            >
              {tab.icon}
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{tab.label}</span>
            </Link>
          )
        })}

        {/* Más tab */}
        <button
          onClick={() => setDrawerOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, paddingTop: 8, background: 'none', border: 'none', cursor: 'pointer',
            color: masActive || drawerOpen ? 'var(--primary)' : 'var(--gray-400)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: masActive || drawerOpen ? 700 : 500 }}>Más</span>
        </button>
      </nav>
    </>
  )
}
