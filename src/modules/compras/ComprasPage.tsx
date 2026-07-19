import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { KitsTab } from './KitsTab'
import { useAuth } from '@/context/AuthContext'
import {
  useOCs, useCrearOC, useActualizarOC, useEliminarOC, useOCLog, useGuardarOCLog,
  useIncrementarContadorOC, useProductos, useBodegas,
  useProveedores, useGuardarProveedores, useAjustarStock,
  usePlanCuentas, useAsientos, useGuardarAsientos,
  useMovimientos, useGuardarMovimientos,
  useCrearLotes,
} from '@/lib/queries'
import { asientoDeOC, asientoIdDeOC, nextNumeroAsiento } from '@/lib/contabilidad'
import { formatRut } from '@/lib/rut'
import type { OC, OCItem, OCRecepcion, OCLogEntry, EstadoOC, Producto, Bodega, Proveedor, Movimiento, LoteInventario } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const today = () => new Date().toISOString().split('T')[0]
const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtMiles = (n: number) => (n ? n.toLocaleString('es-CL') : '')
const parseMiles = (s: string) => +s.replace(/\D/g, '') || 0
const fmtDate = (s?: string) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
const IVA = 0.19

function calcularEstadoOC(o: OC): EstadoOC {
  if (o.estado === 'cancelada' || o.estado === 'confirmada') return o.estado
  const items = o.items ?? []
  if (!items.length) return 'borrador'
  const recs = o.recepciones ?? []
  let totalOrd = 0
  let totalRec = 0
  for (const it of items) {
    const rec = recs.reduce((s, r) => {
      const ri = r.items.find(ri => ri.prod_item_id === it.id)
      return s + (ri?.cantidad ?? 0)
    }, 0)
    totalOrd += it.cantidad
    totalRec += Math.min(rec, it.cantidad)
  }
  if (totalRec === 0) return 'borrador'
  if (totalRec >= totalOrd) return 'recibida'
  return 'parcial'
}

function getCantRecibida(o: OC, itemId: string): number {
  return (o.recepciones ?? []).reduce((s, r) => {
    const ri = r.items.find(ri => ri.prod_item_id === itemId)
    return s + (ri?.cantidad ?? 0)
  }, 0)
}

const ESTADO_META: Record<EstadoOC, { label: string; color: string; bg: string }> = {
  borrador:   { label: 'Borrador',   color: '#6b7280', bg: '#f3f4f6' },
  parcial:    { label: 'Parcial', color: '#d97706', bg: '#fef3c7' },
  recibida:   { label: 'Recibida',   color: '#059669', bg: '#d1fae5' },
  confirmada: { label: 'Confirmada', color: '#2563eb', bg: '#dbeafe' },
  cancelada:  { label: 'Cancelada',  color: '#dc2626', bg: '#fee2e2' },
}

function EstadoBadge({ estado }: { estado: EstadoOC }) {
  const m = ESTADO_META[estado] ?? ESTADO_META.borrador
  return (
    <span style={{
      background: m.bg, color: m.color,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block',
    }}>
      {m.label}
    </span>
  )
}

// ─── Dropdown anclado (position: fixed para escapar del overflow del modal) ──

function useAnchoredMenu() {
  const anchorRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const measure = useCallback(() => {
    if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect())
  }, [])

  const openMenu = useCallback(() => { measure(); setOpen(true) }, [measure])

  useEffect(() => {
    if (!open) return
    measure()
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, measure])

  return { anchorRef, open, setOpen, openMenu, rect }
}

function menuStyle(rect: DOMRect | null): React.CSSProperties {
  if (!rect) return { display: 'none' }
  const width = Math.max(rect.width, 220)
  const menuMaxH = 240
  const vh = window.innerHeight
  const vw = window.innerWidth
  const left = Math.max(8, Math.min(rect.left, vw - width - 8))
  const flipUp = rect.bottom + 4 + menuMaxH > vh && rect.top > menuMaxH
  const base: React.CSSProperties = {
    position: 'fixed', left, width, zIndex: 3000,
    background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 8,
    boxShadow: '0 12px 32px rgba(16,18,24,.18)', maxHeight: menuMaxH, overflowY: 'auto',
  }
  return flipUp ? { ...base, bottom: vh - rect.top + 4 } : { ...base, top: rect.bottom + 4 }
}

// ─── Combobox de proveedor ────────────────────────────────────

