import { useState, useMemo } from 'react'
import { useCotizaciones, useCrearCotizacion, useEliminarCotizacion, useSeguimientoConfig, useClientes, useOrdenes, type NuevaCotizacion } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { sendEmail, buildEmailCotizacion, urlCotizacion } from '@/lib/email'
import { Spinner } from '@/components/shared/Spinner'
import { formatRut } from '@/lib/rut'
import type { Cotizacion, CotizacionItem } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

type LineaForm = { id: string; nombre: string; descripcion: string; cantidad: number; precio_unitario: number }
const lineaVacia = (): LineaForm => ({ id: uid(), nombre: '', descripcion: '', cantidad: 1, precio_unitario: 0 })

function vigencia(c: Cotizacion): { label: string; color: string } {
  if (!c.fecha_vencimiento) return { label: 'Sin vencimiento', color: 'bg-gray-100 text-gray-500' }
  const vencida = new Date(c.fecha_vencimiento + 'T23:59:59') < new Date()
  return vencida ? { label: 'Vencida', color: 'bg-red-100 text-red-600' } : { label: 'Vigente', color: 'bg-green-100 text-green-700' }
}

function ModalNuevaCotizacion({ onClose }: { onClose: () => void }) {
  const { empresaId, empresaNombre } = useAuth()
  const { data: segCfg } = useSeguimientoConfig()
  const { data: clientes = [] } = useClientes()
  const { data: ordenes = [] } = useOrdenes()
  const crear = useCrearCotizacion()

  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteRut, setClienteRut] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteTel, setClienteTel] = useState('')
  const [equipo, setEquipo] = useState('')
  const [notas, setNotas] = useState('')
  const [vence, setVence] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [enviarEmail, setEnviarEmail] = useState(true)

  function setLinea(i: number, patch: Partial<LineaForm>) {
    setLineas(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  function quitarLinea(i: number) {
    setLineas(ls => ls.filter((_, idx) => idx !== i))
  }

  function elegirCliente(id: string) {
    const c = clientes.find(x => x.id === id)
    if (!c) return
    setClienteNombre([c.nombre, c.apellido].filter(Boolean).join(' '))
    setClienteRut(c.rut ?? '')
    setClienteEmail(c.email ?? '')
    setClienteTel(c.tel ?? '')
  }

  function elegirOrden(id: string) {
    const o = ordenes.find(x => x.id === id)
    if (!o) return
    setClienteNombre([o.nombre, o.apellido].filter(Boolean).join(' '))
    setClienteRut(o.rut ?? '')
    setClienteEmail(o.email ?? '')
    setClienteTel(o.tel ?? '')
    setEquipo(o.modelo ?? '')
    const items = (o.repuestos ?? []).filter(r => r.name?.trim())
    if (items.length) {
      setLineas(items.map(r => ({ id: uid(), nombre: r.name, descripcion: '', cantidad: r.qty || 1, precio_unitario: r.precio || 0 })))
    }
  }

  const totales = useMemo(() => {
    const subtotal = lineas.reduce((s, l) => s + (l.cantidad || 0) * (l.precio_unitario || 0), 0) / 1.19
    const iva = subtotal * 0.19
    const total = subtotal + iva
    return { subtotal: Math.round(subtotal), iva: Math.round(iva), total: Math.round(total) }
  }, [lineas])

  async function guardar() {
    setError('')
    if (!clienteNombre.trim()) { setError('Ingresa el nombre del cliente'); return }
    const validas = lineas.filter(l => l.nombre.trim() && l.cantidad > 0)
    if (!validas.length) { setError('Agrega al menos un servicio'); return }
    if (!empresaId) return

    setGuardando(true)
    try {
      const items: CotizacionItem[] = validas.map(l => ({
        id: l.id, nombre: l.nombre.trim(), descripcion: l.descripcion.trim() || undefined,
        cantidad: l.cantidad, precio_unitario: l.precio_unitario,
      }))
      const payload: NuevaCotizacion = {
        cliente_nombre: clienteNombre.trim(),
        cliente_rut: clienteRut.trim() || undefined,
        cliente_email: clienteEmail.trim() || undefined,
        cliente_tel: clienteTel.trim() || undefined,
        equipo: equipo.trim() || undefined,
        notas: notas.trim() || undefined,
        items,
        subtotal: totales.subtotal,
        iva: totales.iva,
        total: totales.total,
        fecha_emision: new Date().toISOString().slice(0, 10),
        fecha_vencimiento: vence || undefined,
      }
      const nueva = await crear.mutateAsync(payload)

      if (enviarEmail && clienteEmail.trim()) {
        const html = buildEmailCotizacion({
          tallerNombre: empresaNombre || 'tu taller',
          logoUrl: segCfg?.logoUrl,
          clienteNombre: nueva.cliente_nombre,
          equipo: nueva.equipo,
          numero: nueva.numero,
          total: nueva.total,
          fechaVencimiento: nueva.fecha_vencimiento,
          link: urlCotizacion(nueva.token),
        })
        await sendEmail(empresaId, clienteEmail.trim(), `Tu cotización COT-${String(nueva.numero).padStart(4, '0')}`, html)
      }
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900">Nueva cotización</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {ordenes.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Vincular a una orden existente (opcional)</label>
              <select onChange={e => elegirOrden(e.target.value)} defaultValue=""
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
                <option value="">Seleccionar…</option>
                {ordenes.map(o => (
                  <option key={o.id} value={o.id}>
                    #{o.num} — {[o.nombre, o.apellido].filter(Boolean).join(' ')}{o.modelo ? ` (${o.modelo})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Autocompleta cliente, equipo y repuestos de la orden.</p>
            </div>
          )}

          {clientes.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Rellenar desde un cliente existente (opcional)</label>
              <select onChange={e => elegirCliente(e.target.value)} defaultValue=""
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
                <option value="">Seleccionar…</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{[c.nombre, c.apellido].filter(Boolean).join(' ')}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del cliente *</label>
              <input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">RUT</label>
              <input value={clienteRut} onChange={e => setClienteRut(formatRut(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Teléfono</label>
              <input value={clienteTel} onChange={e => setClienteTel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Correo</label>
              <input type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Equipo (opcional)</label>
              <input value={equipo} onChange={e => setEquipo(e.target.value)} placeholder="Ej: iPhone 13 Pro"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Válida hasta (opcional)</label>
              <input type="date" value={vence} onChange={e => setVence(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Servicios a cotizar</p>
            <div className="space-y-2">
              {lineas.map((l, i) => (
                <div key={l.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
                  <div className="flex gap-2">
                    <input value={l.nombre} onChange={e => setLinea(i, { nombre: e.target.value })}
                      placeholder="Nombre del servicio"
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-blue-400" />
                    {lineas.length > 1 && (
                      <button onClick={() => quitarLinea(i)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  <input value={l.descripcion} onChange={e => setLinea(i, { descripcion: e.target.value })}
                    placeholder="Descripción (opcional)"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-blue-400" />
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Cant.</span>
                      <input type="number" min={1} value={l.cantidad}
                        onChange={e => setLinea(i, { cantidad: Math.max(1, +e.target.value) })}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-xs text-gray-400">Precio (IVA incl.)</span>
                      <input type="number" min={0} value={l.precio_unitario}
                        onChange={e => setLinea(i, { precio_unitario: Math.max(0, +e.target.value) })}
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setLineas(ls => [...ls, lineaVacia()])}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 text-xs font-medium hover:bg-gray-50 transition">
              + Agregar servicio
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Notas (opcional)</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(totales.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>IVA (19%)</span><span>{fmt(totales.iva)}</span></div>
            <div className="flex justify-between font-bold text-blue-700 text-base pt-1 border-t border-blue-100"><span>Total</span><span>{fmt(totales.total)}</span></div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={enviarEmail} onChange={e => setEnviarEmail(e.target.checked)}
              disabled={!clienteEmail.trim()} className="w-4 h-4 rounded border-gray-300 accent-blue-600" />
            Enviar por correo apenas se cree {!clienteEmail.trim() && <span className="text-xs text-gray-400">(ingresa un correo)</span>}
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={guardar} disabled={guardando}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Crear cotización'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CotizacionesPage() {
  const { data: cotizaciones, isLoading } = useCotizaciones()
  const eliminar = useEliminarCotizacion()
  const [modalOpen, setModalOpen] = useState(false)
  const [copiadoId, setCopiadoId] = useState<string | null>(null)

  function copiarLink(c: Cotizacion) {
    navigator.clipboard.writeText(urlCotizacion(c.token))
    setCopiadoId(c.id)
    setTimeout(() => setCopiadoId(null), 2000)
  }

  async function borrar(c: Cotizacion) {
    if (!confirm(`¿Eliminar la cotización COT-${String(c.numero).padStart(4, '0')}?`)) return
    await eliminar.mutateAsync(c.id)
  }

  return (
    <div className="px-4 md:px-0">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cotizaciones</h2>
          <p className="text-sm text-gray-500 mt-0.5">Documentos informativos para clientes — sin flujo de aprobación.</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Nueva cotización
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>}

      {!isLoading && (cotizaciones ?? []).length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-600 font-semibold mb-1">Sin cotizaciones todavía</p>
          <p className="text-gray-400 text-sm">Crea la primera para enviarle un link de solo lectura a tu cliente</p>
        </div>
      )}

      {!isLoading && (cotizaciones ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {(cotizaciones ?? []).map(c => {
            const v = vigencia(c)
            return (
              <div key={c.id} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-4 py-3.5">
                <div className="md:w-28 flex-shrink-0">
                  <span className="text-sm font-mono font-semibold text-gray-700">COT-{String(c.numero).padStart(4, '0')}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.cliente_nombre}</p>
                  <p className="text-xs text-gray-400 truncate">{c.equipo || (c.items?.[0]?.nombre ?? '')}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 w-fit ${v.color}`}>{v.label}</span>
                <span className="text-sm font-bold text-gray-900 md:w-28 flex-shrink-0">{fmt(c.total)}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => copiarLink(c)} className="text-xs font-medium text-blue-600 hover:underline">
                    {copiadoId === c.id ? 'Copiado ✓' : 'Copiar link'}
                  </button>
                  <a href={urlCotizacion(c.token)} target="_blank" rel="noreferrer" className="text-xs font-medium text-gray-500 hover:underline">Ver</a>
                  <button onClick={() => borrar(c)} className="text-xs font-medium text-red-500 hover:underline">Eliminar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && <ModalNuevaCotizacion onClose={() => setModalOpen(false)} />}
    </div>
  )
}
