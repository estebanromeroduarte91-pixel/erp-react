import { useState, useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { KitsTab } from './KitsTab'
import {
  useOCs, useGuardarOCs, useOCLog, useGuardarOCLog,
  useIncrementarContadorOC, useProductos, useBodegas,
  useProveedores, useGuardarProductos,
} from '@/lib/queries'
import type { OC, OCItem, OCRecepcion, OCLogEntry, EstadoOC, Producto, Bodega, Proveedor } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const today = () => new Date().toISOString().split('T')[0]
const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
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
  parcial:    { label: 'Parcial 📦', color: '#d97706', bg: '#fef3c7' },
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

// ─── Combobox de proveedor ────────────────────────────────────

function ProveedorCombo({
  value, onChange, proveedores,
}: {
  value: { id: string; nombre: string }
  onChange: (p: { id: string; nombre: string }) => void
  proveedores: Proveedor[]
}) {
  const [q, setQ] = useState(value.nombre)
  const [open, setOpen] = useState(false)
  const results = q.length
    ? proveedores.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : proveedores.slice(0, 10)

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={q}
        placeholder="-- Seleccionar proveedor --"
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={{ width: '100%' }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: '#fff', border: '1px solid var(--gray-200)',
          borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.12)',
          maxHeight: 220, overflowY: 'auto',
        }}>
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
  const [open, setOpen] = useState(false)
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
      subtotal: item.cantidad * pn,
    })
    setQ(p.nombre)
    setOpen(false)
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
      <td style={{ padding: '6px 8px', minWidth: 180 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={q}
            placeholder="Buscar producto..."
            onChange={e => { setQ(e.target.value); setOpen(true); onUpdate(item.id, { producto_nombre: e.target.value, producto_id: '' }) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            style={{ width: '100%', minWidth: 160 }}
          />
          {open && results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 9999, minWidth: 220,
              background: '#fff', border: '1px solid var(--gray-200)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.14)',
              maxHeight: 200, overflowY: 'auto',
            }}>
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
          style={{ minWidth: 130 }}
        >
          <option value="">-- Bodega --</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input type="number" value={item.cantidad} min={1} step={1}
          onChange={e => {
            const qty = +e.target.value || 1
            onUpdate(item.id, { cantidad: qty, subtotal: qty * item.precio_neto })
          }}
          style={{ width: 70, textAlign: 'center' }}
        />
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input type="number" value={item.precio_neto} min={0} placeholder="Neto"
          onChange={e => {
            const pn = +e.target.value || 0
            onUpdate(item.id, { precio_neto: pn, precio_iva: Math.round(pn * (1 + IVA)), precio_unitario: pn, subtotal: item.cantidad * pn })
          }}
          style={{ width: 95 }}
        />
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input type="number" value={item.precio_iva} min={0} placeholder="c/IVA"
          onChange={e => {
            const pi = +e.target.value || 0
            const pn = Math.round(pi / (1 + IVA))
            onUpdate(item.id, { precio_neto: pn, precio_iva: pi, precio_unitario: pn, subtotal: item.cantidad * pn })
          }}
          style={{ width: 95 }}
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

// ─── Modal: Nueva / Editar OC ─────────────────────────────────

function ModalNuevaOC({
  ocEdit, proveedores, bodegas, productos, onSave, onClose,
}: {
  ocEdit?: OC
  proveedores: Proveedor[]
  bodegas: Bodega[]
  productos: Producto[]
  onSave: (data: Partial<OC> & { id?: string }) => void
  onClose: () => void
}) {
  const [prov, setProv] = useState({ id: ocEdit?.proveedor_id ?? '', nombre: ocEdit?.proveedor_nombre ?? '' })
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
    if (bodId) setItems(prev => prev.map(it => it.bodega_id ? it : { ...it, bodega_id: bodId, bodega_nombre: bodNombre }))
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

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4, textTransform: 'uppercase' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{ocEdit ? 'Editar' : 'Nueva'} Orden de Compra</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Proveedor <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
              <ProveedorCombo value={prov} onChange={setProv} proveedores={proveedores} />
            </div>
            <div>
              <label style={labelStyle}>Bodega por defecto <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400, textTransform: 'none' }}>(se aplica a líneas vacías)</span></label>
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
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Fecha entrega esperada</label>
              <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} style={{ width: '100%' }} />
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
                  {['PRODUCTO', 'BODEGA DESTINO', 'CANT.', 'P. NETO', 'P. C/IVA', 'SUBTOTAL', ''].map((h, i) => (
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
          <button onClick={handleSave} style={{ padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            💾 {ocEdit ? 'Actualizar' : 'Crear'} OC
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Recibir OC ────────────────────────────────────────

function ModalRecibirOC({
  oc, bodegas, onConfirm, onClose,
}: {
  oc: OC
  bodegas: Bodega[]
  onConfirm: (recepcion: OCRecepcion) => void
  onClose: () => void
}) {
  const [bodegaId, setBodegaId] = useState('')
  const [qtys, setQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const it of oc.items) init[it.id] = Math.max(0, it.cantidad - getCantRecibida(oc, it.id))
    return init
  })
  const [notas, setNotas] = useState('')

  const recsPrev = oc.recepciones ?? []
  const bodNombre = bodegas.find(b => b.id === bodegaId)?.nombre ?? bodegas.find(b => b.id === bodegaId)?.name ?? ''

  function handleConfirm() {
    if (!bodegaId) return alert('Selecciona una bodega')
    const recItems = oc.items
      .filter(it => (qtys[it.id] ?? 0) > 0)
      .map(it => ({ prod_item_id: it.id, producto_id: it.producto_id, producto_nombre: it.producto_nombre, cantidad: qtys[it.id] }))
    if (!recItems.length) return alert('Ingresa al menos una cantidad mayor a 0')
    onConfirm({ id: uid(), fecha: today(), bodega_id: bodegaId, bodega_nombre: bodNombre, notas: notas.trim() || undefined, items: recItems })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>📦 Nueva Recepción — {oc.numero}</h3>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{oc.proveedor_nombre || '—'} · {recsPrev.length} recepción(es) previa(s)</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', flex: 1, minHeight: 0 }}>
          <div style={{ padding: 20, overflowY: 'auto', borderRight: '1px solid var(--gray-100)' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 4 }}>
                🏭 Bodega que recibe <span style={{ color: 'var(--danger, #dc2626)' }}>*</span>
              </label>
              <select value={bodegaId} onChange={e => setBodegaId(e.target.value)} style={{ width: '100%', fontSize: 14, fontWeight: 600 }}>
                <option value="">-- Seleccionar bodega --</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
              </select>
              {!bodegas.length && <p style={{ fontSize: 12, color: '#d97706', marginTop: 4 }}>⚠️ No hay bodegas creadas.</p>}
            </div>
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
                        {it.bodega_nombre && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>🏭 {it.bodega_nombre}</div>}
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
                          style={{ width: 80, textAlign: 'center', border: '1.5px solid var(--gray-300)', borderRadius: 7, padding: '7px 10px', fontSize: 14, fontWeight: 600, opacity: pendiente === 0 ? 0.4 : 1 }}
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
                placeholder="Ej: llegó sin embalaje original..." style={{ width: '100%', fontSize: 13 }} />
            </div>
          </div>
          <div style={{ padding: 20, background: 'var(--gray-50)', overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>📋 Historial</div>
            {recsPrev.length
              ? recsPrev.slice().reverse().map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
                  <div style={{ minWidth: 36, height: 36, background: 'var(--primary-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏭</div>
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
  const totalIva = Math.round((oc.total ?? 0) * 1.19)

  const METODOS = [
    { id: 'banco' as const, icon: '🏦', label: 'Banco', desc: 'Se registrará el pago contra cuenta Banco (120)' },
    { id: 'caja' as const, icon: '💵', label: 'Caja / Efectivo', desc: 'Se registrará el pago contra cuenta Caja (110)' },
    { id: 'credito' as const, icon: '📋', label: 'A crédito', desc: 'Sin asiento de pago — queda en Cuentas por Pagar' },
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
                  {m.icon}<br />{m.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{METODOS.find(m => m.id === metodo)?.desc}</p>
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => onConfirm('SIN FACTURA', metodo)}
            style={{ padding: '9px 16px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📄 Sin factura
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '9px 16px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
            <button onClick={() => { if (!folio.trim()) return alert('Ingresa el folio o usa "Sin factura"'); onConfirm(folio.trim(), metodo) }}
              style={{ padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              ✅ Confirmar y pagar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Ver OC ────────────────────────────────────────────

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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>{oc.numero}</h3>
              <EstadoBadge estado={estado} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              {oc.proveedor_nombre || '—'} · {fmtDate(oc.fecha)}
              {oc.fecha_entrega && ` · Entrega est.: ${fmtDate(oc.fecha_entrega)}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {estado !== 'cancelada' && estado !== 'confirmada' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {(estado === 'borrador' || estado === 'parcial') && (
                <>
                  <button onClick={onRecibir} style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>📦 Recibir</button>
                  <button onClick={onEditar} style={{ padding: '8px 16px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>✏️ Editar</button>
                  <button onClick={onCancelar} style={{ padding: '8px 16px', border: '1.5px solid #fee2e2', borderRadius: 8, background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>✕ Cancelar</button>
                </>
              )}
              {(estado === 'recibida' || estado === 'parcial') && (
                <button onClick={onConfirmar} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>✅ Confirmar</button>
              )}
            </div>
          )}
          {oc.folio_factura && (
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', gap: 16 }}>
              <span>📄 Folio: <strong>{oc.folio_factura === 'SIN FACTURA' ? 'Sin factura' : '#' + oc.folio_factura}</strong></span>
              {oc.metodo_pago && <span>💳 Pago: <strong style={{ textTransform: 'capitalize' }}>{oc.metodo_pago}</strong></span>}
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 8 }}>Productos</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                {['Producto', 'Bodega', 'Cant.', 'Recibido', 'P. Neto', 'Subtotal'].map((h, i) => (
                  <th key={i} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textAlign: 'left', borderBottom: '1px solid var(--gray-200)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const rec = getCantRecibida(oc, it.id)
                const pct = it.cantidad > 0 ? Math.round((rec / it.cantidad) * 100) : 0
                return (
                  <tr key={it.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13 }}>{it.producto_nombre}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray-500)' }}>{it.bodega_nombre || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{it.cantidad}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ color: rec >= it.cantidad ? '#059669' : '#d97706', fontWeight: 600 }}>{rec}</span>
                      <span style={{ color: 'var(--gray-400)', fontSize: 11 }}> ({pct}%)</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{fmt$(it.precio_neto)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{fmt$(it.subtotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Total: {fmt$(oc.total ?? 0)}</div>
          {recepciones.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 8 }}>Recepciones ({recepciones.length})</div>
              {recepciones.slice().reverse().map((r, ri) => (
                <div key={r.id} style={{ marginBottom: 10, border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ background: 'var(--gray-50)', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gray-100)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{recepciones.length - ri}</span>
                      <strong style={{ fontSize: 13 }}>{r.bodega_nombre}</strong>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{fmtDate(r.fecha)}</span>
                  </div>
                  <div style={{ padding: '10px 14px', fontSize: 13 }}>
                    {r.items.map(i => `${i.producto_nombre}: ${i.cantidad}`).join(' · ')}
                    {r.notas && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>📝 {r.notas}</div>}
                  </div>
                </div>
              ))}
            </>
          )}
          {oc.notas && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--gray-600)', background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px' }}>
              📝 {oc.notas}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', border: '1.5px solid var(--gray-300)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Log Table ────────────────────────────────────────────────

function OCLogTable({ log }: { log: OCLogEntry[] }) {
  if (!log.length) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🗂</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>Sin registros eliminados</div>
      <div style={{ color: 'var(--gray-400)', fontSize: 14 }}>Las OCs eliminadas aparecerán aquí de forma permanente</div>
    </div>
  )
  const sorted = [...log].sort((a, b) => (b._eliminada_ts ?? 0) - (a._eliminada_ts ?? 0))
  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#92400e' }}>
        <span style={{ fontSize: 18 }}>🔒</span>
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
  { key: 'parcial',    label: 'Parcial 📦' },
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
  const [searchParams] = useSearchParams()
  const [section, setSection] = useState<Section>(() => resolveSection(searchParams.get('section')))

  useEffect(() => {
    setSection(resolveSection(searchParams.get('section')))
  }, [searchParams])

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
  const guardarOCs = useGuardarOCs()
  const guardarOCLog = useGuardarOCLog()
  const incrementarContador = useIncrementarContadorOC()
  const guardarProductos = useGuardarProductos()

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
      const updated = ocs.map(o => o.id === data.id ? { ...o, ...data } as OC : o)
      await guardarOCs.mutateAsync(updated)
      setModal({ type: 'none' })
      showToast('OC actualizada')
    } else {
      const counter = await incrementarContador.mutateAsync()
      const oc: OC = {
        id: uid(),
        numero: 'OC-' + String(counter).padStart(5, '0'),
        estado: 'borrador',
        fecha_creacion: today(),
        proveedor_id: '',
        proveedor_nombre: '',
        fecha: today(),
        items: [],
        total: 0,
        ...data,
      }
      await guardarOCs.mutateAsync([...ocs, oc])
      setModal({ type: 'none' })
      showToast('OC creada: ' + oc.numero)
    }
  }

  async function handleRecibir(ocId: string, recepcion: OCRecepcion) {
    const updated = ocs.map(o => {
      if (o.id !== ocId) return o
      const recs = [...(o.recepciones ?? []), recepcion]
      const nuevoEstado = calcularEstadoOC({ ...o, recepciones: recs })
      return {
        ...o, recepciones: recs, estado: nuevoEstado,
        fecha_primera_recepcion: o.fecha_primera_recepcion ?? today(),
        fecha_recepcion: nuevoEstado === 'recibida' ? today() : o.fecha_recepcion,
      }
    })
    // Update product stock
    if (productos.length > 0) {
      const updatedProds = [...productos]
      for (const ri of recepcion.items) {
        if (!ri.producto_id) continue
        const idx = updatedProds.findIndex(p => p.id === ri.producto_id)
        if (idx >= 0) updatedProds[idx] = { ...updatedProds[idx], stock: (+updatedProds[idx].stock! || 0) + ri.cantidad }
      }
      await guardarProductos.mutateAsync(updatedProds)
    }
    await guardarOCs.mutateAsync(updated)
    setModal({ type: 'none' })
    const oc2 = updated.find(o => o.id === ocId)
    showToast(oc2?.estado === 'recibida' ? '✅ OC completamente recibida' : '📦 Recepción parcial guardada')
  }

  async function handleConfirmar(ocId: string, folio: string, metodoPago: string) {
    const updated = ocs.map(o =>
      o.id === ocId ? { ...o, estado: 'confirmada' as EstadoOC, folio_factura: folio, metodo_pago: metodoPago, fecha_confirmacion: today() } : o
    )
    await guardarOCs.mutateAsync(updated)
    setModal({ type: 'none' })
    showToast('OC confirmada ✅')
  }

  async function handleCancelar(ocId: string) {
    const oc = ocs.find(o => o.id === ocId)
    if (!oc || !confirm(`¿Cancelar la OC ${oc.numero}? Esta acción no se puede deshacer.`)) return
    await guardarOCs.mutateAsync(ocs.map(o => o.id === ocId ? { ...o, estado: 'cancelada' as EstadoOC } : o))
    setModal({ type: 'none' })
    showToast(`OC ${oc.numero} cancelada`)
  }

  async function handleEliminar(ocId: string) {
    const oc = ocs.find(o => o.id === ocId)
    if (!oc || !confirm(`¿Eliminar la OC ${oc.numero}?\n\nEsta acción no se puede deshacer, pero quedará registrada en el historial de forma permanente.`)) return
    const logEntry: OCLogEntry = { ...oc, _eliminada_en: today(), _eliminada_ts: Date.now() }
    await guardarOCLog.mutateAsync([...log, logEntry])
    await guardarOCs.mutateAsync(ocs.filter(o => o.id !== ocId))
    showToast(`OC ${oc.numero} eliminada y registrada en historial`)
  }

  const modalOcId = (modal.type === 'ver' || modal.type === 'recibir' || modal.type === 'confirmar') ? modal.ocId : undefined
  const modalOC = modalOcId ? ocs.find(o => o.id === modalOcId) : undefined

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--gray-800)' }}>Compras</h2>
        {section === 'ocs' && (
          <button onClick={() => setModal({ type: 'nueva' })}
            style={{ padding: '9px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            ➕ Nueva OC
          </button>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        {([
          { id: 'ocs',  label: 'Órdenes de Compra' },
          { id: 'kits', label: 'Kits / Equipos' },
        ] as { id: Section; label: string }[]).map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={[
              'px-4 py-1.5 text-sm font-medium rounded-lg transition',
              section === s.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}>
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
        <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-100)', overflowX: 'auto' }}>
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
            }}>
            🗂 Historial
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
                style={{ marginLeft: 'auto', padding: '6px 12px', border: '1.5px solid var(--gray-200)', borderRadius: 7, fontSize: 13, width: 240 }}
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
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <h3 style={{ margin: '0 0 6px', color: 'var(--gray-600)' }}>Sin órdenes de compra</h3>
            <p style={{ color: 'var(--gray-400)', margin: 0 }}>
              {search ? 'No se encontraron resultados para tu búsqueda' : 'Crea tu primera orden de compra para comenzar'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
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
                          📄 {o.folio_factura === 'SIN FACTURA' ? 'Sin factura' : '#' + o.folio_factura}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                        <button onClick={() => setModal({ type: 'ver', ocId: o.id })}
                          style={{ padding: '5px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          👁 Ver
                        </button>
                        {(o.estado === 'borrador' || o.estado === 'parcial') && (
                          <>
                            <button onClick={() => setModal({ type: 'recibir', ocId: o.id })}
                              style={{ padding: '5px 10px', border: 'none', borderRadius: 7, background: '#059669', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                              📦 Recibir
                            </button>
                            <button onClick={() => handleCancelar(o.id)}
                              style={{ padding: '5px 9px', border: '1.5px solid var(--gray-200)', borderRadius: 7, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                              ×
                            </button>
                          </>
                        )}
                        {(o.estado === 'recibida' || o.estado === 'parcial') && (
                          <button onClick={() => setModal({ type: 'confirmar', ocId: o.id })}
                            style={{ padding: '5px 10px', border: 'none', borderRadius: 7, background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            ✅ Confirmar
                          </button>
                        )}
                        <button onClick={() => handleEliminar(o.id)}
                          style={{ padding: '5px 8px', border: '1.5px solid #fee2e2', borderRadius: 7, background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>
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
        />
      )}
      {modal.type === 'recibir' && modalOC && (
        <ModalRecibirOC
          oc={modalOC}
          bodegas={bodegas}
          onConfirm={rec => handleRecibir(modal.ocId, rec)}
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
