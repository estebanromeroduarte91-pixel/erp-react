import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const TABS = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1.4"/><rect x="14" y="3" width="7" height="5" rx="1.4"/>
        <rect x="14" y="12" width="7" height="9" rx="1.4"/><rect x="3" y="16" width="7" height="5" rx="1.4"/>
      </svg>
    ),
  },
  {
    to: '/estadisticas',
    label: 'Estadísticas',
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

const MAS_ICONS: Record<string, React.ReactNode> = {
  '/ventas': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.55-1.25L21 7H6"/></svg>,
  '/inventario': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
  '/contactos': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  '/compras': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  '/contabilidad': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 15h4"/></svg>,
  '/config': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 0 1-4 0v-.09A1.6 1.6 0 0 0 9.18 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 0 1 0-4h.09A1.6 1.6 0 0 0 4.6 9.18a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 0 1 4 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47.97H21a2 2 0 0 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97z"/></svg>,
}

const MAS_ITEMS = [
  { to: '/ventas', label: 'Ventas' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/contactos', label: 'Clientes' },
  { to: '/compras', label: 'Compras / OC' },
  { to: '/contabilidad', label: 'Gastos' },
  { to: '/config', label: 'Configuración' },
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
        position: 'fixed', left: 0, right: 0, bottom: drawerOpen ? 'calc(56px + max(env(safe-area-inset-bottom), 50px))' : -400, zIndex: 201,
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
            <span style={{ width: 28, display: 'flex', justifyContent: 'center' }}>{MAS_ICONS[item.to]}</span>
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
            <span style={{ width: 28, display: 'flex', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </span>
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.97)',
        borderTop: '0.5px solid var(--gray-200)',
        display: 'flex', alignItems: 'flex-start',
        paddingTop: 8,
        paddingBottom: 'max(env(safe-area-inset-bottom), 50px)',
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
