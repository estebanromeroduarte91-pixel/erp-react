import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKits, useGuardarKits, useProductos } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import type { Kit, KitComponente, Producto } from '@/types'

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const today = () => new Date().toISOString().slice(0, 10)

// Color words to detect variants
const COLOR_WORDS = [
  'titanio negro', 'titanio blanco', 'titanio natural', 'titanio desierto', 'titanio azul',
  'verde noche', 'azul pacífico', 'azul pacifico', 'azul sierra', 'verde alpino', 'morado profundo',
  'rose gold', 'space gray', 'space black', 'sky blue',
  'silver', 'gold', 'midnight', 'starlight', 'amarillo', 'azul',
  'rosado', 'plata', 'verde', 'morado', 'blanco', 'negro',
  'blanca', 'negra', 'dorado', 'rojo', 'roja', 'coral',
  'grafito', 'titanio', 'natural', 'desierto', 'black',
]

function stripColor(name: string): string {
  const nl = name.toLowerCase()
  for (const c of COLOR_WORDS) {
    if (nl.endsWith(' ' + c)) return name.slice(0, name.length - c.length - 1).trim()
  }
  return name
}

function getVariantes(prod: Producto, all: Producto[]): Producto[] {
  const base = stripColor(prod.nombre).toLowerCase()
  if (!base) return [prod]
  const variants = all.filter(p => stripColor(p.nombre).toLowerCase() === base)
  return variants.length > 1 ? variants : [prod]
}

// ── Component search row ──────────────────────────────────────

interface CompRowProps {
  comp: KitComponente
  productos: Producto[]
  onChange: (id: string, patch: Partial<KitComponente>) => void
  onRemove: (id: string) => void
  isLast: boolean
  lastRef: React.RefObject<HTMLInputElement | null>
  onEnter: () => void
}