function ProveedorCombo({
  value, onChange, proveedores,
}: {
  value: { id: string; nombre: string }
  onChange: (p: { id: string; nombre: string }) => void
  proveedores: Proveedor[]
}) {
  const [q, setQ] = useState(value.nombre)
  const { anchorRef, open, setOpen, openMenu, rect } = useAnchoredMenu()
  const results = q.length
    ? proveedores.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : proveedores.slice(0, 10)

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={anchorRef}
        type="text"
        value={q}
        placeholder="-- Seleccionar proveedor --"
        onChange={e => { setQ(e.target.value); openMenu() }}
        onFocus={openMenu}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={{ width: '100%' }}
      />
      {open && results.length > 0 && (
        <div style={menuStyle(rect)}>
          {results.map(p => (
            <div key={p.id}
              onMouseDown={() => { onChange({ id: p.id, nombre: p.nombre }); setQ(p.nombre); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-light)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 600 }}>{p.nombre}</span>
              {p.rut && <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{p.rut}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Row de producto en modal Nueva OC ───────────────────────

function ItemRow({
  item, bodegas, productos, onUpdate, onRemove,
}: {
  item: OCItem
  bodegas: Bodega[]
  productos: Producto[]
  onUpdate: (id: string, patch: Partial<OCItem>) => void
  onRemove: (id: string) => void
}) {
  const [q, setQ] = useState(item.producto_nombre)
  const { anchorRef, open, setOpen, openMenu, rect } = useAnchoredMenu()
  const results = q.length
    ? productos.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : productos.slice(0, 10)

  function selectProd(p: Producto) {
    const pn = p.precio_compra ?? 0
    onUpdate(item.id, {
      producto_id: p.id,
      producto_nombre: p.nombre,
      precio_neto: pn,
      precio_iva: Math.round(pn * (1 + IVA)),
      precio_unitario: pn,
      subtotal: item.cantidad * Math.round(pn * (1 + IVA)),
    })
    setQ(p.nombre)
    setOpen(false)
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
      <td style={{ padding: '6px 8px', minWidth: 290, width: '40%' }}>
        <div style={{ position: 'relative' }}>
          <input
            ref={anchorRef}
            type="text"
            value={q}
            title={q}
            placeholder="Buscar producto..."
            onChange={e => { setQ(e.target.value); openMenu(); onUpdate(item.id, { producto_nombre: e.target.value, producto_id: '' }) }}
            onFocus={openMenu}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            style={{ width: '100%', minWidth: 270 }}
          />
          {open && results.length > 0 && (
            <div style={menuStyle(rect)}>
              {results.map(p => (
                <div key={p.id}
                  onMouseDown={() => selectProd(p)}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-light)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                  {p.precio_compra != null && <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{fmt$(p.precio_compra)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </td>
      <td style={{ padding: '6px 8px' }}>
        <select
          value={item.bodega_id}
          onChange={e => {
            const opt = e.target.options[e.target.selectedIndex]
            onUpdate(item.id, { bodega_id: e.target.value, bodega_nombre: e.target.value ? opt.text : '' })
          }}
          style={{ minWidth: 105 }}
        >
          <option value="">-- Bodega --</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input type="number" value={item.cantidad} min={1} step={1}
          onChange={e => {
            const qty = +e.target.value || 1
            onUpdate(item.id, { cantidad: qty, subtotal: qty * item.precio_iva })
          }}
          style={{ width: 62, textAlign: 'center' }}
        />
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input type="text" inputMode="numeric" value={fmtMiles(item.precio_neto)} placeholder="Neto"
          onChange={e => {
            const pn = parseMiles(e.target.value)
            onUpdate(item.id, { precio_neto: pn, precio_iva: Math.round(pn * (1 + IVA)), precio_unitario: pn, subtotal: item.cantidad * Math.round(pn * (1 + IVA)) })
          }}
          style={{ width: 88 }}
        />
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input type="text" inputMode="numeric" value={fmtMiles(item.precio_iva)} placeholder="c/IVA"
          onChange={e => {
            const pi = parseMiles(e.target.value)
            const pn = Math.round(pi / (1 + IVA))
            onUpdate(item.id, { precio_neto: pn, precio_iva: pi, precio_unitario: pn, subtotal: item.cantidad * pi })
          }}
          style={{ width: 88 }}
        />
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input value={fmt$(item.subtotal)} readOnly
          style={{ width: 85, background: 'transparent', border: 'none', fontWeight: 700, color: 'var(--gray-700)', padding: '8px 4px' }}
        />
      </td>
      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
        <button onClick={() => onRemove(item.id)}
          style={{ background: 'none', border: 'none', color: 'var(--danger, #dc2626)', cursor: 'pointer', fontSize: 18, fontWeight: 700, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }}>×</button>
      </td>
    </tr>
  )
}

function newItem(): OCItem {
  return { id: uid(), producto_id: '', producto_nombre: '', cantidad: 1, precio_neto: 0, precio_iva: 0, precio_unitario: 0, subtotal: 0, bodega_id: '', bodega_nombre: '' }
}

// ─── Sub-modal: Nuevo Proveedor ───────────────────────────────

function ModalNuevoProveedor({
  onGuardar,
  onClose,
}: {
  onGuardar: (data: { nombre: string; rut?: string; telefono?: string; email?: string }) => void
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [rut, setRut] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 4 }

  function handleGuardar() {
    if (!nombre.trim()) return alert('El nombre del proveedor es requerido')
    onGuardar({
      nombre: nombre.trim(),
      rut: rut.trim() || undefined,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Nuevo proveedor</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nombre <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
            <input
              autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nombre del proveedor" style={{ width: '100%' }}
              onKeyDown={e => { if (e.key === 'Enter') handleGuardar() }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>RUT</label>
              <input
                value={rut}
                onChange={e => setRut(formatRut(e.target.value))}
                placeholder="12.345.678-9"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+56 9 …" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="proveedor@empresa.com" style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleGuardar} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            <svg style={{ width: 15, height: 15 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Guardar y seleccionar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Nueva / Editar OC ─────────────────────────────────

function ModalNuevaOC({
  ocEdit, proveedores, bodegas, productos, onSave, onClose, onCrearProveedor,
}: {
  ocEdit?: OC
  proveedores: Proveedor[]
  bodegas: Bodega[]
  productos: Producto[]
  onSave: (data: Partial<OC> & { id?: string }) => void
  onClose: () => void
  onCrearProveedor: (data: { nombre: string; rut?: string; telefono?: string; email?: string }) => Promise<Proveedor>
}) {
  const [prov, setProv] = useState({ id: ocEdit?.proveedor_id ?? '', nombre: ocEdit?.proveedor_nombre ?? '' })
  const [nuevoProvOpen, setNuevoProvOpen] = useState(false)
  const [bodegaDef, setBodegaDef] = useState({ id: ocEdit?.bodega_id ?? '', nombre: ocEdit?.bodega_nombre ?? '' })
  const [fecha, setFecha] = useState(ocEdit?.fecha ?? today())
  const [fechaEntrega, setFechaEntrega] = useState(ocEdit?.fecha_entrega ?? '')
  const [notas, setNotas] = useState(ocEdit?.notas ?? '')
  const [items, setItems] = useState<OCItem[]>(ocEdit?.items?.length ? ocEdit.items : [newItem()])

  const total = items.reduce((s, i) => s + i.subtotal, 0)

  function updateItem(id: string, patch: Partial<OCItem>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }

  function applyBodegaDef(bodId: string, bodNombre: string) {
    setBodegaDef({ id: bodId, nombre: bodNombre })
    if (bodId) setItems(prev => prev.map(it => ({ ...it, bodega_id: bodId, bodega_nombre: bodNombre })))
  }

  function handleSave() {
    if (!fecha) return alert('Ingresa una fecha')
    const validItems = items.filter(it => it.producto_nombre.trim())
    if (!validItems.length) return alert('Agrega al menos un producto')
    onSave({
      id: ocEdit?.id,
      proveedor_id: prov.id,
      proveedor_nombre: prov.nombre,
      fecha,
      fecha_entrega: fechaEntrega || undefined,
      bodega_id: bodegaDef.id || undefined,
      bodega_nombre: bodegaDef.nombre || undefined,
      notas: notas.trim() || undefined,
      items: validItems,
      total,
    })
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 940, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{ocEdit ? 'Editar' : 'Nueva'} Orden de Compra</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Proveedor <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ProveedorCombo value={prov} onChange={setProv} proveedores={proveedores} />
                </div>
                <button
                  type="button"
                  onClick={() => setNuevoProvOpen(true)}
                  title="Agregar nuevo proveedor"
                  style={{ flexShrink: 0, height: 36, padding: '0 10px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 20, color: 'var(--primary)', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >+</button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Bodega por defecto <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400, textTransform: 'none' }}>(se aplica a todas las líneas)</span></label>
              <select value={bodegaDef.id}
                onChange={e => { const opt = e.target.options[e.target.selectedIndex]; applyBodegaDef(e.target.value, e.target.value ? opt.text : '') }}
                style={{ width: '100%' }}>
                <option value="">-- Sin defecto --</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                onClick={e => e.currentTarget.showPicker?.()} style={{ width: '100%', cursor: 'pointer' }} />
            </div>
            <div>
              <label style={labelStyle}>Fecha Entrega Esperada</label>
              <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)}
                onClick={e => e.currentTarget.showPicker?.()} style={{ width: '100%', cursor: 'pointer' }} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Observaciones opcionales..." style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Productos <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
            <button onClick={() => setItems(prev => [...prev, newItem()])}
              style={{ padding: '5px 12px', fontSize: 12, border: '1.5px solid var(--gray-300)', borderRadius: 7, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              + Agregar línea
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  {['PRODUCTO', 'BODEGA DESTINO', 'CANTIDAD', 'P. NETO', 'P. c/IVA', 'SUBTOTAL', ''].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', fontSize: 11, color: 'var(--gray-500)', fontWeight: 700, textAlign: 'left', borderBottom: '1px solid var(--gray-200)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <ItemRow key={it.id} item={it} bodegas={bodegas} productos={productos}
                    onUpdate={updateItem} onRemove={id => setItems(prev => prev.filter(i => i.id !== id))} />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'right', marginTop: 12, fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>
            Total: {fmt$(total)}
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleSave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            <svg style={{ width: 15, height: 15 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3h11l3 3v13a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5h7M8 21v-6h8v6" /></svg>
            {ocEdit ? 'Actualizar' : 'Crear'} OC
          </button>
        </div>
      </div>
      {nuevoProvOpen && (
        <ModalNuevoProveedor
          onGuardar={async data => {
            const nuevo = await onCrearProveedor(data)
            setProv({ id: nuevo.id, nombre: nuevo.nombre })
            setNuevoProvOpen(false)
          }}
          onClose={() => setNuevoProvOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Modal: Recibir OC ────────────────────────────────────────

function ModalRecibirOC({
  oc, bodegas, onConfirm, onClose,
}: {
  oc: OC
  bodegas: Bodega[]
  onConfirm: (recepciones: OCRecepcion[]) => void
  onClose: () => void
}) {
  const [itemBodegas, setItemBodegas] = useState<Record<string, string>>(() =>
    Object.fromEntries(oc.items.map(it => [it.id, it.bodega_id || oc.bodega_id || '']))
  )
  const [qtys, setQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const it of oc.items) init[it.id] = Math.max(0, it.cantidad - getCantRecibida(oc, it.id))
    return init
  })
  const [notas, setNotas] = useState('')

  const recsPrev = oc.recepciones ?? []

  function handleConfirm() {
    const recItems = oc.items
      .filter(it => (qtys[it.id] ?? 0) > 0)
      .map(it => ({
        prod_item_id: it.id, producto_id: it.producto_id,
        producto_nombre: it.producto_nombre, cantidad: qtys[it.id],
        _bodega_id: itemBodegas[it.id] || '',
      }))
    if (!recItems.length) return alert('Ingresa al menos una cantidad mayor a 0')
    const sinBodega = recItems.filter(ri => !ri._bodega_id)
    if (sinBodega.length > 0) return alert(`Selecciona bodega para: ${sinBodega.map(r => r.producto_nombre).join(', ')}`)
    const byBodega = new Map<string, typeof recItems>()
    for (const ri of recItems) {
      if (!byBodega.has(ri._bodega_id)) byBodega.set(ri._bodega_id, [])
      byBodega.get(ri._bodega_id)!.push(ri)
    }
    const recepciones: OCRecepcion[] = Array.from(byBodega.entries()).map(([bodId, items]) => ({
      id: uid(), fecha: today(),
      bodega_id: bodId,
      bodega_nombre: bodegas.find(b => b.id === bodId)?.nombre ?? bodegas.find(b => b.id === bodId)?.name ?? '',
      notas: notas.trim() || undefined,
      items: items.map(({ _bodega_id: _b, ...rest }) => rest),
    }))
    onConfirm(recepciones)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nueva Recepción — {oc.numero}</h3>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{oc.proveedor_nombre || '—'} · {recsPrev.length} recepción(es) previa(s)</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', flex: 1, minHeight: 0 }}>
          <div style={{ padding: 20, overflowY: 'auto', borderRight: '1px solid var(--gray-100)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Ítems de la OC</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--gray-200)', borderRadius: 8 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  {['Producto', 'Ordenado', 'Recibido', 'A recibir'].map((h, i) => (
                    <th key={i} style={{ padding: '9px 10px', fontSize: 11, fontWeight: 700, color: i === 3 ? 'var(--primary)' : 'var(--gray-500)', textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'center', borderBottom: '1px solid var(--gray-200)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {oc.items.map(it => {
                  const yaRec = getCantRecibida(oc, it.id)
                  const pendiente = Math.max(0, it.cantidad - yaRec)
                  const pct = it.cantidad > 0 ? Math.round((yaRec / it.cantidad) * 100) : 0
                  return (
                    <tr key={it.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--gray-800)' }}>{it.producto_nombre || '—'}</div>
                        <select
                          value={itemBodegas[it.id] || ''}
                          onChange={e => setItemBodegas(prev => ({ ...prev, [it.id]: e.target.value }))}
                          style={{ fontSize: 16, marginTop: 4, width: '100%', border: '1px solid var(--gray-300)', borderRadius: 4, padding: '2px 4px', color: 'var(--gray-700)' }}
                        >
                          <option value="">-- Bodega --</option>
                          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', fontSize: 13 }}>{it.cantidad}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, color: yaRec >= it.cantidad ? '#059669' : 'var(--gray-700)', fontSize: 13 }}>{yaRec}</div>
                        <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: 4, background: pct >= 100 ? '#059669' : '#f59e0b', width: `${pct}%`, borderRadius: 4 }} />
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input type="number"
                          value={qtys[it.id] ?? 0}
                          min={0} max={pendiente}
                          disabled={pendiente === 0}
                          onChange={e => setQtys(prev => ({ ...prev, [it.id]: Math.min(+e.target.value || 0, pendiente) }))}
                          style={{ width: 80, textAlign: 'center', border: '1.5px solid var(--gray-300)', borderRadius: 7, padding: '7px 10px', fontSize: 16, fontWeight: 600, opacity: pendiente === 0 ? 0.4 : 1 }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 4 }}>Notas (opcional)</label>
              <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Ej: llegó sin embalaje original..." style={{ width: '100%', fontSize: 16 }} />
            </div>
          </div>
          <div style={{ padding: 20, background: 'var(--gray-50)', overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Historial</div>
            {recsPrev.length
              ? recsPrev.slice().reverse().map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
                  <div style={{ minWidth: 36, height: 36, background: 'var(--primary-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg style={{ width: 16, height: 16, color: 'var(--primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l5 3V8l5 3V8l4 2.5V21" /></svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800)' }}>{r.bodega_nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>{fmtDate(r.fecha)}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 4 }}>{r.items.map(i => `${i.producto_nombre}: ${i.cantidad}`).join(' · ')}</div>
                  </div>
                </div>
              ))
              : <div style={{ color: 'var(--gray-400)', fontSize: 13, textAlign: 'center', padding: 16 }}>Sin recepciones previas</div>}
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleConfirm} style={{ padding: '10px 24px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            ✓ Confirmar Recepción
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Confirmar OC ──────────────────────────────────────

function ModalConfirmarOC({
  oc, onConfirm, onClose,
}: {
  oc: OC
  onConfirm: (folio: string, metodoPago: string) => void
  onClose: () => void
}) {
  const [folio, setFolio] = useState('')
  const [metodo, setMetodo] = useState<'banco' | 'caja' | 'credito'>('banco')
  // oc.total ya incluye IVA (así se calculan las líneas de la OC) — no volver a aplicarlo.
  const totalIva = oc.total ?? 0

  const METODOS = [
    { id: 'banco' as const, label: 'Transferencia', desc: 'Se registrará el pago contra cuenta Banco (120)' },
    { id: 'caja' as const, label: 'Efectivo', desc: 'Se registrará el pago contra cuenta Caja (110)' },
    { id: 'credito' as const, label: 'A crédito', desc: 'Sin asiento de pago — queda en Cuentas por Pagar' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Confirmar {oc.numero}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--gray-500)', fontSize: 13 }}>Total a pagar</span>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{fmt$(totalIva)}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 4 }}>Folio de factura</label>
            <input type="text" value={folio} onChange={e => setFolio(e.target.value)} placeholder="Ej: 12345" autoFocus
              style={{ width: '100%', fontSize: 18, fontWeight: 700, textAlign: 'center', letterSpacing: 2 }}
              onKeyDown={e => { if (e.key === 'Enter' && folio.trim()) onConfirm(folio.trim(), metodo) }}
            />
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>Puedes ingresar el folio después editando la orden</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 8 }}>Método de pago</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {METODOS.map(m => (
                <button key={m.id} onClick={() => setMetodo(m.id)}
                  style={{
                    flex: 1, padding: '10px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 12, borderRadius: 8,
                    border: `2px solid ${metodo === m.id ? 'var(--primary)' : 'var(--gray-200)'}`,
                    background: metodo === m.id ? 'var(--primary-light)' : '#fff',
                    color: metodo === m.id ? 'var(--primary)' : 'var(--gray-600)',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{METODOS.find(m => m.id === metodo)?.desc}</p>
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => onConfirm('SIN FACTURA', metodo)}
            style={{ padding: '9px 16px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Sin factura
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '9px 16px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
            <button onClick={() => { if (!folio.trim()) return alert('Ingresa el folio o usa "Sin factura"'); onConfirm(folio.trim(), metodo) }}
              style={{ padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Confirmar y pagar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Ver OC ────────────────────────────────────────────

const PASOS: EstadoOC[] = ['borrador', 'parcial', 'recibida', 'confirmada']
const PASO_LABEL: Record<string, string> = { borrador: 'Borrador', parcial: 'Parcial', recibida: 'Recibida', confirmada: 'Confirmada' }

function ProgressStepper({ estado }: { estado: EstadoOC }) {
  const stepIdx = estado === 'cancelada' ? -1 : PASOS.indexOf(estado)
  return (
    <div style={{ display: 'flex', padding: '18px 24px', borderBottom: '1px solid var(--gray-100)' }}>
      {PASOS.map((p, i) => {
        const done = i < stepIdx || (i === stepIdx && stepIdx === PASOS.length - 1)
        const active = i === stepIdx && stepIdx < PASOS.length - 1
        return (
          <div key={p} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i < PASOS.length - 1 && (
              <div style={{
                position: 'absolute', top: 14, left: '50%', width: '100%', height: 2,
                background: i < stepIdx ? 'var(--primary)' : 'var(--gray-200)', zIndex: 0,
              }} />
            )}
            <div style={{
              width: 28, height: 28, borderRadius: '50%', zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              background: done ? 'var(--primary)' : active ? 'var(--primary)' : '#fff',
              color: done || active ? '#fff' : 'var(--gray-400)',
              border: done || active ? '2px solid var(--primary)' : '2px solid var(--gray-300)',
            }}>
              {done ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6, color: done || active ? 'var(--primary)' : 'var(--gray-400)' }}>
              {PASO_LABEL[p]}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ModalVerOC({
  oc, onClose, onRecibir, onConfirmar, onCancelar, onEditar,
}: {
  oc: OC
  onClose: () => void
  onRecibir: () => void
  onConfirmar: () => void
  onCancelar: () => void
  onEditar: () => void
}) {
  const estado = calcularEstadoOC(oc)
  const items = oc.items ?? []
  const recepciones = oc.recepciones ?? []
  const bodsByRec = [...new Set(recepciones.map(r => r.bodega_nombre).filter(Boolean))]
  const bodsByItem = [...new Set(items.map(i => i.bodega_nombre).filter(Boolean))]
  const bodUniq = [...new Set([...bodsByRec, ...bodsByItem])]

  const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid var(--gray-200)', whiteSpace: 'nowrap' }
  const detailLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }
  const detailValue: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--gray-800)' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 700 }}>{oc.numero}</h3>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{oc.proveedor_nombre || 'Sin proveedor'} · {fmtDate(oc.fecha)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <EstadoBadge estado={estado} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 0 }}>
          {estado === 'cancelada' && (
            <div style={{ margin: '16px 20px 0', background: '#fffbeb', border: '1px solid #fde68a', padding: '10px 14px', borderRadius: 8, color: '#92400e', fontSize: 13 }}>
              ⚠️ Esta orden fue cancelada
            </div>
          )}

          {/* Progress stepper */}
          <ProgressStepper estado={estado} />

          {/* Info grid 3×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--gray-100)' }}>
            <div style={{ padding: '12px 20px', borderRight: '1px solid var(--gray-100)' }}>
              <div style={detailLabel}>Proveedor</div>
              <div style={detailValue}>{oc.proveedor_nombre || '—'}</div>
            </div>
            <div style={{ padding: '12px 20px', borderRight: '1px solid var(--gray-100)' }}>
              <div style={detailLabel}>Fecha OC</div>
              <div style={detailValue}>{fmtDate(oc.fecha)}</div>
            </div>
            <div style={{ padding: '12px 20px' }}>
              <div style={detailLabel}>Entrega estimada</div>
              <div style={detailValue}>{oc.fecha_entrega ? fmtDate(oc.fecha_entrega) : '—'}</div>
            </div>
            <div style={{ padding: '12px 20px', borderRight: '1px solid var(--gray-100)', borderTop: '1px solid var(--gray-100)' }}>
              <div style={detailLabel}>Folio Factura</div>
              <div style={detailValue}>
                {oc.folio_factura
                  ? oc.folio_factura === 'SIN FACTURA'
                    ? <span style={{ color: '#d97706', fontWeight: 600 }}>⚠️ Sin factura</span>
                    : <span>#{oc.folio_factura}{oc.metodo_pago && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--gray-400)', textTransform: 'capitalize' }}> · {oc.metodo_pago}</span>}</span>
                  : <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>Pendiente</span>}
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderRight: '1px solid var(--gray-100)', borderTop: '1px solid var(--gray-100)' }}>
              <div style={detailLabel}>Bodega</div>
              <div style={detailValue}>{bodUniq.length ? bodUniq.join(', ') : '—'}</div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray-100)' }}>
              <div style={detailLabel}>Total OC</div>
              <div style={{ ...detailValue, fontSize: 18, color: 'var(--primary)' }}>{fmt$(oc.total ?? 0)}</div>
            </div>
          </div>

          {/* Notas */}
          {oc.notas && (
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--gray-100)', fontSize: 13, color: 'var(--gray-600)' }}>
              📝 {oc.notas}
            </div>
          )}

          {/* Items */}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ padding: '12px 20px 8px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ítems de la orden</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <th style={thStyle}>Producto</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 64 }}>Ord.</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 64 }}>Rec.</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 64 }}>Pend.</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 90 }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const rec = getCantRecibida(oc, it.id)
                  const pend = Math.max(0, it.cantidad - rec)
                  const pct = it.cantidad > 0 ? Math.round((rec / it.cantidad) * 100) : 0
                  return (
                    <tr key={it.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '10px 20px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{it.producto_nombre || '—'}</div>
                        <div style={{ height: 3, background: 'var(--gray-200)', borderRadius: 3, marginTop: 4, overflow: 'hidden', width: '100%' }}>
                          <div style={{ height: 3, background: pct >= 100 ? '#059669' : '#f59e0b', width: `${pct}%`, borderRadius: 3 }} />
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', color: 'var(--gray-600)', fontSize: 13 }}>{it.cantidad}</td>
                      <td style={{ padding: '10px', textAlign: 'center', fontWeight: 600, fontSize: 13, color: rec >= it.cantidad ? '#059669' : 'var(--primary)' }}>{rec}</td>
                      <td style={{ padding: '10px', textAlign: 'center', color: pend > 0 ? '#d97706' : 'var(--gray-400)', fontWeight: pend > 0 ? 600 : 400, fontSize: 13 }}>
                        {pend > 0 ? pend : '✓'}
                      </td>
                      <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 600 }}>{fmt$(it.subtotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <td colSpan={4} style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>TOTAL</td>
                  <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>{fmt$(oc.total ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cerrar</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {estado === 'borrador' && (
              <button onClick={() => { onClose(); onEditar() }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                ✏️ Editar
              </button>
            )}
            {(estado === 'borrador' || estado === 'parcial') && (
              <button onClick={onRecibir} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                📦 Recibir
              </button>
            )}
            {(estado === 'recibida' || estado === 'parcial') && (
              <button onClick={onConfirmar} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                ✅ Confirmar
              </button>
            )}
            {['borrador', 'parcial', 'recibida'].includes(estado) && (
              <button onClick={onCancelar} style={{ padding: '9px 16px', border: '1.5px solid #fee2e2', borderRadius: 8, background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                Cancelar OC
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Log Table ────────────────────────────────────────────────

function OCLogTable({ log }: { log: OCLogEntry[] }) {
  if (!log.length) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <svg style={{ width: 40, height: 40, margin: '0 auto 12px', color: 'var(--gray-300)', display: 'block' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>Sin registros eliminados</div>
      <div style={{ color: 'var(--gray-400)', fontSize: 14 }}>Las OCs eliminadas aparecerán aquí de forma permanente</div>
    </div>
  )
  const sorted = [...log].sort((a, b) => (b._eliminada_ts ?? 0) - (a._eliminada_ts ?? 0))
  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#92400e' }}>
        <svg style={{ width: 17, height: 17, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="5" y="11" width="14" height="10" rx="2" /><path strokeLinecap="round" d="M8 11V7a4 4 0 018 0v4" /></svg>
        <span>Este historial es <strong>inmutable</strong> — los registros no pueden ser eliminados ni modificados.</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--gray-50)' }}>
              {['N° OC', 'Proveedor', 'Estado', 'Fecha OC', 'Total', 'Eliminada el', 'Productos'].map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textAlign: 'left', borderBottom: '1px solid var(--gray-200)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(o => (
              <tr key={o.id + o._eliminada_ts} style={{ opacity: 0.75, borderBottom: '1px solid var(--gray-100)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#dc2626' }}>{o.numero}</td>
                <td style={{ padding: '10px 12px' }}>{o.proveedor_nombre || '—'}</td>
                <td style={{ padding: '10px 12px' }}><EstadoBadge estado={(o.estado ?? 'borrador') as EstadoOC} /></td>
                <td style={{ padding: '10px 12px' }}>{fmtDate(o.fecha)}</td>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{fmt$(o.total ?? 0)}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray-500)' }}>{fmtDate(o._eliminada_en)}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray-500)' }}>
                  {o.items.map(i => i.producto_nombre).filter(Boolean).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

type FiltroTab = 'todas' | 'borrador' | 'parcial' | 'recibida' | 'confirmada' | 'cancelada' | 'log'
type ModalState =
  | { type: 'none' }
  | { type: 'nueva'; oc?: OC }
  | { type: 'recibir'; ocId: string }
  | { type: 'confirmar'; ocId: string }
  | { type: 'ver'; ocId: string }

const FILTRO_TABS: { key: FiltroTab; label: string }[] = [
  { key: 'todas',      label: 'Todas' },
  { key: 'borrador',   label: 'Borrador' },
  { key: 'parcial',    label: 'Parcial' },
  { key: 'recibida',   label: 'Recibida' },
  { key: 'confirmada', label: 'Confirmada' },
  { key: 'cancelada',  label: 'Cancelada' },
]

type Section = 'ocs' | 'kits'

function resolveSection(param: string | null): Section {
  return param === 'kits' ? 'kits' : 'ocs'
}

export function ComprasPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { esAdmin } = useAuth()
  // Sección derivada de la URL (fuente única) → el resaltado no se desincroniza.
  const section = resolveSection(searchParams.get('section'))
  const setSection = (s: Section) => setSearchParams(s === 'ocs' ? {} : { section: s }, { replace: true })

  const [filtro, setFiltro] = useState<FiltroTab>('todas')
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  // Auto-open new OC modal when navigated from Kits (e.g. "Crear OC" button)
  useEffect(() => {
    const state = location.state as { kitItems?: OCItem[]; kitNombre?: string } | null
    if (state?.kitItems?.length) {
      const kitOC: Partial<OC> = {
        items: state.kitItems,
        proveedor_id: '',
        proveedor_nombre: '',
        bodega_id: '',
        bodega_nombre: '',
        fecha: new Date().toISOString().split('T')[0],
        notas: state.kitNombre ? `Kit: ${state.kitNombre}` : '',
      }
      setSection('ocs')
      setModal({ type: 'nueva', oc: kitOC as OC })
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const { data: rawOcs = [] } = useOCs()
  const { data: log = [] } = useOCLog()
  const { data: proveedores = [] } = useProveedores()
  const { data: productos = [] } = useProductos()
  const { data: bodegas = [] } = useBodegas()
  const crearOC = useCrearOC()
  const actualizarOC = useActualizarOC()
  const eliminarOC = useEliminarOC()
  const guardarOCLog = useGuardarOCLog()
  const incrementarContador = useIncrementarContadorOC()
  const guardarProveedores = useGuardarProveedores()
  const ajustarStock = useAjustarStock()
  const { data: planCuentas } = usePlanCuentas()
  const { data: asientos } = useAsientos()
  const guardarAsientos = useGuardarAsientos()
  const crearLotes = useCrearLotes()
  const { data: movimientos = [] } = useMovimientos()
  const guardarMovimientos = useGuardarMovimientos()

  // Recalculate dynamic estado
  const ocs: OC[] = rawOcs.map(o => {
    if (o.estado === 'cancelada' || o.estado === 'confirmada') return o
    const d = calcularEstadoOC(o)
    return d !== o.estado ? { ...o, estado: d } : o
  })

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleCrearProveedor(data: { nombre: string; rut?: string; telefono?: string; email?: string }): Promise<Proveedor> {
    const nuevo: Proveedor = { id: uid(), nombre: data.nombre, rut: data.rut, telefono: data.telefono, email: data.email, fecha_creacion: today() }
    await guardarProveedores.mutateAsync([...proveedores, nuevo])
    return nuevo
  }

  const counts: Partial<Record<FiltroTab, number>> = {
    todas: ocs.length,
    borrador: ocs.filter(o => o.estado === 'borrador').length,
    parcial: ocs.filter(o => o.estado === 'parcial').length,
    recibida: ocs.filter(o => o.estado === 'recibida').length,
    confirmada: ocs.filter(o => o.estado === 'confirmada').length,
    cancelada: ocs.filter(o => o.estado === 'cancelada').length,
    log: log.length,
  }

  const displayedOCs = (() => {
    let base = filtro === 'todas' ? ocs : ocs.filter(o => o.estado === filtro)
    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter(o => (o.numero ?? '').toLowerCase().includes(q) || (o.proveedor_nombre ?? '').toLowerCase().includes(q))
    }
    return [...base].reverse()
  })()

  async function handleSaveOC(data: Partial<OC> & { id?: string }) {
    if (data.id) {
      await actualizarOC.mutateAsync(data as Partial<OC> & { id: string })
      setModal({ type: 'none' })
      showToast('OC actualizada')
    } else {
      const counter = await incrementarContador.mutateAsync()
      const oc: OC = {
        numero: 'OC-' + String(counter).padStart(5, '0'),
        estado: 'borrador',
        fecha_creacion: today(),
        proveedor_id: '',
        proveedor_nombre: '',
        fecha: today(),
        items: [],
        total: 0,
        ...data,
        id: uid(),
      }
      await crearOC.mutateAsync(oc)
      setModal({ type: 'none' })
      showToast('OC creada: ' + oc.numero)
    }
  }

  async function handleRecibir(ocId: string, recepciones: OCRecepcion[]) {
    const updated = ocs.map(o => {
      if (o.id !== ocId) return o
      const recs = [...(o.recepciones ?? []), ...recepciones]
      const nuevoEstado = calcularEstadoOC({ ...o, recepciones: recs })
      return {
        ...o, recepciones: recs, estado: nuevoEstado,
        fecha_primera_recepcion: o.fecha_primera_recepcion ?? today(),
        fecha_recepcion: nuevoEstado === 'recibida' ? today() : o.fecha_recepcion,
      }
    })
    try {
      // Sumar stock a la bodega de destino de cada línea recibida (ajuste atómico por delta).
      const ajustes = recepciones.flatMap(rec =>
        rec.items
          .filter(ri => ri.producto_id)
          .map(ri => ({ producto_id: ri.producto_id, bodega_id: rec.bodega_id, delta: ri.cantidad }))
      )
      await ajustarStock.mutateAsync(ajustes)
      const ocOriginal = ocs.find(o => o.id === ocId)
      const nuevosLotes: LoteInventario[] = []
      for (const rec of recepciones) {
        for (const ri of rec.items) {
          if (!ri.producto_id) continue
          const ocItem = ocOriginal?.items.find(it => it.id === ri.prod_item_id)
          nuevosLotes.push({
            id: uid(),
            producto_id: ri.producto_id,
            bodega_id: rec.bodega_id,
            cantidad_inicial: ri.cantidad,
            cantidad_restante: ri.cantidad,
            costo_unitario: ocItem?.precio_neto ?? 0,
            origen: 'oc',
            oc_id: ocId,
            oc_item_id: ri.prod_item_id,
            fecha: today(),
            creado_en: new Date().toISOString(),
          })
        }
      }
      if (nuevosLotes.length > 0) await crearLotes.mutateAsync(nuevosLotes)
      const ocNumero = updated.find(o => o.id === ocId)?.numero
      const nuevosMovs: Movimiento[] = []
      for (const rec of recepciones) {
        const movProds = rec.items
          .filter(ri => ri.producto_id)
          .map(ri => ({ producto_id: ri.producto_id, producto_nombre: ri.producto_nombre, cantidad: ri.cantidad, direccion: '+' as const }))
        if (movProds.length > 0) {
          nuevosMovs.push({ id: uid(), fecha: today(), hora: new Date().toTimeString().slice(0, 5), tipo: 'entrada', bodega_destino: rec.bodega_id, referencia: ocNumero, referencia_id: ocId, notas: rec.notas, productos: movProds })
        }
      }
      if (nuevosMovs.length > 0) await guardarMovimientos.mutateAsync([...movimientos, ...nuevosMovs])
      const ocRecibida = updated.find(o => o.id === ocId)
      if (ocRecibida) await actualizarOC.mutateAsync(ocRecibida)
      setModal({ type: 'none' })
      const oc2 = updated.find(o => o.id === ocId)
      showToast(oc2?.estado === 'recibida' ? 'OC completamente recibida' : 'Recepción parcial guardada')
    } catch (e) {
      showToast('Error al guardar la recepción: ' + (e instanceof Error ? e.message : 'error desconocido'))
    }
  }

  async function handleConfirmar(ocId: string, folio: string, metodoPago: string) {
    const sinFactura = !folio.trim() || folio.trim().toUpperCase() === 'SIN FACTURA'
    const ocConfirmada = { ...(ocs.find(o => o.id === ocId)!), estado: 'confirmada' as EstadoOC, folio_factura: folio, metodo_pago: metodoPago, fecha_confirmacion: today() }
    await actualizarOC.mutateAsync(ocConfirmada)
    const listaAs = asientos ?? []
    const existente = listaAs.find(a => a.id === asientoIdDeOC(ocId))
    const asiento = asientoDeOC(ocConfirmada, metodoPago, sinFactura, planCuentas ?? [], existente?.numero ?? nextNumeroAsiento(listaAs))
    await guardarAsientos.mutateAsync(existente ? listaAs.map(a => a.id === asiento.id ? asiento : a) : [...listaAs, asiento])
    setModal({ type: 'none' })
    showToast('OC confirmada')
  }

  async function handleCancelar(ocId: string) {
    const oc = ocs.find(o => o.id === ocId)
    if (!oc || !confirm(`¿Cancelar la OC ${oc.numero}? Esta acción no se puede deshacer.`)) return
    await actualizarOC.mutateAsync({ id: ocId, estado: 'cancelada' as EstadoOC })
    // Elimina el asiento contable asociado (si la OC estaba confirmada)
    const idAs = asientoIdDeOC(ocId)
    if ((asientos ?? []).some(a => a.id === idAs)) {
      await guardarAsientos.mutateAsync((asientos ?? []).filter(a => a.id !== idAs))
    }
    setModal({ type: 'none' })
    showToast(`OC ${oc.numero} cancelada`)
  }

  async function handleEliminar(ocId: string) {
    if (!esAdmin) return
    const oc = ocs.find(o => o.id === ocId)
    if (!oc || !confirm(`¿Eliminar la OC ${oc.numero}?\n\nEsta acción no se puede deshacer, pero quedará registrada en el historial de forma permanente.`)) return
    const logEntry: OCLogEntry = { ...oc, _eliminada_en: today(), _eliminada_ts: Date.now() }
    await guardarOCLog.mutateAsync([...log, logEntry])
    await eliminarOC.mutateAsync(ocId)
    showToast(`OC ${oc.numero} eliminada y registrada en historial`)
  }

  const modalOcId = (modal.type === 'ver' || modal.type === 'recibir' || modal.type === 'confirmar') ? modal.ocId : undefined
  const modalOC = modalOcId ? ocs.find(o => o.id === modalOcId) : undefined

  return (
    <div className="px-4 md:px-0">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--gray-800)' }}>Compras</h2>
        {section === 'ocs' && (
          <button onClick={() => setModal({ type: 'nueva' })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Nueva OC
          </button>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
        {([
          { id: 'ocs',  label: 'Órdenes de Compra' },
          { id: 'kits', label: 'Kits / Equipos' },
        ] as { id: Section; label: string }[]).map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition"
            style={{ background: section === s.id ? '#3656e6' : '#f2f2f7', color: section === s.id ? '#fff' : '#6b7280' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Kits section */}
      {section === 'kits' && <KitsTab />}

      {/* OCs section */}
      {section === 'ocs' && (<>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)', border: '1px solid var(--gray-100)', overflow: 'hidden' }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-100)', flexWrap: 'wrap' }}>
          {FILTRO_TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setFiltro(key)}
              style={{
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600,
                fontSize: 13, whiteSpace: 'nowrap',
                borderBottom: filtro === key ? '2px solid var(--primary)' : '2px solid transparent',
                color: filtro === key ? 'var(--primary)' : 'var(--gray-500)',
              }}>
              {label}
              {(counts[key] ?? 0) > 0 && (
                <span style={{ marginLeft: 6, background: filtro === key ? 'var(--primary)' : 'var(--gray-200)', color: filtro === key ? '#fff' : 'var(--gray-600)', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
          <button onClick={() => setFiltro('log')}
            style={{
              marginLeft: 'auto', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600,
              fontSize: 13, color: filtro === 'log' ? 'var(--primary)' : 'var(--gray-400)',
              borderBottom: filtro === 'log' ? '2px solid var(--primary)' : '2px solid transparent',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <svg style={{ width: 15, height: 15 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
            Historial
            {log.length > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--gray-100)', color: 'var(--gray-500)', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{log.length}</span>
            )}
          </button>
        </div>

        {/* Count + search bar */}
        <div style={{ padding: '10px 20px', color: 'var(--gray-500)', fontSize: 13, borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {filtro !== 'log' ? (
            <>
              <span>
                <strong style={{ color: 'var(--gray-700)' }}>{filtro === 'todas' ? ocs.length : (counts[filtro] ?? 0)}</strong> orden(es)
              </span>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por N° o proveedor..."
                style={{ marginLeft: 'auto', padding: '6px 12px', border: '1.5px solid var(--gray-200)', borderRadius: 7, fontSize: 16, width: 240 }}
              />
            </>
          ) : (
            <span>
              <strong style={{ color: 'var(--gray-700)' }}>{log.length}</strong> registro{log.length !== 1 ? 's' : ''} eliminados (registro inmutable)
            </span>
          )}
        </div>

        {/* Content */}
        {filtro === 'log' ? (
          <OCLogTable log={log} />
        ) : displayedOCs.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <svg style={{ width: 40, height: 40, margin: '0 auto 12px', color: 'var(--gray-300)', display: 'block' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            <h3 style={{ margin: '0 0 6px', color: 'var(--gray-600)' }}>Sin órdenes de compra</h3>
            <p style={{ color: 'var(--gray-400)', margin: 0 }}>
              {search ? 'No se encontraron resultados para tu búsqueda' : 'Crea tu primera orden de compra para comenzar'}
            </p>
          </div>
        ) : (
          <>
          {/* Cards — mobile */}
          <div className="md:hidden divide-y divide-gray-100">
            {displayedOCs.map(o => (
              <div key={o.id} className="px-4 py-3 active:bg-gray-50 cursor-pointer"
                onClick={() => setModal({ type: 'ver', ocId: o.id })}>
                <div className="flex items-center justify-between mb-1">
                  <strong style={{ color: 'var(--primary)', fontFamily: 'monospace', fontSize: 12 }}>{o.numero}</strong>
                  <EstadoBadge estado={o.estado} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-800)' }}>{o.proveedor_nombre || '—'}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-900)', flexShrink: 0 }}>{fmt$(o.total ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{fmtDate(o.fecha)} · {(o.items ?? []).length} ítem(s)</span>
                  <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                    {(o.estado === 'borrador' || o.estado === 'parcial') && (
                      <button onClick={() => setModal({ type: 'recibir', ocId: o.id })}
                        style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        Recibir
                      </button>
                    )}
                    {(o.estado === 'recibida' || o.estado === 'parcial') && (
                      <button onClick={() => setModal({ type: 'confirmar', ocId: o.id })}
                        style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        Confirmar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Tabla — desktop */}
          <div className="hidden md:block" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  {['N° OC', 'Fecha', 'Proveedor', 'Ítems', 'Total', 'Estado', 'Acciones'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textAlign: 'left', borderBottom: '1px solid var(--gray-200)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedOCs.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--gray-100)', cursor: 'pointer' }}
                    onClick={() => setModal({ type: 'ver', ocId: o.id })}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <strong style={{ color: 'var(--primary)' }}>{o.numero}</strong>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--gray-600)', fontSize: 13 }}>{fmtDate(o.fecha)}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 500 }}>{o.proveedor_nombre || '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>{(o.items ?? []).length}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }}>{fmt$(o.total ?? 0)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <EstadoBadge estado={o.estado} />
                      {o.folio_factura && (
                        <div style={{ fontSize: 11, marginTop: 2, color: 'var(--gray-400)' }}>
                          {o.folio_factura === 'SIN FACTURA' ? 'Sin factura' : '#' + o.folio_factura}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                        <button onClick={() => setModal({ type: 'ver', ocId: o.id })}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          Ver
                        </button>
                        {(o.estado === 'borrador' || o.estado === 'parcial') && (
                          <>
                            <button onClick={() => setModal({ type: 'recibir', ocId: o.id })}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: 'none', borderRadius: 7, background: '#059669', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                              <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                              Recibir
                            </button>
                            <button onClick={() => handleCancelar(o.id)}
                              style={{ padding: '5px 9px', border: '1.5px solid var(--gray-200)', borderRadius: 7, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                              ×
                            </button>
                          </>
                        )}
                        {(o.estado === 'recibida' || o.estado === 'parcial') && (
                          <button onClick={() => setModal({ type: 'confirmar', ocId: o.id })}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: 'none', borderRadius: 7, background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            Confirmar
                          </button>
                        )}
                        {esAdmin && <button onClick={() => handleEliminar(o.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', border: '1.5px solid #fee2e2', borderRadius: 7, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>
                          <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Toast notification */}
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

      {/* Modals */}
      {modal.type === 'nueva' && (
        <ModalNuevaOC
          ocEdit={modal.oc}
          proveedores={proveedores}
          bodegas={bodegas}
          productos={productos}
          onSave={handleSaveOC}
          onClose={() => setModal({ type: 'none' })}
          onCrearProveedor={handleCrearProveedor}
        />
      )}
      {modal.type === 'recibir' && modalOC && (
        <ModalRecibirOC
          oc={modalOC}
          bodegas={bodegas}
          onConfirm={recs => handleRecibir(modal.ocId, recs)}
          onClose={() => setModal({ type: 'none' })}
        />
      )}
      {modal.type === 'confirmar' && modalOC && (
        <ModalConfirmarOC
          oc={modalOC}
          onConfirm={(folio, metodo) => handleConfirmar(modal.ocId, folio, metodo)}
          onClose={() => setModal({ type: 'none' })}
        />
      )}
      {modal.type === 'ver' && modalOC && (
        <ModalVerOC
          oc={modalOC}
          onClose={() => setModal({ type: 'none' })}
          onRecibir={() => setModal({ type: 'recibir', ocId: modal.ocId })}
          onConfirmar={() => setModal({ type: 'confirmar', ocId: modal.ocId })}
          onCancelar={() => handleCancelar(modal.ocId)}
          onEditar={() => setModal({ type: 'nueva', oc: modalOC })}
        />
      )}
      </>)}
    </div>
  )
}
