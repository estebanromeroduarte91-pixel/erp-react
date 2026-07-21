import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { CambiarPasswordModal } from '@/components/shared/CambiarPasswordModal'

export function Topbar() {
  const { logout, impersonatedEmpresaId, impersonatedEmpresaNombre, stopImpersonation } = useAuth()
  const [pwOpen, setPwOpen] = useState(false)

  return (
    <header style={{
      position: 'fixed', top: 0, left: 'var(--sidebar-w)', right: 0, zIndex: 50,
      height: 58, background: '#fff',
      borderBottom: '1px solid var(--gray-100)',
      padding: '0 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {impersonatedEmpresaId && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, 
            background: 'var(--amber-50, #fffbeb)', border: '1px solid var(--amber-200, #fde68a)', 
            padding: '4px 12px', borderRadius: 8, marginRight: 16
          }}>
            <span style={{width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'}}></span>
            <span style={{fontSize: 13, fontWeight: 500, color: '#92400e'}}>
              Viendo: <strong style={{fontWeight: 700}}>{impersonatedEmpresaNombre}</strong>
            </span>
            <button
              onClick={stopImpersonation}
              style={{
                marginLeft: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                color: '#b45309', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#78350f'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#b45309'}
            >
              Salir <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <button
          onClick={() => setPwOpen(true)}
          title="Cambiar contraseña"
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </button>
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
      <CambiarPasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </header>
  )
}