function CompRow({ comp, productos, onChange, onRemove, isLast, lastRef, onEnter }: CompRowProps) {
  const [q, setQ] = useState(comp.nombre)
  const [open, setOpen] = useState(false)
  const results = q.length >= 1
    ? productos.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : []

  // Detect variants when producto_id is set
  const selProd = comp.producto_id ? productos.find(p => p.id === comp.producto_id) : null
  const variantes = selProd ? getVariantes(selProd, productos) : []
  const esVariable = variantes.length > 1

  function selectProd(p: Producto) {
    const vars = getVariantes(p, productos)
    const esVar = vars.length > 1
    onChange(comp.id, {
      nombre: p.nombre,
      producto_id: p.id,
      es_variable: esVar,
      color_defecto: esVar ? p.nombre : undefined,
    })
    setQ(p.nombre)
    setOpen(false)
  }

  function handleColorChange(nombre: string) {
    const prod = productos.find(p => p.nombre === nombre)
    onChange(comp.id, {
      nombre,
      producto_id: prod?.id ?? comp.producto_id,
      color_defecto: nombre,
    })
    setQ(nombre)
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
      {/* Product search cell */}
      <td style={{ padding: '5px 6px', width: '50%' }}>
        <div style={{ position: 'relative' }}>
          <input
            ref={isLast ? lastRef : undefined}
            type="text"
            value={q}
            placeholder="Buscar en inventario…"
            onChange={e => {
              setQ(e.target.value)
              setOpen(true)
              onChange(comp.id, { nombre: e.target.value, producto_id: undefined, es_variable: undefined, color_defecto: undefined })
            }}
            onFocus={() => q.length >= 1 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            onKeyDown={e => e.key === 'Enter' && onEnter()}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
          {open && results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
              background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,.12)', marginTop: 2, maxHeight: 220, overflowY: 'auto'
            }}>
              {results.map(p => (
                <div
                  key={p.id}
                  onMouseDown={() => selectProd(p)}
                  style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{p.nombre}</span>
                  {p.sku && <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 8 }}>#{p.sku}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Variable/Fijo badge + color selector */}
      <td style={{ padding: '5px 6px', width: '30%' }}>
        {comp.producto_id && esVariable ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '2px 7px', whiteSpace: 'nowrap' }}>
              Variable
            </span>
            <select
              value={comp.color_defecto ?? ''}
              onChange={e => handleColorChange(e.target.value)}
              style={{ fontSize: 12, border: '1px solid var(--gray-200)', borderRadius: 7, padding: '3px 6px', flex: 1, minWidth: 0 }}
            >
              {variantes.map(v => (
                <option key={v.id} value={v.nombre}>{stripColor(v.nombre) !== v.nombre ? v.nombre.slice(stripColor(v.nombre).length).trim() : v.nombre}</option>
              ))}
            </select>
          </div>
        ) : comp.producto_id ? (
          <span style={{ fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#166534', borderRadius: 20, padding: '2px 7px' }}>Fijo</span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>Sin enlazar</span>
        )}
      </td>

      {/* Cantidad */}
      <td style={{ padding: '5px 4px', textAlign: 'center', width: 64 }}>
        <input
          type="number"
          value={comp.cantidad}
          min={1}
          onChange={e => onChange(comp.id, { cantidad: Number(e.target.value) || 1 })}
          style={{ width: 54, textAlign: 'center' }}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </td>

      {/* Remove */}
      <td style={{ padding: '5px 4px', textAlign: 'center', width: 30 }}>
        <button
          onClick={() => onRemove(comp.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
        >×</button>
      </td>
    </tr>
  )
}

// ── Modal crear / editar kit ──────────────────────────────────

interface ModalKitProps {
  kit?: Kit
  productos: Producto[]
  categoriasExistentes: string[]
  onSave: (k: Kit) => void
  onClose: () => void
}

function ModalKit({ kit, productos, categoriasExistentes, onSave, onClose }: ModalKitProps) {
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

  function updateComp(id: string, patch: Partial<KitComponente>) {
    setComponentes(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
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

  const linked = componentes.filter(c => c.producto_id).length
  const variable = componentes.filter(c => c.es_variable).length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{kit ? 'Editar kit' : 'Nuevo Kit de Equipo'}</h3>
            {componentes.filter(c => c.nombre.trim()).length > 0 && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray-400)' }}>
                {linked} de {componentes.filter(c => c.nombre.trim()).length} enlazados al inventario
                {variable > 0 && ` · ${variable} variable${variable > 1 ? 's' : ''}`}
              </p>
            )}
          </div>
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

          {/* Components table */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="text-xs font-semibold text-gray-500 uppercase">Componentes / Repuestos</label>
              <span className="text-xs text-gray-400">Busca en inventario para enlazar</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', fontSize: 11, color: 'var(--gray-500)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Componente</th>
                  <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 600 }}>Tipo / Color</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: 64 }}>Cant.</th>
                  <th style={{ width: 30 }} />
                </tr>
              </thead>
              <tbody>
                {componentes.map((c, idx) => (
                  <CompRow
                    key={c.id}
                    comp={c}
                    productos={productos}
                    onChange={updateComp}
                    onRemove={removeComp}
                    isLast={idx === componentes.length - 1}
                    lastRef={lastRowRef}
                    onEnter={addComp}
                  />
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

          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--gray-500)' }}>
            <span><span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '1px 7px', fontWeight: 700 }}>Variable</span> — el color se elige al crear la OC</span>
            <span><span style={{ background: '#dcfce7', color: '#166534', borderRadius: 20, padding: '1px 7px', fontWeight: 700 }}>Fijo</span> — sin variantes de color</span>
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

// ── Modal OC con selección de color ──────────────────────────

interface ModalOCColorProps {
  kit: Kit
  productos: Producto[]
  onConfirm: (colores: Record<string, string>) => void
  onClose: () => void
}

function ModalOCColor({ kit, productos, onConfirm, onClose }: ModalOCColorProps) {
  const variableComps = kit.componentes.filter(c => c.es_variable && c.producto_id)
  const [colores, setColores] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const c of variableComps) {
      init[c.id] = c.color_defecto ?? c.nombre
    }
    return init
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Seleccionar colores — {kit.nombre}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--gray-400)' }}>Elige el color para cada componente variable</p>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {variableComps.map(c => {
            const selProd = productos.find(p => p.id === c.producto_id)
            const variantes = selProd ? getVariantes(selProd, productos) : []
            return (
              <div key={c.id}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>
                  {stripColor(c.nombre)}
                </label>
                <select
                  value={colores[c.id] ?? ''}
                  onChange={e => setColores(prev => ({ ...prev, [c.id]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                >
                  {variantes.map(v => (
                    <option key={v.id} value={v.nombre}>{v.nombre.slice(stripColor(v.nombre).length).trim() || v.nombre}</option>
                  ))}
                </select>
              </div>
            )
          })}
          {variableComps.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--gray-500)', textAlign: 'center', margin: '8px 0' }}>No hay componentes variables en este kit.</p>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={() => onConfirm(colores)} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Crear OC
          </button>
        </div>
      </div>
    </div>
  )
}

