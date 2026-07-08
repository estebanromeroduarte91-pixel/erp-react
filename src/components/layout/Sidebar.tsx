import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useCargos } from '@/lib/queries'

// ── Tipos ─────────────────────────────────────────────────────
interface SubItem { to: string; label: string; icon: React.ReactNode }
interface NavGroup {
  id: string
  label: string
  icon: React.ReactNode
  sub: SubItem[]
}
interface NavSingle { to: string; label: string; icon: React.ReactNode }
type SectionItem = { type: 'single'; item: NavSingle } | { type: 'group'; item: NavGroup }

// ── Sección "Operación" ────────────────────────────────────────
const OP_ITEMS: SectionItem[] = [
  {
    type: 'single',
    item: {
      to: '/dashboard',
      label: 'Dashboard',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.4"/><rect x="14" y="3" width="7" height="5" rx="1.4"/><rect x="14" y="12" width="7" height="9" rx="1.4"/><rect x="3" y="16" width="7" height="5" rx="1.4"/></svg>,
    },
  },
  {
    type: 'group',
    item: {
      id: 'ventas',
      label: 'Ventas',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.55-1.25L21 7H6"/></svg>,
      sub: [
        { to: '/ventas', label: 'Resumen', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> },
        { to: '/ventas?tab=pos', label: 'POS', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 15h4"/></svg> },
        { to: '/ventas?tab=caja', label: 'Caja', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg> },
        { to: '/ventas?tab=config', label: 'Configuración', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 0 1-4 0v-.09A1.6 1.6 0 0 0 9.18 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 0 1 0-4h.09A1.6 1.6 0 0 0 4.6 9.18a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 0 1 4 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47.97H21a2 2 0 0 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97z"/></svg> },
      ],
    },
  },
  {
    type: 'group',
    item: {
      id: 'taller',
      label: 'Taller',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z"/></svg>,
      sub: [
        { to: '/taller', label: 'Órdenes', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2.5" width="8" height="4" rx="1.2"/><path d="M16 4.5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h2"/></svg> },
        { to: '/taller?tab=derivados', label: 'Derivados', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg> },
        { to: '/taller?tab=equipos', label: 'Equipos', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5"/></svg> },
        { to: '/taller?tab=settings', label: 'Configuración', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 0 1-4 0v-.09A1.6 1.6 0 0 0 9.18 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 0 1 0-4h.09A1.6 1.6 0 0 0 4.6 9.18a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 0 1 4 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47.97H21a2 2 0 0 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97z"/></svg> },
      ],
    },
  },
  {
    type: 'group',
    item: {
      id: 'contactos',
      label: 'Contactos',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      sub: [
        { to: '/contactos', label: 'Clientes', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
        { to: '/contactos?tab=proveedores', label: 'Proveedores', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
      ],
    },
  },
  {
    type: 'group',
    item: {
      id: 'inventario',
      label: 'Inventario',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
      sub: [
        { to: '/inventario', label: 'Productos', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
        { to: '/inventario?tab=categorias', label: 'Categorías', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
        { to: '/inventario?tab=bodegas', label: 'Bodegas / Sucursales', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
        { to: '/inventario?tab=movimientos', label: 'Movimientos', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg> },
      ],
    },
  },
]

// ── Sección "Administración" ───────────────────────────────────
const ADMIN_ITEMS: SectionItem[] = [
  {
    type: 'single',
    item: {
      to: '/estadisticas',
      label: 'Estadísticas',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
    },
  },
  {
    type: 'single',
    item: {
      to: '/config?tab=accesos',
      label: 'Accesos',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
    },
  },
  {
    type: 'single',
    item: {
      to: '/config?tab=cargos',
      label: 'Cargos',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M17 11l2 2 4-4"/></svg>,
    },
  },
  {
    type: 'group',
    item: {
      id: 'contabilidad',
      label: 'Contabilidad',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2.5H20v19H6.5A2.5 2.5 0 0 1 4 19v-14a2.5 2.5 0 0 1 2.5-2.5z"/></svg>,
      sub: [
        { to: '/compras', label: 'Compras / OC', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
        { to: '/compras?section=kits', label: 'Kits / Equipos', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg> },
        { to: '/contabilidad', label: 'Gastos', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 15h4"/></svg> },
        { to: '/contabilidad?tab=libro', label: 'Libro contable', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2.5H20v19H6.5A2.5 2.5 0 0 1 4 19v-14a2.5 2.5 0 0 1 2.5-2.5z"/></svg> },
      ],
    },
  },
  {
    type: 'single',
    item: {
      to: '/config',
      label: 'Configuración',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 0 1-4 0v-.09A1.6 1.6 0 0 0 9.18 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 0 1 0-4h.09A1.6 1.6 0 0 0 4.6 9.18a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 0 1 4 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47.97H21a2 2 0 0 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97z"/></svg>,
    },
  },
]

// Devuelve el índice del subitem que mejor coincide con la ruta actual, o -1.
// "Mejor" = mismo pathname y todos sus query params coinciden; gana el más
// específico (más params), de modo que solo un hermano queda activo aunque
// compartan pathname (ej. /compras vs /compras?section=kits).
function subActivoIndex(subs: { to: string }[], pathname: string, search: string): number {
  const current = new URLSearchParams(search)
  let best = -1
  let bestScore = -1
  subs.forEach((s, i) => {
    const [path, qs] = s.to.split('?')
    if (pathname !== path) return
    const linkParams = new URLSearchParams(qs || '')
    for (const [k, v] of linkParams) {
      if (current.get(k) !== v) return // un param del link no coincide → descartado
    }
    const score = [...linkParams].length
    if (score > bestScore) { bestScore = score; best = i }
  })
  return best
}

// ── Componente grupo expandible ────────────────────────────────
function NavGroupItem({ item, open, onToggle }: { item: NavGroup; open: boolean; onToggle: () => void }) {
  const location = useLocation()
  const activeIdx = subActivoIndex(item.sub, location.pathname, location.search)
  const isParentActive = activeIdx !== -1

  return (
    <>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', cursor: 'pointer', width: '100%', border: 'none', background: 'none',
          color: isParentActive ? 'var(--primary-dark)' : 'var(--gray-600)',
          backgroundColor: isParentActive ? 'var(--primary-light)' : 'transparent',
          borderRadius: 8, margin: '1px 6px',
          fontSize: 13.5, fontWeight: 600, transition: 'all .15s', textAlign: 'left',
        }}
        onMouseEnter={e => { if (!isParentActive) { (e.currentTarget as HTMLElement).style.background = 'var(--gray-50)'; (e.currentTarget as HTMLElement).style.color = 'var(--gray-800)' } }}
        onMouseLeave={e => { if (!isParentActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--gray-600)' } }}
      >
        <span style={{ color: isParentActive ? 'var(--primary)' : 'var(--gray-400)', width: 20, display: 'flex', flexShrink: 0 }}>
          {item.icon}
        </span>
        <span style={{ flex: 1 }}>{item.label}</span>
        <span style={{
          fontSize: 10, color: 'var(--gray-400)',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform .2s', marginLeft: 'auto',
        }}>▶</span>
      </button>

      <div style={{ overflow: 'hidden', maxHeight: open ? 500 : 0, transition: 'max-height .25s ease' }}>
        {item.sub.map((s, idx) => {
          const active = idx === activeIdx
          return (
            <Link
              key={s.to}
              to={s.to}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 12px 7px 44px', cursor: 'pointer',
                color: active ? 'var(--primary-dark)' : 'var(--gray-500)',
                backgroundColor: active ? 'var(--primary-light)' : 'transparent',
                borderRadius: 8, margin: '1px 6px',
                fontSize: 13, fontWeight: active ? 600 : 500,
                transition: 'all .15s', textDecoration: 'none',
              }}
            >
              <span style={{ color: 'var(--gray-400)', display: 'flex' }}>{s.icon}</span>
              {s.label}
            </Link>
          )
        })}
      </div>
    </>
  )
}

// ── Item simple (no grupo). active se calcula afuera para que solo uno
//    quede resaltado cuando varios comparten pathname (ej. /config…) ──
function SingleLink({ item, active }: { item: NavSingle; active: boolean }) {
  return (
    <Link to={item.to}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', cursor: 'pointer',
        color: active ? 'var(--primary-dark)' : 'var(--gray-600)',
        backgroundColor: active ? 'var(--primary-light)' : 'transparent',
        borderRadius: 8, margin: '1px 6px',
        fontSize: 13.5, fontWeight: active ? 700 : 600,
        transition: 'all .15s', textDecoration: 'none',
      }}
    >
      <span style={{ color: 'var(--gray-400)', width: 20, display: 'flex', flexShrink: 0 }}>{item.icon}</span>
      {item.label}
    </Link>
  )
}

// ── Sidebar ────────────────────────────────────────────────────
export function Sidebar() {
  const { nombre, rol, cargoId, empresaNombre } = useAuth()
  const location = useLocation()
  const initials = nombre.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  const rolLabel = rol === 'admin' ? 'Administrador' : rol === 'encargado' ? 'Encargado' : rol === 'tecnico' ? 'Técnico' : rol === 'vendedor' ? 'Vendedor' : rol

  // Cargos desde la única fuente de verdad (con fallback a CARGOS_DEFAULT incluido en useCargos)
  const { data: cargos = [] } = useCargos()

  // Permisos efectivos del usuario actual
  const permisos: Record<string, boolean> = (() => {
    if (rol === 'admin') return {}
    const cargo = cargos.find(c => c.id === cargoId)
    return cargo?.permisos ?? {}
  })()

  // Filtrar items de operación según permisos
  const opItemsFiltrados = rol === 'admin' ? OP_ITEMS : OP_ITEMS.filter(si => {
    if (si.type === 'single') {
      const to = (si.item as NavSingle).to
      if (to === '/dashboard') return !!permisos.dashboard
      return true
    }
    const id = (si.item as NavGroup).id
    if (id === 'ventas')     return !!permisos.ventas
    if (id === 'taller')     return !!permisos.taller
    if (id === 'contactos')  return !!permisos.clientes
    if (id === 'inventario') return !!permisos.inventario
    return true
  })

  // Filtrar items de administración según permisos
  // Regla de seguridad fija: Accesos y Cargos siempre son exclusivos del admin
  const adminItemsFiltrados = rol === 'admin' ? ADMIN_ITEMS : ADMIN_ITEMS.filter(si => {
    if (si.type === 'single') {
      const to = (si.item as NavSingle).to
      if (to.includes('accesos') || to.includes('cargos')) return false
      if (to === '/estadisticas') return !!permisos.estadisticas
      if (to === '/config')       return !!permisos.configuracion
      return false
    }
    if (si.type === 'group') {
      const id = (si.item as NavGroup).id
      if (id === 'contabilidad') return !!permisos.compras
      return false
    }
    return false
  })

  const allGroups = [...OP_ITEMS, ...ADMIN_ITEMS].filter(si => si.type === 'group').map(si => si.item as NavGroup)
  const activeGroupId = allGroups.find(g => g.sub.some(s => location.pathname === s.to.split('?')[0]))?.id ?? null
  const [openGroupId, setOpenGroupId] = useState<string | null>(activeGroupId)

  // El item single activo: mejor coincidencia entre todos los que comparten pathname
  // (ej. /config, /config?tab=accesos y /config?tab=cargos), para no resaltar varios a la vez.
  const allSingles = [...OP_ITEMS, ...ADMIN_ITEMS].filter(si => si.type === 'single').map(si => si.item as NavSingle)
  const activeSingleIdx = subActivoIndex(allSingles, location.pathname, location.search)
  const activeSingleTo = activeSingleIdx >= 0 ? allSingles[activeSingleIdx].to : null

  function toggleGroup(id: string) {
    setOpenGroupId(prev => prev === id ? null : id)
  }

  return (
    <aside style={{
      width: 'var(--sidebar-w)', background: '#fff',
      borderRight: '1px solid var(--gray-100)',
      position: 'fixed', top: 0, left: 0, bottom: 0,
      display: 'flex', flexDirection: 'column', zIndex: 100, overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 14px 14px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--primary)', color: '#fff',
          display: 'grid', placeItems: 'center', flexShrink: 0,
          boxShadow: '0 4px 12px var(--accent-glow)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-800)', letterSpacing: '-.02em' }}>{empresaNombre}</div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2, fontWeight: 500 }}>Sistema ERP</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingBottom: 8 }}>
        {/* Operación */}
        <div style={{ padding: '14px 12px 5px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', color: 'var(--gray-400)', textTransform: 'uppercase' }}>
          Operación
        </div>
        {opItemsFiltrados.map((si, i) =>
          si.type === 'single' ? (
            <SingleLink key={i} item={si.item as NavSingle} active={(si.item as NavSingle).to === activeSingleTo} />
          ) : (
            <NavGroupItem key={i} item={si.item as NavGroup} open={openGroupId === (si.item as NavGroup).id} onToggle={() => toggleGroup((si.item as NavGroup).id)} />
          )
        )}

        {/* Administración — solo si hay items visibles */}
        {adminItemsFiltrados.length > 0 && (
          <div style={{ padding: '14px 12px 5px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', color: 'var(--gray-400)', textTransform: 'uppercase' }}>
            Administración
          </div>
        )}
        {adminItemsFiltrados.map((si, i) =>
          si.type === 'single' ? (
            <SingleLink key={i} item={si.item as NavSingle} active={(si.item as NavSingle).to === activeSingleTo} />
          ) : (
            <NavGroupItem key={i} item={si.item as NavGroup} open={openGroupId === (si.item as NavGroup).id} onToggle={() => toggleGroup((si.item as NavGroup).id)} />
          )
        )}
      </nav>

      {/* User footer */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        borderTop: '1px solid var(--gray-100)', padding: '12px 10px', marginTop: 'auto',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: 'var(--primary)', color: '#fff',
          display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 12.5, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nombre}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 500 }}>{rolLabel}</div>
        </div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </aside>
  )
}
