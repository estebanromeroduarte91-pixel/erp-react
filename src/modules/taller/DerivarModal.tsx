import { useState, useMemo } from 'react'
import { useTraslados, useGuardarTraslados, useTecnicosExternos, useGuardarTecnicosExternos } from '@/lib/queries'
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
    condicion: existente?.condicion ?? 'enciende',
    precio_acordado: String(existente?.precio_acordado ?? ''),
    estado: (existente?.estado ?? 'enviado') as EstadoTraslado,
    fecha_envio: existente?.fecha_envio ?? hoy(),
    fecha_retorno_est: existente?.fecha_retorno_est ?? '',
    motivo: existente?.motivo ?? '',
    notas: existente?.notas ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const [showNuevoTec, setShowNuevoTec] = useState(false)
  const [nuevoTec, setNuevoTec] = useState({ nombre: '', telefono: '' })

  const set = (field: keyof typeof form, val: string) => setForm(f => ({ ...f, [field]: val }))

  function seleccionarTecnico(t: TecnicoExterno) {
    setForm(f => ({ ...f, tecnico: t.nombre, tecnico_tel: t.telefono ?? '' }))
  }

  async function agregarTecnico() {
    if (!nuevoTec.nombre.trim()) return
    const t: TecnicoExterno = { id: Date.now().toString(), nombre: nuevoTec.nombre.trim(), telefono: nuevoTec.telefono.trim() }
    await guardarTecnicos.mutateAsync([...tecnicos, t])
    seleccionarTecnico(t)
    setNuevoTec({ nombre: '', telefono: '' })
    setShowNuevoTec(false)
  }

  async function handleGuardar() {
    if (!form.equipo.trim() || !form.tecnico.trim()) return
    setGuardando(true)
    const precio = form.precio_acordado ? Number(form.precio_acordado) : undefined
    if (existente) {
      const updated = traslados.map(t => t.id === existente.id
        ? {
            ...t,
            equipo: form.equipo, cliente: form.cliente, order_id: orden.id,
            tecnico: form.tecnico, tecnico_tel: form.tecnico_tel,
            condicion: form.condicion, precio_acordado: precio, estado: form.estado,
            fecha_envio: form.fecha_envio, fecha_retorno_est: form.fecha_retorno_est,
            motivo: form.motivo, notas: form.notas,
          }
        : t)
      await guardar.mutateAsync(updated)
    } else {
      const nuevo: Traslado = {
        id: Date.now().toString(),
        numero: nextNumero(traslados),
        equipo: form.equipo, cliente: form.cliente, order_id: orden.id,
        tecnico: form.tecnico, tecnico_tel: form.tecnico_tel,
        condicion: form.condicion, precio_acordado: precio, estado: form.estado,
        fecha_envio: form.fecha_envio, fecha_retorno_est: form.fecha_retorno_est,
        motivo: form.motivo, notas: form.notas,
      }
      await guardar.mutateAsync([...traslados, nuevo])
    }
    setGuardando(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">{existente ? 'Editar derivación' : 'Derivar a técnico externo'}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{form.equipo}{form.cliente ? ` · ${form.cliente}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {/* Técnico externo */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Técnico externo *</p>
              <button onClick={() => setShowNuevoTec(v => !v)}
                className="text-[11px] font-semibold text-blue-600 border border-blue-200 rounded-lg px-2 py-0.5 hover:bg-blue-50 transition">
                {showNuevoTec ? 'Cancelar' : '+ Nuevo técnico'}
              </button>
            </div>

            {showNuevoTec && (
              <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-3 mb-3 space-y-2">
                <input value={nuevoTec.nombre} onChange={e => setNuevoTec({ ...nuevoTec, nombre: e.target.value })}
                  placeholder="Nombre / empresa"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400" />
                <div className="flex gap-2">
                  <input value={nuevoTec.telefono} onChange={e => setNuevoTec({ ...nuevoTec, telefono: e.target.value })}
                    placeholder="+56 9 XXXX XXXX"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400" />
                  <button onClick={agregarTecnico} disabled={!nuevoTec.nombre.trim()}
                    className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {tecnicos.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {tecnicos.map(t => (
                  <button key={t.id} onClick={() => seleccionarTecnico(t)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition ${form.tecnico === t.nombre ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}>
                    {t.nombre}
                    {t.telefono && <span className="text-gray-400 ml-1">{t.telefono}</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre del técnico</label>
                <input value={form.tecnico} onChange={e => set('tecnico', e.target.value)} placeholder="Nombre"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Teléfono</label>
                <input value={form.tecnico_tel} onChange={e => set('tecnico_tel', e.target.value)} placeholder="+56 9 XXXX XXXX"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
          </div>

          {/* Detalle de la derivación */}
          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Equipo / descripción *</label>
              <input value={form.equipo} onChange={e => set('equipo', e.target.value)} placeholder="Ej: iPhone X negro"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Condición al enviar</label>
              <select value={form.condicion} onChange={e => set('condicion', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                <option value="enciende">Enciende</option>
                <option value="apagado">Apagado</option>
                <option value="regular">Regular</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Precio acordado ($)</label>
              <input type="number" value={form.precio_acordado} onChange={e => set('precio_acordado', e.target.value)} placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha de envío</label>
              <input type="date" value={form.fecha_envio} onChange={e => set('fecha_envio', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Retorno estimado</label>
              <input type="date" value={form.fecha_retorno_est} onChange={e => set('fecha_retorno_est', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            {existente && (
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Estado</label>
                <select value={form.estado} onChange={e => set('estado', e.target.value as EstadoTraslado)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                  {(Object.entries(ESTADO_LABEL) as [EstadoTraslado, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Motivo / trabajo a realizar</label>
              <textarea value={form.motivo} onChange={e => set('motivo', e.target.value)} rows={2}
                placeholder="Qué falla tiene y qué se espera del técnico…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Notas adicionales</label>
              <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2}
                placeholder="Accesorios incluidos, observaciones…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando || !form.equipo.trim() || !form.tecnico.trim()}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Derivar equipo'}
          </button>
        </div>
      </div>
    </div>
  )
}
