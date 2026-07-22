import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVentas, useOrdenes, useBuscarProductos, useClientes } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

type ResultType = 'ot' | 'venta' | 'cliente' | 'producto'
interface Result { type: ResultType; id: string; title: string; sub: string; badge?: string; badgeColor?: string }

const ACCESO_ICONS: Record<string, React.ReactNode> = {
  '/contactos': <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  '/ventas': <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 15h4"/></svg>,
  '/inventario': <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
  '/taller': <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z"/></svg>,
}

const ACCESOS = [
  { to: '/contactos', label: 'Clientes', sub: 'Buscar por nombre o RUT' },
  { to: '/ventas', label: 'Boletas', sub: 'Buscar por número o cliente' },
  { to: '/inventario', label: 'Inventario', sub: 'Productos y stock' },
  { to: '/taller', label: 'Órdenes', sub: 'OTs activas y entregadas' },
]

const STATUS_COLOR: Record<string, string> = {
  Chequeo: '#f59e0b', Reparación: '#8b5cf6', Listo: '#10b981',
  Entregado: '#6b7280', 'No reparable': '#ef4444',
}

function ResultIcon({ type }: { type: ResultType }) {
  const icons: Record<ResultType, React.ReactNode> = {
    ot: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z"/></svg>,
    venta: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 15h4"/></svg>,
    cliente: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    producto: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  }
  return <span style={{ display: 'flex', color: '#6b7280' }}>{icons[type]}</span>
}

function TypeLabel({ type }: { type: ResultType }) {
  const labels = { ot: 'OT', venta: 'Boleta', cliente: 'Cliente', producto: 'Producto' }
  const colors: Record<ResultType, string> = {
    ot: '#8b5cf6', venta: '#10b981', cliente: '#007AFF', producto: '#f59e0b',
  }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: colors[type], background: colors[type] + '18', padding: '2px 7px', borderRadius: 99 }}>
      {labels[type]}
    </span>
  )
}

export function BuscarPage() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const { data: ventas, isLoading: loadV } = useVentas()
  const { data: ordenes, isLoading: loadO } = useOrdenes()
  const { data: clientes, isLoading: loadC } = useClientes()
  const { data: productosBuscados } = useBuscarProductos(query)   // búsqueda server-side

  const isLoading = loadV || loadO || loadC

  const results: Result[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const out: Result[] = []

    // OTs
    ;(ordenes ?? []).filter(o =>
      o.nombre?.toLowerCase().includes(q) ||
      o.num?.toLowerCase().includes(q) ||
      o.modelo?.toLowerCase().includes(q) ||
      o.tel?.toLowerCase().includes(q)
    ).slice(0, 5).forEach(o => {
      out.push({
        type: 'ot', id: o.num ?? o.id,
        title: `#${o.num} — ${o.nombre}`,
        sub: o.modelo ?? o.trabajo ?? '',
        badge: o.status,
        badgeColor: STATUS_COLOR[o.status] ?? '#6b7280',
      })
    })

    // Ventas
    ;(ventas ?? []).filter(v =>
      v.numero?.toLowerCase().includes(q) ||
      v.cliente?.toLowerCase().includes(q)
    ).slice(0, 5).forEach(v => {
      out.push({
        type: 'venta', id: v.id,
        title: v.numero,
        sub: v.cliente + ' · $' + Math.round(+v.total_iva).toLocaleString('es-CL'),
      })
    })

    // Clientes
    ;(clientes ?? []).filter(c =>
      c.nombre?.toLowerCase().includes(q) ||
      c.apellido?.toLowerCase().includes(q) ||
      c.rut?.toLowerCase().includes(q) ||
      c.tel?.toLowerCase().includes(q)
    ).slice(0, 5).forEach(c => {
      out.push({
        type: 'cliente', id: c.id,
        title: [c.nombre, c.apellido].filter(Boolean).join(' '),
        sub: [c.tel, c.rut].filter(Boolean).join(' · ') || 'Sin datos',
      })
    })

    // Productos (búsqueda del lado del servidor)
    ;(productosBuscados ?? []).slice(0, 5).forEach(p => {
      const stockTotal = Object.values(p.stock_sucursales ?? {}).reduce((a, b) => a + b, 0)
      out.push({
        type: 'producto', id: p.id,
        title: p.nombre,
        sub: `Stock: ${stockTotal} · ${p.sku ?? 'Sin SKU'}`,
      })
    })

    return out
  }, [query, ventas, ordenes, productosBuscados, clientes])

  function handleResult(r: Result) {
    const abrir = encodeURIComponent(r.id)
    if (r.type === 'ot') navigate(`/taller?abrir=${abrir}`)
    else if (r.type === 'venta') navigate(`/ventas?abrir=${abrir}`)
    else if (r.type === 'cliente') navigate(`/contactos?abrir=${abrir}`)
    else if (r.type === 'producto') navigate(`/inventario?abrir=${abrir}`)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f2f2f7' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '16px 16px 12px', borderBottom: '0.5px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1c1c1e', margin: '0 0 10px' }}>Buscar</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 12, padding: '9px 14px', border: '1px solid #e5e7eb' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Clientes, boletas, OTs, productos…"
            style={{ flex: 1, border: 'none', background: 'none', fontSize: 16, color: '#1c1c1e', outline: 'none', fontFamily: 'inherit' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ border: 'none', background: '#8e8e93', color: '#fff', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <Spinner className="w-6 h-6" />
          </div>
        )}

        {/* Results */}
        {!isLoading && query.length >= 2 && (
          <>
            {results.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 48, color: '#8e8e93' }}>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#3c3c43', margin: 0 }}>Sin resultados</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>Intenta con otro nombre o número</p>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                {results.map((r, i) => (
                  <button
                    key={r.id + i}
                    onClick={() => handleResult(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: i < results.length - 1 ? '0.5px solid #f2f2f7' : 'none',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f2f2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ResultIcon type={r.type} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                        {r.badge && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: r.badgeColor, background: (r.badgeColor ?? '#888') + '18', padding: '2px 6px', borderRadius: 99, flexShrink: 0 }}>
                            {r.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#8e8e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</div>
                    </div>
                    <TypeLabel type={r.type} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Accesos rápidos */}
        {query.length < 2 && !isLoading && (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Accesos rápidos</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {ACCESOS.map(a => (
                <button
                  key={a.to}
                  onClick={() => navigate(a.to)}
                  style={{
                    background: '#fff', borderRadius: 14, padding: '16px 14px',
                    display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer',
                    border: 'none', textAlign: 'left', fontFamily: 'inherit',
                    boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                  }}
                >
                  <span style={{ display: 'flex', color: 'var(--primary)' }}>{ACCESO_ICONS[a.to]}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1e' }}>{a.label}</span>
                  <span style={{ fontSize: 11, color: '#8e8e93' }}>{a.sub}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
