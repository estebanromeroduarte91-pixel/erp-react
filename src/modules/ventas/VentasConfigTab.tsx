import { useState, useId } from 'react'
import { useCajas, useGuardarCajas, useMetodosPago, useGuardarMetodosPago, useBodegas } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Caja, MetodoPago } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

const ICON_OPTIONS = [
  { value: 'cash',   label: 'Efectivo' },
  { value: 'card',   label: 'Tarjeta' },
  { value: 'bank',   label: 'Transferencia' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'qr',     label: 'QR / Código' },
]

function MetodoIcon({ icon }: { icon: string }) {
  const cls = 'w-[18px] h-[18px] text-gray-400'
  if (icon === 'card') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  )
  if (icon === 'bank') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/></svg>
  )
  if (icon === 'wallet') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4z"/></svg>
  )
  if (icon === 'qr') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/></svg>
  )
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  )
}

export function VentasConfigTab() {
  const { data: cajas, isLoading: loadingCajas } = useCajas()
  const { data: metodos, isLoading: loadingMetodos } = useMetodosPago()
  const guardarCajas = useGuardarCajas()
  const guardarMetodos = useGuardarMetodosPago()
  const { data: bodegas } = useBodegas()

  const [cajaModal, setCajaModal] = useState<Caja | null | 'new'>(null)
  const [metodoModal, setMetodoModal] = useState<MetodoPago | null | 'new'>(null)

  const loading = loadingCajas || loadingMetodos

  async function toggleActiva(id: string) {
    const lista = cajas ?? []
    await guardarCajas.mutateAsync(lista.map(c => c.id === id ? { ...c, activa: c.activa === false ? true : false } : c))
  }

  async function eliminarCaja(id: string) {
    if (!confirm('¿Eliminar esta caja?')) return
    await guardarCajas.mutateAsync((cajas ?? []).filter(c => c.id !== id))
  }

  async function moverMetodo(idx: number, dir: -1 | 1) {
    const lista = [...(metodos ?? [])]
    const dest = idx + dir
    if (dest < 0 || dest >= lista.length) return
    ;[lista[idx], lista[dest]] = [lista[dest], lista[idx]]
    await guardarMetodos.mutateAsync(lista)
  }

  async function eliminarMetodo(id: string) {
    const lista = metodos ?? []
    if (lista.length <= 1) return
    if (!confirm('¿Eliminar este método de pago?')) return
    await guardarMetodos.mutateAsync(lista.filter(m => m.id !== id))
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-5">

      {/* Cajas periféricas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Cajas periféricas</h3>
              <p className="text-xs text-gray-400 mt-0.5">Cada caja pertenece a una sucursal y descuenta stock de su bodega vinculada.</p>
            </div>
          </div>
          <button
            onClick={() => setCajaModal('new')}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-700 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nueva caja
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2.5">
          {(cajas ?? []).length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">Sin cajas configuradas. Crea la primera con el botón de arriba.</p>
          ) : (cajas ?? []).map(c => {
            const suc = bodegas?.find(b => b.id === c.sucursalId)
            const bod = bodegas?.find(b => b.id === c.bodegaId)
            const isActiva = c.activa !== false
            return (
              <div key={c.id} className={`flex items-center gap-3 px-3.5 py-3 border border-gray-200 rounded-lg ${!isActiva ? 'opacity-55' : ''}`}>
                <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4.5 h-4.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {suc ? (suc.nombre ?? suc.name ?? 'Sin nombre') : 'Sin sucursal'} &nbsp;·&nbsp; {bod ? (bod.nombre ?? bod.name ?? 'Sin nombre') : 'Sin bodega'}
                  </p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${isActiva ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {isActiva ? 'Activa' : 'Inactiva'}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setCajaModal(c)} className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition" title="Editar">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 0 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onClick={() => toggleActiva(c.id)} className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition" title={isActiva ? 'Desactivar' : 'Activar'}>
                    {isActiva
                      ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                      : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    }
                  </button>
                  <button onClick={() => eliminarCaja(c.id)} className="w-7 h-7 border border-red-200 rounded-md flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition" title="Eliminar">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Métodos de pago */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Métodos de pago</h3>
              <p className="text-xs text-gray-400 mt-0.5">Configura los métodos disponibles en el POS. El primero es el predeterminado.</p>
            </div>
          </div>
          <button
            onClick={() => setMetodoModal('new')}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-700 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Agregar
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2.5">
          {(metodos ?? []).map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 px-3.5 py-3 border border-gray-200 rounded-lg">
              <svg className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>
              <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                <MetodoIcon icon={m.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{m.label}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => moverMetodo(i, -1)} disabled={i === 0} className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition disabled:opacity-30" title="Subir">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
                </button>
                <button onClick={() => moverMetodo(i, 1)} disabled={i === (metodos ?? []).length - 1} className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition disabled:opacity-30" title="Bajar">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
                <button onClick={() => setMetodoModal(m)} className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition" title="Editar">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 0 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onClick={() => eliminarMetodo(m.id)} disabled={(metodos ?? []).length <= 1} className="w-7 h-7 border border-red-200 rounded-md flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30" title="Eliminar">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 8h.01M11 12h1v4h1"/></svg>
          <p className="text-xs text-gray-400">Los cambios se aplican automáticamente en el POS. El primer método de la lista es el predeterminado.</p>
        </div>
      </div>

      {cajaModal !== null && (
        <CajaModal
          caja={cajaModal === 'new' ? null : cajaModal}
          bodegas={bodegas ?? []}
          onClose={() => setCajaModal(null)}
          onGuardar={async (c) => {
            const lista = cajas ?? []
            const existe = lista.some(x => x.id === c.id)
            await guardarCajas.mutateAsync(existe ? lista.map(x => x.id === c.id ? c : x) : [...lista, c])
            setCajaModal(null)
          }}
        />
      )}

      {metodoModal !== null && (
        <MetodoModal
          metodo={metodoModal === 'new' ? null : metodoModal}
          onClose={() => setMetodoModal(null)}
          onGuardar={async (m) => {
            const lista = metodos ?? []
            const existe = lista.some(x => x.id === m.id)
            await guardarMetodos.mutateAsync(existe ? lista.map(x => x.id === m.id ? m : x) : [...lista, m])
            setMetodoModal(null)
          }}
        />
      )}
    </div>
  )
}

function CajaModal({ caja, bodegas, onClose, onGuardar }: {
  caja: Caja | null
  bodegas: import('@/types').Bodega[]
  onClose: () => void
  onGuardar: (c: Caja) => Promise<void>
}) {
  const id = useId()
  const [nombre, setNombre] = useState(caja?.nombre ?? '')
  const [sucursalId, setSucursalId] = useState(caja?.sucursalId ?? '')
  const [bodegaId, setBodegaId] = useState(caja?.bodegaId ?? '')
  const [guardando, setGuardando] = useState(false)

  async function submit() {
    if (!nombre.trim()) return
    setGuardando(true)
    await onGuardar({ id: caja?.id ?? `caja-${uid()}`, nombre: nombre.trim(), sucursalId: sucursalId || undefined, bodegaId: bodegaId || undefined, activa: caja?.activa ?? true })
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{caja ? 'Editar caja' : 'Nueva caja'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor={`${id}-nombre`} className="text-xs font-medium text-gray-600 mb-1 block">Nombre</label>
            <input id={`${id}-nombre`} value={nombre} onChange={e => setNombre(e.target.value)} autoFocus placeholder="Ej: Caja principal"
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label htmlFor={`${id}-suc`} className="text-xs font-medium text-gray-600 mb-1 block">Sucursal</label>
            <select id={`${id}-suc`} value={sucursalId} onChange={e => setSucursalId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              <option value="">Sin sucursal</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name ?? b.id}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-bod`} className="text-xs font-medium text-gray-600 mb-1 block">Bodega</label>
            <select id={`${id}-bod`} value={bodegaId} onChange={e => setBodegaId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              <option value="">Sin bodega</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name ?? b.id}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={submit} disabled={!nombre.trim() || guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : caja ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MetodoModal({ metodo, onClose, onGuardar }: {
  metodo: MetodoPago | null
  onClose: () => void
  onGuardar: (m: MetodoPago) => Promise<void>
}) {
  const id = useId()
  const [label, setLabel] = useState(metodo?.label ?? '')
  const [desc, setDesc] = useState(metodo?.desc ?? '')
  const [icon, setIcon] = useState(metodo?.icon ?? 'cash')
  const [guardando, setGuardando] = useState(false)

  async function submit() {
    if (!label.trim()) return
    setGuardando(true)
    await onGuardar({ id: metodo?.id ?? `mp-${uid()}`, label: label.trim(), desc: desc.trim(), icon })
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{metodo ? 'Editar método' : 'Nuevo método de pago'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor={`${id}-label`} className="text-xs font-medium text-gray-600 mb-1 block">Nombre</label>
            <input id={`${id}-label`} value={label} onChange={e => setLabel(e.target.value)} autoFocus placeholder="Ej: Efectivo"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label htmlFor={`${id}-desc`} className="text-xs font-medium text-gray-600 mb-1 block">Descripción</label>
            <input id={`${id}-desc`} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej: Billetes y monedas"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label htmlFor={`${id}-icon`} className="text-xs font-medium text-gray-600 mb-1 block">Icono</label>
            <select id={`${id}-icon`} value={icon} onChange={e => setIcon(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              {ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={submit} disabled={!label.trim() || guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : metodo ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
