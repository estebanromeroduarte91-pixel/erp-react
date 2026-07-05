import { useState, useMemo, useEffect } from 'react'
import { useClientes, useGuardarClientes, useOrdenes, useVentas } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { useIsMobile } from '@/lib/useIsMobile'
import { Spinner } from '@/components/shared/Spinner'
import { formatRut } from '@/lib/rut'
import type { Cliente } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function initials(nombre: string) {
  return nombre.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

const AVATAR_PALETTES = [
  { bg: '#dbeafe', color: '#1d4ed8' },
  { bg: '#fef3c7', color: '#92400e' },
  { bg: '#f3e8ff', color: '#6b21a8' },
  { bg: '#fce7f3', color: '#9d174d' },
  { bg: '#d1fae5', color: '#065f46' },
  { bg: '#fee2e2', color: '#991b1b' },
  { bg: '#e0f2fe', color: '#075985' },
  { bg: '#fef9c3', color: '#713f12' },
]

function avatarPalette(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length]
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  Chequeo:       { bg: '#fef3c7', color: '#92400e' },
  Reparación:    { bg: '#ede9fe', color: '#5b21b6' },
  Listo:         { bg: '#d1fae5', color: '#065f46' },
  Entregado:     { bg: '#f1f5f9', color: '#475569' },
  'No reparable':{ bg: '#fee2e2', color: '#991b1b' },
}