// ── KitsTab ───────────────────────────────────────────────────

type ModalState = { open: false } | { open: true; kit?: Kit }
type OCColorState = { open: false } | { open: true; kit: Kit }

export function KitsTab() {
  const navigate = useNavigate()
  const { data: kits = [], isLoading } = useKits()
  const { data: productos = [] } = useProductos()
  const guardar = useGuardarKits()
  const { esAdmin } = useAuth()
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [ocModal, setOcModal] = useState<OCColorState>({ open: false })
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
    if (!esAdmin) return
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
    const hasVariable = kit.componentes.some(c => c.es_variable && c.producto_id)
    if (hasVariable) {
      setOcModal({ open: true, kit })
    } else {
      navegarOC(kit, {})
    }
  }

  function navegarOC(kit: Kit, coloresOverride: Record<string, string>) {
    const items = kit.componentes.map(c => {
      const nombreFinal = coloresOverride[c.id] ?? c.color_defecto ?? c.nombre
      const prod = c.producto_id
        ? (productos.find(p => p.nombre === nombreFinal) ?? productos.find(p => p.id === c.producto_id))
        : undefined
      return {
        id: uid(),
        producto_id: prod?.id ?? '',
        producto_nombre: nombreFinal,
        cantidad: c.cantidad,
        precio_neto: prod?.precio_compra ?? 0,
        precio_iva: 0,
        precio_unitario: prod?.precio_compra ?? 0,
        subtotal: c.cantidad * (prod?.precio_compra ?? 0),
        bodega_id: '',
        bodega_nombre: '',
      }
    })
    navigate('/compras', { state: { kitItems: items, kitNombre: kit.nombre } })
  }

  if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Cargando...</div>

  return (
    <div>
      {/* Info banner */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e40af', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <svg style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 21h6M10 21v-3.5a5.5 5.5 0 11-1-3.2M12 3a6 6 0 016 6c0 2-1 3.5-2 4.5" />
        </svg>
        <span><strong>¿Cómo funciona?</strong> Crea un kit para cada modelo de equipo. Enlaza cada componente al inventario para que los precios y SKUs se completen automáticamente al generar la OC.</span>
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
            <svg style={{ width: 40, height: 40, margin: '0 auto 12px', color: 'var(--gray-300)', display: 'block' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
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
                  {['Modelo / Equipo', 'Categoría', 'Componentes', 'Variables', 'Acciones'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textAlign: i === 2 || i === 3 ? 'center' : 'left', borderBottom: '1px solid var(--gray-200)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(k => {
                  const varCount = k.componentes.filter(c => c.es_variable).length
                  return (
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
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {varCount > 0
                          ? <span style={{ fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '2px 10px' }}>{varCount} variable{varCount > 1 ? 's' : ''}</span>
                          : <span style={{ color: 'var(--gray-300)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleCrearOC(k.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                          >
                            <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            Crear OC
                          </button>
                          <button
                            onClick={() => setModal({ open: true, kit: k })}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          >
                            <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            Editar
                          </button>
                          <button
                            onClick={() => handleClonar(k.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          >
                            <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" /></svg>
                            Clonar
                          </button>
                          {esAdmin && <button
                            onClick={() => handleDelete(k.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 9px', border: '1.5px solid #fee2e2', borderRadius: 7, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                          >
                            <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal kit */}
      {modal.open && (
        <ModalKit
          kit={modal.kit}
          productos={productos}
          categoriasExistentes={categoriasExistentes}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}

      {/* Modal color OC */}
      {ocModal.open && (
        <ModalOCColor
          kit={ocModal.kit}
          productos={productos}
          onConfirm={colores => { setOcModal({ open: false }); navegarOC(ocModal.kit, colores) }}
          onClose={() => setOcModal({ open: false })}
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
