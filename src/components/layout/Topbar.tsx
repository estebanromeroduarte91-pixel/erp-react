import { useAuth } from '@/context/AuthContext'

export function Topbar() {
  const { logout } = useAuth()

  return (
    <header style={{
      position: 'fixed', top: 0, left: 'var(--sidebar-w)', right: 0, zIndex: 50,
      height: 58, background: '#fff',
      borderBottom: '1px solid var(--gray-100)',
      padding: '0 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={logout}
          title="Cerrar sesión"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: 'transparent', cursor: 'pointer',
            color: 'var(--gray-400)', transition: 'all .15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--gray-50)'; (e.currentTarget as HTMLElement).style.color = 'var(--gray-600)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--gray-400)' }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>
    </header>
  )
}
