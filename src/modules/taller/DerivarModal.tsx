import { useState, useMemo, useEffect } from 'react'
import { useTraslados, useGuardarTraslados, useTecnicosExternos, useGuardarTecnicosExternos } from '@/lib/queries'
import { QrFotosModal } from './QrFotosModal'
import type { Orden, Traslado, TecnicoExterno, EstadoTraslado } from '@/types'

const ESTADO_LABEL: Record<EstadoTraslado, string> = {
  'enviado': 'Enviado',
  'en-revision': 'En revisión',
  'listo': 'Listo para retirar',
  'con-problema': 'Con problema',
  'retornado': 'Retornado',
}

function hoy(): string {
  return new Date().toISOString().split('T')[0]
}

function nextNumero(traslados: Traslado[]): number {
  return traslados.reduce((max, t) => Math.max(max, t.numero || 0), 0) + 1
}

// Modal de derivación abierto desde el detalle de una orden.
// Replica tp_derivarOrden del ERP vanilla: pre-llena equipo/cliente desde la orden,
// y si ya existe un traslado activo para esa orden lo abre en modo edición.
export function DerivarModal({ orden, onClose }: { orden: Orden; onClose: () => void }) {
  const { data: traslados = [] } = useTraslados()
  const guardar = useGuardarTraslados()
  const { data: tecnicos = [] } = useTecnicosExternos()
  const guardarTecnicos = useGuardarTecnicosExternos()

  // Traslado activo existente para esta orden (no retornado)
  const existente = useMemo(
    () => traslados.find(t => t.order_id === orden.id && t.estado !== 'retornado'),
    [traslados, orden.id],
  )

  const equipoPrefill = [orden.modelo, orden.color].filter(Boolean).join(' · ') + (orden.serie ? ` · Serie: ${orden.serie}` : '')

  const [form, setForm] = useState({
    equipo: existente?.equipo ?? equipoPrefill,
    cliente: existente?.cliente ?? orden.nombre ?? '',
    tecnico: existente?.tecnico ?? '',
    tecnico_tel: existente?.tecnico_tel ?? '',
    tecnico_ext_id: existente?.tecnico_ext_id ?? '',
    condicion: existente?.condicion ?? 'enciende',
    precio_acordado: String(existente?.precio_acordado ?? ''),
    estado: (existente?.estado ?? 'enviado') as EstadoTraslado,
    fecha_envio: existente?.fecha_envio ?? hoy(),
    fecha_retorno_est: existente?.fecha_retorno_est ?? '',
    motivo: existente?.motivo ?? '',
    notas: existente?.notas ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [showNuevoTec, setShowNuevoTec] = useState(false)
  const [nuevoTec, setNuevoTec] = useState({ nombre: '', telefono: '', notas: '' })
  const [showQr, setShowQr] = useState(false)

  // Evidencia fotográfica: fotos guardadas del traslado + fotos que llegaron por QR (orden.photosTraslado)
  const [fotos, setFotos] = useState<string[]>(() => [...new Set([...(existente?.fotos ?? []), ...(orden.photosTraslado ?? [])])])

  // Cuando llegan fotos por QR a la orden, sumarlas al buffer sin duplicar
  useEffect(() => {
    const qr = orden.photosTraslado ?? []
    if (qr.length) setFotos(prev => [...new Set([...prev, ...qr])])
  }, [orden.photosTraslado])

  const set = (field: keyof typeof form, val: string) => setForm(f => ({ ...f, [field]: val }))

  const tecnicoSel = tecnicos.find(t => t.id === form.tecnico_ext_id)
  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return tecnicos.filter(t =>
      t.nombre.toLowerCase().includes(q) || (t.notas ?? '').toLowerCase().includes(q),
    ).slice(0, 6)
  }, [tecnicos, busqueda])

  function seleccionarTecnico(t: TecnicoExterno) {
    setForm(f => ({ ...f, tecnico: t.nombre, tecnico_tel: t.telefono ?? '', tecnico_ext_id: t.id }))
    setBusqueda('')
  }

  function deseleccionarTecnico() {
    setForm(f => ({ ...f, tecnico: '', tecnico_tel: '', tecnico_ext_id: '' }))
  }

  async function agregarTecnico() {
    if (!nuevoTec.nombre.trim()) return
    const t: TecnicoExterno = {
      id: Date.now().toString(),
      nombre: nuevoTec.nombre.trim(),
      telefono: nuevoTec.telefono.trim(),
      notas: nuevoTec.notas.trim(),
    }
    await guardarTecnicos.mutateAsync([...tecnicos, t])
    seleccionarTecnico(t)
    setNuevoTec({ nombre: '', telefono: '', notas: '' })
    setShowNuevoTec(false)
  }

  function handleFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setFotos(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  async function handleGuardar() {
    if (!form.equipo.trim() || !form.tecnico.trim()) return
    setGuardando(true)
    const precio = form.precio_acordado ? Number(form.precio_acordado) : undefined
    const base = {
      equipo: form.equipo, cliente: form.cliente, order_id: orden.id,
      tecnico: form.tecnico, tecnico_tel: form.tecnico_tel, tecnico_ext_id: form.tecnico_ext_id || undefined,
      condicion: form.condicion, precio_acordado: precio, estado: form.estado,
      fecha_envio: form.fecha_envio, fecha_retorno_est: form.fecha_retorno_est,
      motivo: form.motivo, notas: form.notas, fotos,
    }
    if (existente) {
      const updated = traslados.map(t => t.id === existente.id ? { ...t, ...base } : t)
      await guardar.mutateAsync(updated)
    } else {
      const nuevo: Traslado = { id: Date.now().toString(), numero: nextNumero(traslados), ...base }
      await guardar.mutateAsync([...traslados, nuevo])
    }
    setGuardando(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">{existente ? 'Editar traslado' : 'Registrar traslado'}</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{form.equipo}{form.cliente ? ` · ${form.cliente}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto">
          {/* ── SECCIÓN 1: Técnico externo ── */}
          <div className="px-6 py-4 border-b-2 border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-[22px] h-[22px] rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">1</span>
                <span className="text-[13px] font-bold text-gray-900">Técnico externo</span>
              </div>
              <button onClick={() => setShowNuevoTec(v => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 border-[1.5px] border-blue-500 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 5v14M5 12h14"/></svg>
                Nuevo técnico
              </button>
            </div>

            {/* Form nuevo técnico */}
            {showNuevoTec && (
              <div className="border-[1.5px] border-blue-400 bg-blue-50/40 rounded-xl p-3.5 mb-3 space-y-2.5">
                <p className="text-[11px] font-bold text-blue-600 tracking-wide">AGREGAR TÉCNICO AL CATÁLOGO</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <input value={nuevoTec.nombre} onChange={e => setNuevoTec({ ...nuevoTec, nombre: e.target.value })}
                    placeholder="Nombre / empresa *"
                    className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-white focus:outline-none focus:border-blue-400" />
                  <input value={nuevoTec.telefono} onChange={e => setNuevoTec({ ...nuevoTec, telefono: e.target.value })}
                    placeholder="+56 9 XXXX XXXX"
                    className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-white focus:outline-none focus:border-blue-400" />
                  <input value={nuevoTec.notas} onChange={e => setNuevoTec({ ...nuevoTec, notas: e.target.value })}
                    placeholder="Notas (especialidad, dirección…)"
                    className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-white focus:outline-none focus:border-blue-400" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowNuevoTec(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
                  <button onClick={agregarTecnico} disabled={!nuevoTec.nombre.trim()}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">Guardar técnico</button>
                </div>
              </div>
            )}

            {tecnicoSel || form.tecnico ? (
              /* Chip técnico seleccionado */
              <div className="flex items-center gap-3 px-3 py-2.5 border-[1.5px] border-blue-400 rounded-xl bg-blue-50/60">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {(form.tecnico || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 truncate">{form.tecnico}</p>
                  <p className="text-[11px] text-gray-400 truncate">{[form.tecnico_tel, tecnicoSel?.notas].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <button onClick={deseleccionarTecnico} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Cambiar técnico">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            ) : (
              /* Buscador */
              <div>
                <div className="flex items-center border-[1.5px] border-gray-200 rounded-lg overflow-hidden h-[38px] focus-within:border-blue-400 transition">
                  <span className="px-2.5 text-gray-400 flex items-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  </span>
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus
                    placeholder="Buscar técnico por nombre o empresa…"
                    className="flex-1 text-base md:text-sm outline-none pr-3 bg-transparent" />
                </div>
                {resultados.length > 0 && (
                  <div className="border border-gray-200 rounded-lg mt-2 overflow-hidden divide-y divide-gray-50">
                    {resultados.map(t => (
                      <button key={t.id} onClick={() => seleccionarTecnico(t)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition text-left">
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {t.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{t.nombre}</p>
                          {(t.telefono || t.notas) && <p className="text-[11px] text-gray-400 truncate">{[t.telefono, t.notas].filter(Boolean).join(' · ')}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {busqueda.trim() && resultados.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2 mt-1">Sin resultados · usa "+ Nuevo técnico"</p>
                )}
              </div>
            )}
          </div>

          {/* ── SECCIÓN 2: Detalle de la derivación ── */}
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-[22px] h-[22px] rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">2</span>
              <span className="text-[13px] font-bold text-gray-900">Detalle de la derivación</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Equipo / descripción *</label>
                <input value={form.equipo} onChange={e => set('equipo', e.target.value)} placeholder="Ej: iPhone X negro"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Condición al enviar</label>
                <select value={form.condicion} onChange={e => set('condicion', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                  <option value="enciende">Equipo enciende</option>
                  <option value="apagado">Equipo apagado</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Precio acordado ($)</label>
                <input type="number" value={form.precio_acordado} onChange={e => set('precio_acordado', e.target.value)} placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha de envío</label>
                <input type="date" value={form.fecha_envio} onChange={e => set('fecha_envio', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Retorno estimado</label>
                <input type="date" value={form.fecha_retorno_est} onChange={e => set('fecha_retorno_est', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              {existente && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Estado</label>
                  <select value={form.estado} onChange={e => set('estado', e.target.value as EstadoTraslado)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                    {(Object.entries(ESTADO_LABEL) as [EstadoTraslado, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Motivo del traslado</label>
                <textarea value={form.motivo} onChange={e => set('motivo', e.target.value)} rows={2}
                  placeholder="Qué falla tiene y qué se espera del técnico…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
              </div>

              {/* Evidencia fotográfica */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600">Evidencia fotográfica al enviar</label>
                  <button type="button" onClick={() => setShowQr(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-100 transition">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM17 17v3M14 17h.01" />
                    </svg>
                    QR iPhone
                  </button>
                </div>
                {fotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {fotos.map((src, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setFotos(f => f.filter((_, j) => j !== i))}
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 text-white rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="flex items-center justify-center gap-1.5 border-[1.5px] border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 cursor-pointer hover:border-blue-300 hover:text-blue-500 transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/>
                  </svg>
                  Agregar fotos de evidencia
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleFotos} />
                </label>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notas adicionales</label>
                <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2}
                  placeholder="Accesorios incluidos, observaciones…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando || !form.equipo.trim() || !form.tecnico.trim()}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Guardar traslado'}
          </button>
        </div>
      </div>

      {/* QR fotos de traslado */}
      {showQr && (
        <QrFotosModal ordenId={orden.id} tipo="traslado" onClose={() => setShowQr(false)} />
      )}
    </div>
  )
}