export function ClientesTab() {
  const { data: clientes, isLoading } = useClientes()
  const { data: ordenes } = useOrdenes()
  const { data: ventas } = useVentas()
  const guardar = useGuardarClientes()
  const { esAdmin } = useAuth()
  const isMobile = useIsMobile()

  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)

  const lista = useMemo(() => {
    if (!busqueda.trim()) return clientes ?? []
    const q = busqueda.toLowerCase()
    return (clientes ?? []).filter(c =>
      `${c.nombre} ${c.apellido ?? ''}`.toLowerCase().includes(q) ||
      (c.rut ?? '').includes(q) || (c.email ?? '').toLowerCase().includes(q) ||
      (c.tel ?? '').includes(q)
    )
  }, [clientes, busqueda])

  useEffect(() => {
    if (!seleccionado && lista.length > 0 && !isMobile) setSeleccionado(lista[0])
  }, [lista, isMobile])

  const stats = useMemo(() => {
    if (!seleccionado) return null
    const nombreNorm = seleccionado.nombre.toLowerCase()
    const ots = (ordenes ?? []).filter(o =>
      (seleccionado.rut && o.rut && o.rut.replace(/\D/g,'') === seleccionado.rut.replace(/\D/g,'')) ||
      o.nombre?.toLowerCase().includes(nombreNorm)
    )
    const bols = (ventas ?? []).filter(v =>
      v.cliente?.toLowerCase().includes(nombreNorm)
    )
    const totalVentas = bols.reduce((s, v) => s + (+v.total_iva || 0), 0)
    return { ots, boletas: bols, totalVentas }
  }, [seleccionado, ordenes, ventas])

  function abrirNuevo() { setEditando(null); setModalOpen(true) }
  function abrirEditar(c: Cliente) { setEditando(c); setModalOpen(true) }

  async function eliminar(c: Cliente) {
    if (!esAdmin) return
    if (!confirm(`¿Eliminar a "${c.nombre} ${c.apellido ?? ''}"?`)) return
    await guardar.mutateAsync((clientes ?? []).filter(x => x.id !== c.id))
    if (seleccionado?.id === c.id) setSeleccionado(null)
  }

  async function guardarCliente(datos: Record<string, string>) {
    const lista2 = clientes ?? []
    if (datos.id) {
      await guardar.mutateAsync(lista2.map(x => x.id === datos.id ? { ...x, ...datos } as Cliente : x))
    } else {
      const nuevo = { id: uid(), fecha_creacion: new Date().toISOString(), ...datos } as unknown as Cliente
      await guardar.mutateAsync([...lista2, nuevo])
      setSeleccionado(nuevo)
    }
  }

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}><Spinner className="w-8 h-8" /></div>

  // ── Mobile: si hay cliente seleccionado → vista detalle ───────
  if (isMobile && seleccionado) {
    return (
      <div style={{ background: '#f2f2f7', minHeight: '100%' }}>
        <div style={{ background: '#fff', padding: '12px 16px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSeleccionado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontSize: 14, fontWeight: 500, padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Clientes
          </button>
        </div>
        <DetailPanel cliente={seleccionado} stats={stats} esAdmin={esAdmin} onEditar={() => abrirEditar(seleccionado)} onEliminar={() => eliminar(seleccionado)} />
        {modalOpen && (
          <ContactoModal titulo="cliente" campos={CAMPOS_CLIENTE} datos={editando as unknown as Record<string,string>|null}
            onClose={() => setModalOpen(false)} onGuardar={guardarCliente} />
        )}
      </div>
    )
  }

  // ── Desktop: split panel ───────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', minHeight: 480, background: '#fff', borderRadius: 16, border: '0.5px solid #e5e7eb', overflow: 'hidden' }}>

      {/* Lista izquierda */}
      <div style={{ width: isMobile ? '100%' : 300, flexShrink: 0, borderRight: '0.5px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        <div style={{ padding: '12px 12px 8px', borderBottom: '0.5px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, border: '0.5px solid #e5e7eb', borderRadius: 8, background: '#fff', outline: 'none', fontFamily: 'inherit', color: '#111' }} />
            </div>
            <button onClick={abrirNuevo} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{lista.length} clientes</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {lista.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '40px 16px', fontSize: 13, color: '#9ca3af' }}>
              {busqueda ? 'Sin resultados' : 'No hay clientes'}
            </p>
          ) : lista.map(c => {
            const p = avatarPalette(c.id)
            const nombre = `${c.nombre} ${c.apellido ?? ''}`.trim()
            const activo = seleccionado?.id === c.id
            return (
              <button key={c.id} onClick={() => setSeleccionado(c)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', borderBottom: '0.5px solid #f0f0f0', cursor: 'pointer', background: activo ? '#eff6ff' : 'transparent', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.bg, color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                  {initials(nombre)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: activo ? 'var(--primary)' : '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre}</p>
                  <p style={{ margin: 0, fontSize: 11, color: activo ? '#60a5fa' : '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[c.rut, c.tel].filter(Boolean).join(' · ') || c.email || 'Sin datos'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Panel detalle */}
      {seleccionado ? (
        <DetailPanel cliente={seleccionado} stats={stats} esAdmin={esAdmin} onEditar={() => abrirEditar(seleccionado)} onEliminar={() => eliminar(seleccionado)} />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#9ca3af' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <p style={{ fontSize: 13, margin: 0 }}>Selecciona un cliente</p>
        </div>
      )}

      {modalOpen && (
        <ContactoModal titulo="cliente" campos={CAMPOS_CLIENTE}
          datos={editando as unknown as Record<string,string>|null}
          onClose={() => setModalOpen(false)}
          onGuardar={guardarCliente} />
      )}
    </div>
  )
}

// ── Panel de detalle ───────────────────────────────────────────

type StatsType = {
  ots: NonNullable<ReturnType<typeof useOrdenes>['data']>
  boletas: NonNullable<ReturnType<typeof useVentas>['data']>
  totalVentas: number
} | null

function DetailPanel({ cliente, stats, esAdmin, onEditar, onEliminar }: {
  cliente: Cliente
  stats: StatsType
  esAdmin: boolean
  onEditar: () => void
  onEliminar: () => void
}) {
  const [vista, setVista] = useState<null | 'boletas' | 'ots'>(null)

  const p = avatarPalette(cliente.id)
  const nombre = `${cliente.nombre} ${cliente.apellido ?? ''}`.trim()
  const tel = cliente.tel?.replace(/\D/g, '')
  const fechaCreacion = cliente.fecha_creacion
    ? new Date(cliente.fecha_creacion).toLocaleDateString('es-CL', { year: 'numeric', month: 'long' })
    : null
  const otsActivas = stats?.ots.filter(o => o.status !== 'Entregado' && o.status !== 'No reparable') ?? []
  const ultimas3Ots = (stats?.ots ?? []).slice(0, 3)

  // Resetear vista al cambiar de cliente
  useEffect(() => { setVista(null) }, [cliente.id])

  const headerActions = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {tel && (
        <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '0.5px solid #d1fae5', background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </a>
      )}
      <button onClick={onEditar} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
      </button>
      {esAdmin && (
        <button onClick={onEliminar} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '0.5px solid #fee2e2', background: '#fff1f2', color: '#ef4444', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Eliminar
        </button>
      )}
    </div>
  )

  // ── Vista lista de boletas ─────────────────────────────────────
  if (vista === 'boletas') {
    const boletas = stats?.boletas ?? []
    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '16px 24px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setVista(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontSize: 13, fontWeight: 500, padding: 0, fontFamily: 'inherit' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              {nombre}
            </button>
            <span style={{ color: '#d1d5db' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Boletas ({boletas.length})</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {boletas.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: '#9ca3af' }}>Sin boletas registradas</p>
          ) : boletas.map((v, i) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderBottom: '0.5px solid #f5f5f5' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#111' }}>{v.numero}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
                  {v.fecha ? new Date(v.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  {v.metodo_pago ? ` · ${v.metodo_pago}` : ''}
                </p>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                ${Math.round(+v.total_iva).toLocaleString('es-CL')}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Vista lista de OTs ─────────────────────────────────────────
  if (vista === 'ots') {
    const ots = stats?.ots ?? []
    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '16px 24px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setVista(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontSize: 13, fontWeight: 500, padding: 0, fontFamily: 'inherit' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              {nombre}
            </button>
            <span style={{ color: '#d1d5db' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Órdenes de trabajo ({ots.length})</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {ots.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: '#9ca3af' }}>Sin órdenes registradas</p>
          ) : ots.map((o) => {
            const s = STATUS_BADGE[o.status] ?? { bg: '#f1f5f9', color: '#475569' }
            return (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderBottom: '0.5px solid #f5f5f5' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#111' }}>
                    #{o.num} — {o.modelo || 'Sin modelo'}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
                    {o.trabajo || 'Sin descripción'}
                    {o.fecha ? ` · ${new Date(o.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color }}>{o.status}</span>
                  {o.presup != null && +o.presup > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>${Math.round(+o.presup).toLocaleString('es-CL')}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Vista principal ────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#fff' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: p.bg, color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0 }}>
            {initials(nombre)}
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 600, color: '#111' }}>{nombre}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>{fechaCreacion ? `Cliente desde ${fechaCreacion}` : 'Cliente'}</p>
          </div>
        </div>
        {headerActions}
      </div>

      <div style={{ padding: '20px 24px', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 24px', marginBottom: 24 }}>
          {[
            { label: 'RUT', val: cliente.rut },
            { label: 'Teléfono', val: cliente.tel },
            { label: 'Email', val: cliente.email },
          ].map(f => (
            <div key={f.label}>
              <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px' }}>{f.label}</p>
              <p style={{ margin: 0, fontSize: 13, color: f.val ? '#111' : '#d1d5db' }}>{f.val || '—'}</p>
            </div>
          ))}
        </div>

        {/* Stats — boletas y OTs son clickeables */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
          <div style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600, color: '#111' }}>${Math.round(stats?.totalVentas ?? 0).toLocaleString('es-CL')}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>Total comprado</p>
          </div>
          <button onClick={() => setVista('boletas')}
            style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
            onMouseLeave={e => (e.currentTarget.style.background = '#f9fafb')}>
            <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600, color: '#111' }}>{stats?.boletas.length ?? 0}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--primary)', fontWeight: 500 }}>Boletas →</p>
          </button>
          <button onClick={() => setVista('ots')}
            style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
            onMouseLeave={e => (e.currentTarget.style.background = '#f9fafb')}>
            <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600, color: '#111' }}>{stats?.ots.length ?? 0}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--primary)', fontWeight: 500 }}>OTs →</p>
          </button>
        </div>

        {ultimas3Ots.length > 0 && (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', paddingTop: 16, borderTop: '0.5px solid #f0f0f0' }}>Últimas órdenes de trabajo</p>
            <div>
              {ultimas3Ots.map((o, i) => {
                const s = STATUS_BADGE[o.status] ?? { bg: '#f1f5f9', color: '#475569' }
                return (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < ultimas3Ots.length - 1 ? '0.5px solid #f5f5f5' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 500, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        #{o.num} — {o.modelo || o.trabajo || 'Sin descripción'}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
                        {o.trabajo || ''}{o.fecha ? ` · ${new Date(o.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color, flexShrink: 0 }}>{o.status}</span>
                  </div>
                )
              })}
            </div>
            {(stats?.ots.length ?? 0) > 3 && (
              <button onClick={() => setVista('ots')} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 500, padding: 0, fontFamily: 'inherit' }}>
                Ver todas las órdenes ({stats!.ots.length}) →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Campos y tipos ─────────────────────────────────────────────

const CAMPOS_CLIENTE = [
  { key: 'nombre',   label: 'Nombre *',      placeholder: 'Juan',             required: true },
  { key: 'apellido', label: 'Apellido',       placeholder: 'Pérez' },
  { key: 'rut',      label: 'RUT',            placeholder: '12.345.678-9' },
  { key: 'tel',      label: 'Teléfono',       placeholder: '+56 9 XXXX XXXX' },
  { key: 'email',    label: 'Email',          placeholder: 'correo@ejemplo.com', type: 'email' },
]

interface Campo { key: string; label: string; placeholder?: string; type?: string; required?: boolean }

function ContactoModal({ titulo, campos, datos, onClose, onGuardar }: {
  titulo: string
  campos: Campo[]
  datos: Record<string, string> | null
  onClose: () => void
  onGuardar: (d: Record<string, string>) => Promise<void>
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    campos.forEach(c => { init[c.key] = (datos as Record<string, string> | null)?.[c.key] ?? '' })
    if (datos && 'id' in datos) init.id = (datos as Record<string, string>).id
    return init
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function handleGuardar() {
    const req = campos.find(c => c.required && !form[c.key]?.trim())
    if (req) { setError(`${req.label.replace(' *', '')} es obligatorio`); return }
    setError(''); setGuardando(true)
    await onGuardar(form)
    setGuardando(false); onClose()
  }

  const isEditing = !!datos

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900 capitalize">
            {isEditing ? `Editar ${titulo}` : `Nuevo ${titulo}`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-3">
          {campos.map(c => (
            <div key={c.key} className={campos.length % 2 !== 0 && campos.indexOf(c) === campos.length - 1 ? 'col-span-2' : ''}>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{c.label}</label>
              <input type={c.type ?? 'text'} value={form[c.key]}
                onChange={e => setForm(f => ({ ...f, [c.key]: c.key === 'rut' ? formatRut(e.target.value) : e.target.value }))}
                placeholder={c.placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
          ))}
          {error && <p className="col-span-2 text-sm text-red-600 font-medium">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : `Crear ${titulo}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export { ContactoModal }
