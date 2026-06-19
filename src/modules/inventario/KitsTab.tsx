import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKits, useGuardarKits } from '@/lib/queries'
import type { Kit, KitComponente } from '@/types'

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const today = () => new Date().toISOString().slice(0, 10)

// ── Modal crear / editar kit ──────────────────────────────────

interface ModalKitProps {
  kit?: Kit
  categoriasExistentes: string[]
  onSave: (k: Kit) => void
  onClose: () => void
}

function ModalKit({ kit, categoriasExistentes, onSave, onClose }: ModalKitProps) {
  const [nombre, setNombre] = useState(kit?.nombre ?? '')
  const [categoria, setCategoria] = useState(kit?.categoria ?? '')
  const [componentes, setComponentes] = useState<KitComponente[]>(
    kit?.componentes?.length ? kit.componentes : [{ id: uid(), nombre: '', cantidad: 1 }]
  )
  const lastRowRef = useRef<HTMLInputElement>(null)

  function addComp() {
    setComponentes(prev => [...prev, { id: uid(), nombre: '', cantidad: 1 }])
    setTimeout(() => lastRowRef.current?.focus(), 30)
  }

  function removeComp(id: string) {
    setComponentes(prev => prev.filter(c => c.id !== id))
  }

  function updateComp(id: string, field: 'nombre' | 'cantidad', value: string | number) {
    setComponentes(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  function handleSave() {
    if (!nombre.trim()) { alert('El nombre del kit es obligatorio'); return }
    const comps = componentes.filter(c => c.nombre.trim())
    if (!comps.length) { alert('Agrega al menos un componente'); return }
    onSave({
      id: kit?.id ?? uid(),
      nombre: nombre.trim(),
      categoria: categoria.trim(),
      componentes: comps.map(c => ({ ...c, nombre: c.nombre.trim(), cantidad: Number(c.cantidad) || 1 })),
      fecha_creacion: kit?.fecha_creacion ?? today(),
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{kit ? 'Editar kit' : 'Nuevo Kit de Equipo'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nombre del equipo *</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: iPhone 13, MacBook Pro 14"
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Categoría</label>
              <input
                type="text"
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                placeholder="Ej: iPhone, MacBook, iPad"
                list="kit-cat-list"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
              <datalist id="kit-cat-list">
                {categoriasExistentes.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="text-xs font-semibold text-gray-500 uppercase">Componentes / Repuestos internos</label>
              <span className="text-xs text-gray-400">Se agregarán como líneas en la OC</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', fontSize: 12, color: 'var(--gray-500)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Componente</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: 70 }}>Cant.</th>
                  <th style={{ width: 30 }} />
                </tr>
              </thead>
              <tbody>
                {componentes.map((c, idx) => (
                  <tr key={c.id}>
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        ref={idx === componentes.length - 1 ? lastRowRef : undefined}
                        type="text"
                        value={c.nombre}
                        onChange={e => updateComp(c.id, 'nombre', e.target.value)}
                        placeholder="Ej: Pantalla OLED, Cámara trasera…"
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                        onKeyDown={e => e.key === 'Enter' && addComp()}
                      />
                    </td>
                    <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={c.cantidad}
                        min={1}
                        onChange={e => updateComp(c.id, 'cantidad', e.target.value)}
                        style={{ width: 60, textAlign: 'center' }}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                      />
                    </td>
                    <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                      <button
                        onClick={() => removeComp(c.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={addComp}
              style={{ marginTop: 6, background: 'none', border: '1.5px dashed var(--gray-300)', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', color: 'var(--gray-500)', fontSize: 13, width: '100%' }}
            >
              ＋ Agregar componente
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            {kit ? 'Guardar cambios' : 'Crear kit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── KitsTab ───────────────────────────────────────────────────

type ModalState = { open: false } | { open: true; kit?: Kit }

export function KitsTab() {
  const navigate = useNavigate()
  const { data: kits = [], isLoading } = useKits()
  const guardar = useGuardarKits()
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const categoriasExistentes = [...new Set(kits.map(k => k.categoria).filter(Boolean))] as string[]

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = search.trim()
    ? kits.filter(k =>
        k.nombre.toLowerCase().includes(search.toLowerCase()) ||
        (k.categoria ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : kits

  async function handleSave(kit: Kit) {
    const existe = kits.find(k => k.id === kit.id)
    const updated = existe ? kits.map(k => k.id === kit.id ? kit : k) : [...kits, kit]
    await guardar.mutateAsync(updated)
    setModal({ open: false })
    setToast(existe ? 'Kit actualizado' : `Kit "${kit.nombre}" creado con ${kit.componentes.length} componentes ✓`)
  }

  async function handleDelete(id: string) {
    const kit = kits.find(k => k.id === id)
    if (!kit || !confirm(`¿Eliminar el kit "${kit.nombre}"?`)) return
    await guardar.mutateAsync(kits.filter(k => k.id !== id))
    setToast('Kit eliminado')
  }

  async function handleClonar(id: string) {
    const kit = kits.find(k => k.id === id)
    if (!kit) return
    const nombre = prompt(`Nombre del nuevo kit (clon de "${kit.nombre}"):`, kit.nombre + ' (copia)')
    if (!nombre?.trim()) return
    const clon: Kit = {
      id: uid(),
      nombre: nombre.trim(),
      categoria: kit.categoria,
      componentes: kit.componentes.map(c => ({ ...c, id: uid() })),
      fecha_creacion: today(),
    }
    await guardar.mutateAsync([...kits, clon])
    setToast(`Kit "${clon.nombre}" clonado ✓`)
  }

  function handleCrearOC(id: string) {
    const kit = kits.find(k => k.id === id)
    if (!kit || !kit.componentes.length) { setToast('Este kit no tiene componentes'); return }
    const items = kit.componentes.map(c => ({
      id: uid(),
      producto_id: '',
      producto_nombre: c.nombre,
      cantidad: c.cantidad,
      precio_neto: 0,
      precio_iva: 0,
      precio_unitario: 0,
      subtotal: 0,
      bodega_id: '',
      bodega_nombre: '',
    }))
    navigate('/compras', { state: { kitItems: items, kitNombre: kit.nombre } })
  }

  if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Cargando...</div>

  return (
    <div>
      {/* Info banner */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
        💡 <strong>¿Cómo funciona?</strong> Crea un kit para cada modelo de equipo (ej: iPhone 13) con todos sus repuestos y componentes. Desde aquí puedes crear órdenes de compra directamente.
      </div>

      {/* Card principal */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            Kits de Equipos{' '}
            <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>({kits.length})</span>
          </h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar modelo…"
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400"
                style={{ width: 200 }}
              />
            </div>
            <button
              onClick={() => setModal({ open: true })}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition whitespace-nowrap"
            >
              ＋ Nuevo Kit
            </button>
          </div>
        </div>

        {/* Table / empty */}
        {filtered.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
            <h3 style={{ margin: '0 0 6px', color: 'var(--gray-600)' }}>
              {search ? 'Sin resultados' : 'Sin kits'}
            </h3>
            <p style={{ color: 'var(--gray-400)', margin: '0 0 14px', fontSize: 13 }}>
              {search ? `No se encontró nada para "${search}"` : 'Crea tu primer kit de equipo para comenzar'}
            </p>
            {!search && (
              <button
                onClick={() => setModal({ open: true })}
                className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                ＋ Nuevo Kit
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  {['Modelo / Equipo', 'Categoría', 'N° Componentes', 'Componentes', 'Acciones'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textAlign: i === 2 ? 'center' : 'left', borderBottom: '1px solid var(--gray-200)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--gray-100)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <strong style={{ fontSize: 14 }}>{k.nombre}</strong>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {k.categoria ? (
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                          {k.categoria}
                        </span>
                      ) : <span style={{ color: 'var(--gray-400)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, fontSize: 16, color: 'var(--primary)' }}>
                      {k.componentes.length}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--gray-500)', maxWidth: 280 }}>
                      {k.componentes.slice(0, 4).map(c => c.nombre).join(', ')}
                      {k.componentes.length > 4 && <em style={{ color: 'var(--gray-400)' }}> +{k.componentes.length - 4} más</em>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleCrearOC(k.id)}
                          style={{ padding: '5px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                          title="Crear orden de compra con estos componentes"
                        >
                          🛒 Crear OC
                        </button>
                        <button
                          onClick={() => setModal({ open: true, kit: k })}
                          style={{ padding: '5px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => handleClonar(k.id)}
                          style={{ padding: '5px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          title="Clonar kit"
                        >
                          📋 Clonar
                        </button>
                        <button
                          onClick={() => handleDelete(k.id)}
                          style={{ padding: '5px 9px', border: '1.5px solid #fee2e2', borderRadius: 7, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                          title="Eliminar"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <ModalKit
          kit={modal.kit}
          categoriasExistentes={categoriasExistentes}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--gray-800)', color: '#fff', borderRadius: 10, padding: '10px 20px',
          fontSize: 13, fontWeight: 600, zIndex: 9999, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,.3)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
