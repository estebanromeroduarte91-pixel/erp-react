import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrdenes, useGuardarOrden, useMsgTemplates, useSeguimientoConfig, useChecklist } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { sendEmail } from '@/lib/email'
import { EstadoBadge } from '@/components/shared/Badge'
import { Money } from '@/components/shared/Money'
import { QrFotosModal } from './QrFotosModal'
import { OrdenModal } from './OrdenModal'
import { totalOrden } from './TallerPage'
import { Spinner } from '@/components/shared/Spinner'
import type { EstadoOrden, Inspeccion, CheckItem } from '@/types'

const PIPELINE: EstadoOrden[] = ['Chequeo', 'Reparación', 'Listo', 'Entregado']

function fmtFecha(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }) }
  catch { return iso }
}

function initials(nombre?: string) {
  return (nombre ?? '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

function rellenarTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

export function OrdenDetallePage() {
  const { num } = useParams<{ num: string }>()
  const navigate = useNavigate()
  const { empresaId } = useAuth()
  const { data: ordenes, isLoading } = useOrdenes()
  const guardar = useGuardarOrden()
  const { data: msgTemplates } = useMsgTemplates()
  const { data: segCfg } = useSeguimientoConfig()

  const { data: checklistTemplate = [] } = useChecklist()

  const [editarOpen, setEditarOpen] = useState(false)
  const [notif, setNotif] = useState<{ estado: EstadoOrden; waMsg: string; emailMsg: string } | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checkItems, setCheckItems] = useState<CheckItem[]>([])
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [emailOk, setEmailOk] = useState(false)

  // Inspección
  const [showInspeccion, setShowInspeccion] = useState(false)
  const [inspecNotas, setInspecNotas] = useState('')
  const [inspecFotos, setInspecFotos] = useState<string[]>([])
  const [showQrInspec, setShowQrInspec] = useState(false)
  const [guardandoInspec, setGuardandoInspec] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const o = ordenes?.find(x => x.num === num)

  // Sync inspección local con la orden cuando cambia
  const inspecRef = useRef<string | null>(null)
  if (o && inspecRef.current !== o.id) {
    inspecRef.current = o.id
    setInspecNotas(o.inspeccion?.notas ?? '')
    setInspecFotos(o.inspeccion?.fotos ?? [])
    // Merge template con estado guardado en la orden
    const saved = o.checkIngreso ?? []
    const merged: CheckItem[] = checklistTemplate.map(label => ({
      label,
      checked: saved.find(s => s.label === label)?.checked ?? false,
    }))
    setCheckItems(merged.length ? merged : saved)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-full py-24">
      <Spinner className="w-8 h-8" />
    </div>
  )
  if (!o) return (
    <div className="flex flex-col items-center justify-center h-full py-24 gap-3">
      <p className="text-gray-500">Orden no encontrada</p>
      <button onClick={() => navigate('/taller')} className="text-sm text-blue-600 hover:underline">← Volver al taller</button>
    </div>
  )

  const total = totalOrden(o)
  const pipelineIdx = PIPELINE.indexOf(o.status as EstadoOrden)

  // Everything below uses `o` only after the early-return guards above
  const orden = o! // safe: early returns above guarantee o is defined here during render

  function buildVars() {
    return {
      nombre: orden.nombre ?? '', modelo: orden.modelo ?? '', orden: orden.num,
      sucursal: segCfg?.nombreTaller ?? '', horario: segCfg?.horario ?? '',
      presupuesto: String(orden.presup ?? ''), trabajo: orden.trabajo ?? '',
      link: '', fecha_estimada: orden.fechaEstimada ?? '',
    }
  }

  async function cambiarEstado(estado: EstadoOrden) {
    if (orden.status === estado) return
    const actualizadas = (ordenes ?? []).map(x => x.id === orden.id ? { ...x, status: estado } : x)
    await guardar.mutateAsync(actualizadas)
    const vars = buildVars()
    const keyWa = (estado === 'Listo' || estado === 'Entregado') ? 'listo_wa' : null
    const keyEmail = (estado === 'Listo' || estado === 'Entregado') ? 'listo_email' : null
    const waMsg = keyWa && msgTemplates?.[keyWa] ? rellenarTemplate(msgTemplates[keyWa]!, vars) : ''
    const emailMsg = keyEmail && msgTemplates?.[keyEmail] ? rellenarTemplate(msgTemplates[keyEmail]!, vars) : ''
    if (waMsg || emailMsg) setNotif({ estado, waMsg, emailMsg })
  }

  async function enviarEmail() {
    if (!notif?.emailMsg || !orden.email || !empresaId) return
    setEnviandoEmail(true)
    const html = notif.emailMsg.replace(/\n/g, '<br>')
    const asunto = notif.estado === 'Listo' ? `Tu equipo está listo — Orden #${orden.num}` : `Orden #${orden.num} entregada`
    await sendEmail(empresaId, orden.email, asunto, html)
    setEnviandoEmail(false)
    setEmailOk(true)
  }

  function enviarWhatsApp() {
    if (!notif?.waMsg || !orden.tel) return
    window.open(`https://wa.me/${orden.tel.replace(/\D/g, '')}?text=${encodeURIComponent(notif.waMsg)}`, '_blank')
  }

  function handleFotosInspec(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 6 - inspecFotos.length)
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setInspecFotos(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  async function guardarChecklist() {
    const actualizadas = (ordenes ?? []).map(x => x.id === orden.id ? { ...x, checkIngreso: checkItems } : x)
    await guardar.mutateAsync(actualizadas)
    setChecklistOpen(false)
  }

  async function guardarInspeccion() {
    setGuardandoInspec(true)
    const inspeccion: Inspeccion = { fotos: inspecFotos, notas: inspecNotas, fecha: new Date().toISOString() }
    const actualizadas = (ordenes ?? []).map(x => x.id === orden.id ? { ...x, inspeccion } : x)
    await guardar.mutateAsync(actualizadas)
    setGuardandoInspec(false)
    setShowInspeccion(false)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Topbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/taller')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver al taller
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-700">Orden #{o.num}</span>
        </div>
        <div className="flex items-center gap-3">
          <EstadoBadge estado={o.status} />
          {total > 0 && <span className="text-sm font-semibold text-gray-800"><Money value={total} /></span>}
          <button onClick={() => setEditarOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Editar
          </button>
        </div>
      </div>

      {/* 3 columnas */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Col 1: Cliente + Equipo + Trabajo ── */}
        <div className="w-80 flex-shrink-0 border-r border-gray-100 overflow-y-auto p-5 space-y-5">
          {/* Cliente */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Cliente</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {initials(o.nombre)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{o.nombre || '—'}</p>
                {o.rut && <p className="text-xs text-gray-400 mt-0.5">RUT: {o.rut}</p>}
                {o.tel && (
                  <a href={`tel:${o.tel}`} className="text-xs text-blue-600 font-semibold hover:underline block mt-1">{o.tel}</a>
                )}
                {o.email && <p className="text-xs text-gray-500 mt-0.5 truncate">{o.email}</p>}
              </div>
              {o.tel && (
                <a href={`https://wa.me/${o.tel.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                  className="w-7 h-7 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center hover:bg-green-100 transition flex-shrink-0" title="WhatsApp">
                  <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          {/* Equipo */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Equipo</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="font-semibold text-gray-900 text-sm">{o.modelo || '—'}</p>
              {o.color && <p className="text-xs text-gray-500 mt-0.5">{o.color}</p>}
              {o.serie && <p className="text-xs text-gray-400 mt-1">S/N: {o.serie}</p>}
              {o.pin && (
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  PIN: {o.pin}
                </p>
              )}
            </div>
          </div>

          {/* Trabajo */}
          {o.trabajo && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Trabajo a realizar</p>
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 leading-relaxed">{o.trabajo}</p>
            </div>
          )}

          {/* Estado físico */}
          {o.estadoFisico && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Estado físico</p>
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 leading-relaxed">{o.estadoFisico}</p>
            </div>
          )}

          {/* Repuestos */}
          {o.repuestos && o.repuestos.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Repuestos</p>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                {o.repuestos.map((r, i) => (
                  <div key={r.productId ?? i} className="flex items-center justify-between px-3 py-2 text-xs border-b border-gray-50 last:border-0">
                    <span className="text-gray-700">{r.name}</span>
                    <span className="text-gray-500">{r.qty ?? 1} × <Money value={r.precio} /></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {fmtFecha(o.fecha)}
          </p>
        </div>

        {/* ── Col 2: Checklist + Inspección + Fotos ── */}
        <div className="flex-1 border-r border-gray-100 overflow-y-auto p-5 space-y-5">

          {/* Checklist de ingreso */}
          {checkItems.length > 0 && (() => {
            const total = checkItems.length
            const done = checkItems.filter(c => c.checked).length
            const ninguno = done === 0
            const todos = done === total
            return (
              <div>
                <button
                  onClick={() => setChecklistOpen(v => !v)}
                  className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">Checklist de ingreso</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {ninguno ? (
                      <span className="flex items-center gap-1 bg-red-100 text-red-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        Sin completar
                      </span>
                    ) : todos ? (
                      <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Completo
                      </span>
                    ) : (
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{done}/{total}</span>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${checklistOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {checklistOpen && (
                  <div className="border border-gray-200 border-t-0 rounded-b-xl bg-white divide-y divide-gray-50">
                    {checkItems.map((item, i) => (
                      <label key={i} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition">
                        <div
                          onClick={() => setCheckItems(prev => prev.map((c, j) => j === i ? { ...c, checked: !c.checked } : c))}
                          className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition ${
                            item.checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                          }`}
                        >
                          {item.checked && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm flex-1 ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden mr-3">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 mr-3">{done}/{total}</span>
                      <button
                        onClick={guardarChecklist}
                        disabled={guardar.isPending}
                        className="text-xs font-semibold text-white bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Inspección */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Inspección del equipo</p>
              <button onClick={() => setShowInspeccion(v => !v)}
                className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-50 transition">
                {showInspeccion ? 'Cerrar' : o.inspeccion ? 'Editar' : '+ Agregar'}
              </button>
            </div>

            {!showInspeccion && o.inspeccion && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                {o.inspeccion.notas && <p className="text-sm text-gray-700 leading-relaxed">{o.inspeccion.notas}</p>}
                {o.inspeccion.fecha && <p className="text-[11px] text-gray-400">{fmtFecha(o.inspeccion.fecha)}</p>}
                {o.inspeccion.fotos && o.inspeccion.fotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {o.inspeccion.fotos.map((src, i) => (
                      <a key={i} href={src} target="_blank" rel="noreferrer">
                        <div className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!showInspeccion && !o.inspeccion && (
              <div className="border border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 text-gray-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm">Sin inspección registrada</p>
              </div>
            )}

            {showInspeccion && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <textarea value={inspecNotas} onChange={e => setInspecNotas(e.target.value)}
                  placeholder="Notas de la inspección: fallas encontradas, diagnóstico..." rows={4}
                  autoCapitalize="sentences"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">Fotos ({inspecFotos.length}/6)</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShowQrInspec(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-100 transition">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM17 17v3M14 17h.01" />
                      </svg>
                      QR iPhone
                    </button>
                    {inspecFotos.length < 6 && (
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition">
                        + Fotos
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFotosInspec} />
                </div>
                {inspecFotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {inspecFotos.map((src, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setInspecFotos(f => f.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowInspeccion(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
                  <button onClick={guardarInspeccion} disabled={guardandoInspec}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                    {guardandoInspec ? 'Guardando…' : 'Guardar inspección'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fotos de ingreso */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
              Fotos de ingreso {o.photosIngreso && o.photosIngreso.length > 0 && `(${o.photosIngreso.length})`}
            </p>
            {o.photosIngreso && o.photosIngreso.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {o.photosIngreso.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer">
                    <div className="aspect-square rounded-xl overflow-hidden border border-gray-200">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2 text-gray-400">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Sin fotos de ingreso</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Col 3: Pipeline + Acciones ── */}
        <div className="w-64 flex-shrink-0 flex flex-col overflow-y-auto p-5 gap-5">
          {/* Pipeline vertical */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Estado</p>
            <div className="flex flex-col gap-1.5">
              {PIPELINE.map((s, i) => {
                const done = i < pipelineIdx
                const active = i === pipelineIdx
                return (
                  <button key={s} onClick={() => cambiarEstado(s)}
                    className={['flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm transition',
                      active ? 'bg-blue-600 text-white font-semibold' :
                      done   ? 'bg-blue-100 text-blue-700' :
                               'bg-gray-50 text-gray-400 hover:bg-gray-100',
                    ].join(' ')}>
                    <span className={['w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-[10px]',
                      active ? 'border-white bg-white/30' :
                      done   ? 'border-blue-400 bg-blue-400' :
                               'border-gray-300',
                    ].join(' ')}>
                      {done && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Técnico + fecha */}
          {(o.tecnico || o.fechaEstimada) && (
            <div className="space-y-3">
              {o.tecnico && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Técnico</p>
                  <p className="text-sm text-gray-700">{o.tecnico}</p>
                </div>
              )}
              {o.fechaEstimada && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Entrega estimada</p>
                  <p className="text-sm text-gray-700">{fmtFecha(o.fechaEstimada)}</p>
                </div>
              )}
            </div>
          )}

          {/* Notificaciones */}
          <div className="mt-auto space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notificar cliente</p>
            {o.tel ? (
              <a href={`https://wa.me/${o.tel.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-green-50 border border-green-200 hover:bg-green-100 transition text-sm font-medium text-green-800">
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-400">Sin teléfono</div>
            )}
            {o.email ? (
              <button onClick={() => {
                if (!o.email || !empresaId) return
                void sendEmail(empresaId, o.email, `Orden #${o.num} — ${o.status}`, `<p>Hola ${o.nombre}, te informamos sobre tu orden #${o.num}.</p>`)
              }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition text-sm font-medium text-blue-800">
                <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Enviar email
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-400">Sin email</div>
            )}
            <button onClick={() => setEditarOpen(true)}
              className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition mt-2">
              Editar orden
            </button>
          </div>
        </div>
      </div>

      {/* Modal notificación al cambiar estado */}
      {notif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Orden movida a <span className="text-blue-600">{notif.estado}</span></h3>
              <p className="text-xs text-gray-400 mt-0.5">¿Notificar al cliente?</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {notif.waMsg && o.tel && (
                <button onClick={enviarWhatsApp}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200 hover:bg-green-100 transition text-left">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-green-800">Enviar por WhatsApp</div>
                    <div className="text-xs text-green-600">{o.tel}</div>
                  </div>
                </button>
              )}
              {notif.emailMsg && o.email && (
                <button onClick={enviarEmail} disabled={enviandoEmail || emailOk}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition text-left disabled:opacity-60">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-blue-800">
                      {emailOk ? '✓ Email enviado' : enviandoEmail ? 'Enviando…' : 'Enviar por email'}
                    </div>
                    <div className="text-xs text-blue-600">{o.email}</div>
                  </div>
                </button>
              )}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setNotif(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {editarOpen && (
        <OrdenModal
          orden={o}
          ordenes={ordenes ?? []}
          onClose={() => setEditarOpen(false)}
        />
      )}

      {/* QR inspección */}
      {showQrInspec && o.id && (
        <QrFotosModal ordenId={o.id} tipo="inspeccion" onClose={() => setShowQrInspec(false)} />
      )}
    </div>
  )
}
