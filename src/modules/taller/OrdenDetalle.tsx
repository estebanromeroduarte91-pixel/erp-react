import { useState, useRef, useEffect } from 'react'
import { useGuardarOrden, useMsgTemplates, useSeguimientoConfig, useBodegas } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { sendEmail, buildEmailListo, buildEmailInspeccion, buildEmailAprobacion } from '@/lib/email'
import { EstadoBadge } from '@/components/shared/Badge'
import { Money } from '@/components/shared/Money'
import { QrFotosModal } from './QrFotosModal'
import { totalOrden } from './utils'
import type { Orden, EstadoOrden, Inspeccion } from '@/types'

const PIPELINE: EstadoOrden[] = ['Chequeo', 'Reparación', 'Listo', 'Entregado']

const ALL_DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
const LBL_DIAS: Record<string, string> = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' }
function fmtBloque(b: { dias?: string[]; desde?: string; hasta?: string }): string {
  const idx = (b.dias ?? []).filter(d => ALL_DIAS.includes(d)).map(d => ALL_DIAS.indexOf(d)).sort((a, z) => a - z)
  let dStr = ''
  if (idx.length) {
    const consec = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
    dStr = consec && idx.length > 2
      ? `${LBL_DIAS[ALL_DIAS[idx[0]]]}–${LBL_DIAS[ALL_DIAS[idx[idx.length - 1]]]}`
      : idx.map(i => LBL_DIAS[ALL_DIAS[i]]).join(', ')
  }
  const tStr = b.desde && b.hasta ? `${b.desde}–${b.hasta}` : b.desde || b.hasta || ''
  return [dStr, tStr].filter(Boolean).join(' ')
}
function formatHorario(h: unknown): string {
  if (!h) return ''
  if (typeof h === 'string') return h
  const obj = h as { bloques?: Array<{ dias?: string[]; desde?: string; hasta?: string }> }
  if (Array.isArray(obj.bloques)) return obj.bloques.map(fmtBloque).filter(Boolean).join(' / ')
  return fmtBloque(obj as { dias?: string[]; desde?: string; hasta?: string })
}

interface Props {
  orden: Orden
  ordenes: Orden[]
  onClose: () => void
  onEditar: (o: Orden) => void
}

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return iso }
}

function initials(nombre: string) {
  return nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function rellenarTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

export function OrdenDetalle({ orden: o, ordenes, onClose, onEditar }: Props) {
  const { empresaId } = useAuth()
  const guardar = useGuardarOrden()
  const { data: msgTemplates } = useMsgTemplates()
  const { data: segCfg } = useSeguimientoConfig()
  const { data: bodegas = [] } = useBodegas()

  const [notifEstado, setNotifEstado] = useState<{ estado: EstadoOrden; waMsg: string; emailMsg: string } | null>(null)
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [emailOk, setEmailOk] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Aprobación
  const [showAprobacion, setShowAprobacion] = useState(false)
  const [enviandoAprob, setEnviandoAprob] = useState(false)
  const [aprobMsgEmail, setAprobMsgEmail] = useState('')
  const [aprobMsgWa, setAprobMsgWa] = useState('')

  // Inspección
  const [showInspeccion, setShowInspeccion] = useState(false)
  const [inspecNotas, setInspecNotas] = useState(o.inspeccion?.notas ?? '')
  const [inspecFotos, setInspecFotos] = useState<string[]>(o.inspeccion?.fotos ?? [])
  const [showQrInspec, setShowQrInspec] = useState(false)
  const [guardandoInspec, setGuardandoInspec] = useState(false)
  const [reenviarOpen, setReenviarOpen] = useState(false)
  const fileInspecRef = useRef<HTMLInputElement>(null)
  const reenviarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reenviarOpen) return
    function handleClick(e: MouseEvent) {
      if (reenviarRef.current && !reenviarRef.current.contains(e.target as Node)) setReenviarOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [reenviarOpen])

  const total = totalOrden(o)
  const pipelineIdx = PIPELINE.indexOf(o.status as EstadoOrden)

  // Sincronizar fotos de inspección cuando el QR (página Netlify) escribe a la DB vía realtime
  useEffect(() => {
    if (!showInspeccion) {
      setInspecFotos(o.inspeccion?.fotos ?? [])
      setInspecNotas(o.inspeccion?.notas ?? '')
    }
  }, [o.inspeccion?.fotos, o.inspeccion?.notas]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling: detectar cuando el cliente aprueba/rechaza el presupuesto
  useEffect(() => {
    if (o.aprobacion_estado !== 'pendiente' || !o.aprobacion_token || !empresaId) return
    const check = async () => {
      const { data } = await supabase
        .from('aprobaciones')
        .select('estado, aprobado_en')
        .eq('token', o.aprobacion_token!)
        .neq('estado', 'pendiente')
        .maybeSingle()
      if (data) {
        const actualizadas = ordenes.map(x => x.id === o.id
          ? { ...x, aprobacion_estado: data.estado as 'aprobado' | 'rechazado', aprobacion_fecha: data.aprobado_en }
          : x)
        await guardar.mutateAsync(actualizadas)
      }
    }
    const interval = setInterval(check, 15000)
    return () => clearInterval(interval)
  }, [o.aprobacion_estado, o.aprobacion_token, empresaId])

  const branch = bodegas.find(b => b.id === o.branchId)
  const branchNombre = branch?.nombre ?? branch?.name ?? segCfg?.nombreTaller ?? ''
  const branchHorario = formatHorario(branch?.horario) || formatHorario(segCfg?.horario) || ''
  const branchDir = branch?.direccion ?? ''
  const branchTel = branch?.tel ?? ''
  const branchEmail = branch?.email ?? ''

  function buildVars(num: string | number) {
    return {
      nombre: o.nombre ?? '',
      modelo: o.modelo ?? '',
      orden: String(num),
      sucursal: branchNombre,
      horario: branchHorario,
      presupuesto: String(o.presup ?? ''),
      trabajo: o.trabajo ?? '',
      link: '',
      fecha_estimada: o.fechaEstimada ?? '',
    }
  }

  async function cambiarEstado(estado: EstadoOrden) {
    if (o.status === estado) return
    const actualizadas = ordenes.map(x => x.id === o.id ? { ...x, status: estado, subestado: undefined } : x)
    await guardar.mutateAsync(actualizadas)

    const vars = buildVars(o.num)
    const esListo = estado === 'Listo' || estado === 'Entregado'
    const waMsg = esListo && msgTemplates?.listo_wa ? rellenarTemplate(msgTemplates.listo_wa, vars) : ''
    const emailMsg = esListo && msgTemplates?.listo_email ? rellenarTemplate(msgTemplates.listo_email, vars) : ''

    // Envío automático de email al poner Listo
    if (esListo && emailMsg && o.email && empresaId) {
      const html = buildEmailListo({
        tallerNombre: segCfg?.nombreTaller ?? 'TallerPro',
        logoUrl: segCfg?.logoUrl,
        msgTexto: emailMsg,
        orden: { num: o.num, modelo: o.modelo ?? '', nombre: o.nombre ?? '' },
        branchNombre,
        horario: branchHorario,
      })
      const asunto = estado === 'Listo'
        ? `Tu ${o.modelo} está listo para retirar — #OT-${String(o.num).padStart(4, '0')}`
        : `Orden #OT-${String(o.num).padStart(4, '0')} entregada`
      void sendEmail(empresaId, o.email, asunto, html)
      setEmailOk(true)
    }

    // Popup solo para WA (o si no hay email configurado, también muestra opción email)
    const mostrarEmail = esListo && emailMsg && o.email && !empresaId
    if (waMsg || mostrarEmail) {
      setNotifEstado({ estado, waMsg, emailMsg: mostrarEmail ? emailMsg : '' })
    } else {
      onClose()
    }
  }

  async function enviarEmail() {
    if (!notifEstado?.emailMsg || !o.email || !empresaId) return
    setEnviandoEmail(true)
    const html = buildEmailListo({
      tallerNombre: segCfg?.nombreTaller ?? 'TallerPro',
      logoUrl: segCfg?.logoUrl,
      msgTexto: notifEstado.emailMsg,
      orden: { num: o.num, modelo: o.modelo ?? '', nombre: o.nombre ?? '' },
      branchNombre,
      horario: branchHorario,
    })
    const esListo = notifEstado.estado === 'Listo'
    const asunto = esListo
      ? `Tu ${o.modelo} está listo para retirar — #OT-${String(o.num).padStart(4, '0')}`
      : `Orden #OT-${String(o.num).padStart(4, '0')} entregada`
    await sendEmail(empresaId, o.email, asunto, html)
    setEnviandoEmail(false)
    setEmailOk(true)
  }

  function enviarWhatsApp() {
    if (!notifEstado?.waMsg || !o.tel) return
    const tel = o.tel.replace(/\D/g, '')
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(notifEstado.waMsg)}`, '_blank')
  }

  // Aprobación de presupuesto
  const APROB_BASE_URL = 'https://estebanromeroduarte91-pixel.github.io/modulo-compras/aprobar.html'

  function abrirModalAprobacion() {
    const vars = buildVars(o.num)
    const link = o.aprobacion_token && o.aprobacion_estado === 'pendiente'
      ? `${APROB_BASE_URL}?t=${o.aprobacion_token}`
      : '(se generará al enviar)'
    const varsCon = { ...vars, link }
    const tplWa = msgTemplates?.aprobacion_wa ?? ''
    const tplEmail = msgTemplates?.aprobacion_email ?? ''
    setAprobMsgWa(tplWa ? rellenarTemplate(tplWa, varsCon) : '')
    setAprobMsgEmail(tplEmail ? rellenarTemplate(tplEmail, varsCon) : '')
    setShowAprobacion(true)
  }

  async function enviarAprobacion(canal: 'email' | 'wa') {
    if (!empresaId) return
    setEnviandoAprob(true)

    let token = o.aprobacion_token
    if (!token || o.aprobacion_estado !== 'pendiente') {
      token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
      const trabajoData = JSON.stringify({
        v: 2,
        items: (o.repuestos ?? []).map(r => ({ name: r.name, qty: r.qty, precio: r.precio ?? 0 })),
        trabajo: o.trabajo ?? '',
        taller: segCfg?.nombreTaller ?? 'TallerPro',
        sucursal: branchNombre,
        horario: branchHorario,
        tel: branchTel,
        email: branchEmail,
        dir: branchDir,
        logoUrl: segCfg?.logoUrl ?? '',
      })
      const row = {
        token,
        orden_id: o.id,
        empresa_id: empresaId,
        orden_num: String(o.num ?? ''),
        cliente: o.nombre ?? '',
        equipo: o.modelo ?? '',
        trabajo: trabajoData,
        presupuesto: o.presup ?? 0,
        estado: 'pendiente',
      }
      const { error } = await supabase.from('aprobaciones').insert(row)
      if (error) { alert('Error al crear solicitud: ' + error.message); setEnviandoAprob(false); return }
      const actualizadas = ordenes.map(x => x.id === o.id
        ? { ...x, aprobacion_token: token, aprobacion_estado: 'pendiente' as const, aprobacion_enviado: new Date().toISOString().slice(0, 10) }
        : x)
      await guardar.mutateAsync(actualizadas)
    }

    const link = `${APROB_BASE_URL}?t=${token}`
    if (canal === 'wa') {
      const msg = aprobMsgWa.includes('(se generará al enviar)')
        ? aprobMsgWa.replace('(se generará al enviar)', link)
        : aprobMsgWa.replace(/\{\{link\}\}/g, link)
      const tel = (o.tel ?? '').replace(/\D/g, '')
      const telWa = tel.startsWith('56') ? tel : '56' + tel
      window.open(`https://wa.me/${telWa}?text=${encodeURIComponent(msg)}`, '_blank')
    } else {
      const introTexto = aprobMsgEmail.split(/\n\n/)[0] ?? aprobMsgEmail
      const items = o.repuestos ?? []
      const html = buildEmailAprobacion({
        tallerNombre: segCfg?.nombreTaller ?? 'TallerPro',
        logoUrl: segCfg?.logoUrl,
        introTexto,
        orden: { num: o.num, modelo: o.modelo ?? '', nombre: o.nombre ?? '', trabajo: o.trabajo },
        repuestos: items.length ? items : undefined,
        presupuesto: o.presup != null ? Number(o.presup) : undefined,
        link,
      })
      const asunto = `Aprobación de presupuesto — ${o.modelo ?? 'Equipo'} #OT-${String(o.num).padStart(4, '0')}`
      if (o.email) await sendEmail(empresaId, o.email, asunto, html)
    }

    setEnviandoAprob(false)
    setShowAprobacion(false)
  }

  // Inspección: fotos desde archivo
  function handleFotosInspec(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 6 - inspecFotos.length)
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setInspecFotos(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  async function guardarInspeccion(modo: 'solo' | 'correo' | 'whatsapp' = 'solo') {
    setGuardandoInspec(true)
    const inspeccion: Inspeccion = { fotos: inspecFotos, notas: inspecNotas, fecha: new Date().toISOString() }
    const actualizadas = ordenes.map(x => x.id === o.id ? { ...x, inspeccion } : x)
    await guardar.mutateAsync(actualizadas)

    if (modo === 'correo' && o.email && empresaId) {
      const tpl = msgTemplates?.inspeccion_email ?? ''
      const vars = buildVars(o.num)
      const msgTexto = tpl ? rellenarTemplate(tpl, { ...vars, diagnostico: inspecNotas }) : inspecNotas
      const html = buildEmailInspeccion({
        tallerNombre: segCfg?.nombreTaller ?? 'TallerPro',
        logoUrl: segCfg?.logoUrl,
        msgTexto,
        orden: { num: o.num, modelo: o.modelo ?? '', nombre: o.nombre ?? '', serie: o.serie },
        notas: inspecNotas,
        fotos: inspecFotos,
      })
      void sendEmail(empresaId, o.email, `Inspección de equipo — ${o.modelo} #OT-${String(o.num).padStart(4, '0')}`, html)
    }

    if (modo === 'whatsapp' && o.tel) {
      const tpl = msgTemplates?.inspeccion_wa ?? ''
      const vars = buildVars(o.num)
      const msg = tpl
        ? rellenarTemplate(tpl, { ...vars, diagnostico: inspecNotas })
        : `Hola ${o.nombre ?? ''}, te informamos que realizamos la inspección de tu ${o.modelo ?? 'equipo'} (OT #${o.num}).\n\nDiagnóstico:\n${inspecNotas}`
      const tel = o.tel.replace(/\D/g, '')
      const telWa = tel.startsWith('56') ? tel : '56' + tel
      window.open(`https://wa.me/${telWa}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    setGuardandoInspec(false)
    setShowInspeccion(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Modal centrado */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-400">#{o.num}</span>
              <EstadoBadge estado={o.status} />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onEditar(o)}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Editar
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Nombre + precio */}
            <div>
              <h2 className="text-xl font-bold text-gray-900">{o.nombre}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-gray-400">{fmtFecha(o.fecha)}</span>
                {total > 0 && <span className="text-sm font-semibold text-gray-800"><Money value={total} /></span>}
              </div>
            </div>

            {/* Pipeline */}
            <div className="flex items-center gap-1">
              {PIPELINE.map((s, i) => {
                const done = i < pipelineIdx
                const active = i === pipelineIdx
                return (
                  <button key={s} onClick={() => cambiarEstado(s)}
                    className={['flex-1 text-center text-xs font-semibold py-1.5 rounded-lg transition',
                      active ? 'bg-blue-600 text-white' :
                      done   ? 'bg-blue-100 text-blue-700' :
                               'bg-gray-100 text-gray-400 hover:bg-gray-200',
                    ].join(' ')}>
                    {s}
                  </button>
                )
              })}
            </div>

            {/* Cliente */}
            <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {initials(o.nombre)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Cliente</p>
                <p className="font-semibold text-gray-900">{o.nombre}</p>
                {o.tel && <a href={`tel:${o.tel}`} className="text-sm text-blue-600 hover:underline block mt-0.5">{o.tel}</a>}
                {o.email && <p className="text-sm text-gray-500">{o.email}</p>}
                {o.rut && <p className="text-xs text-gray-400 mt-0.5">RUT: {o.rut}</p>}
              </div>
              {o.tel && (
                <a href={`https://wa.me/${o.tel.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                  className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center hover:bg-green-100 transition" title="WhatsApp">
                  <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </a>
              )}
            </div>

            {/* Equipo */}
            <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="18" x2="12.01" y2="18" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Equipo</p>
                <p className="font-semibold text-gray-900">{o.modelo || '—'}</p>
                {o.color && <p className="text-sm text-gray-500">{o.color}</p>}
                {o.serie && <p className="text-xs text-gray-400 mt-0.5">S/N: {o.serie}</p>}
                {o.pin && (
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    {o.pin}
                  </p>
                )}
              </div>
            </div>

            {/* Trabajo */}
            {o.trabajo && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Trabajo a realizar</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed">{o.trabajo}</p>
              </div>
            )}

            {/* Estado físico */}
            {o.estadoFisico && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Estado físico</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{o.estadoFisico}</p>
              </div>
            )}

            {/* Inspección del equipo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Inspección del equipo</p>
                <button onClick={() => setShowInspeccion(v => !v)}
                  className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-50 transition">
                  {showInspeccion ? 'Cerrar' : o.inspeccion ? 'Editar' : '+ Agregar'}
                </button>
              </div>

              {/* Mostrar inspección guardada */}
              {!showInspeccion && o.inspeccion && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  {o.inspeccion.notas && <p className="text-sm text-gray-700 leading-relaxed">{o.inspeccion.notas}</p>}
                  {o.inspeccion.fecha && <p className="text-[11px] text-gray-400">{fmtFecha(o.inspeccion.fecha)}</p>}
                  {o.inspeccion.fotos && o.inspeccion.fotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {o.inspeccion.fotos.map((src, i) => (
                        <button key={i} onClick={() => setLightbox(src)} className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition">
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Formulario de inspección */}
              {showInspeccion && (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <textarea value={inspecNotas} onChange={e => setInspecNotas(e.target.value)}
                    placeholder="Notas de la inspección: fallas encontradas, diagnóstico..." rows={3}
                    autoCapitalize="sentences"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />

                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-500">Fotos de inspección ({inspecFotos.length}/6)</p>
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
                        <button type="button" onClick={() => fileInspecRef.current?.click()}
                          className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition">
                          + Fotos
                        </button>
                      )}
                    </div>
                    <input ref={fileInspecRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFotosInspec} />
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

                  <div className="flex justify-end gap-2 flex-wrap items-center">
                    <button onClick={() => setShowInspeccion(false)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
                    <button onClick={() => guardarInspeccion('solo')} disabled={guardandoInspec}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:opacity-60 transition">
                      {guardandoInspec ? 'Guardando…' : 'Guardar'}
                    </button>
                    {(o.tel || o.email) && (
                      <div ref={reenviarRef} className="relative">
                        <button
                          onClick={() => setReenviarOpen(v => !v)}
                          disabled={guardandoInspec}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-60 transition">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                          Reenviar
                          <svg className={`w-3 h-3 transition-transform ${reenviarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                        {reenviarOpen && (
                          <div className="absolute bottom-full right-0 mb-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
                            {o.tel && (
                              <button
                                onClick={() => { setReenviarOpen(false); guardarInspeccion('whatsapp') }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition border-b border-gray-100">
                                <svg className="w-4 h-4 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.123 1.532 5.855L.057 23.01a.75.75 0 0 0 .931.931l5.163-1.476A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.68-.524-5.2-1.435l-.373-.222-3.865 1.105 1.105-3.851-.24-.386A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                                Por WhatsApp
                              </button>
                            )}
                            {o.email && (
                              <button
                                onClick={() => { setReenviarOpen(false); guardarInspeccion('correo') }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                                Por correo
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Repuestos */}
            {o.repuestos && o.repuestos.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Repuestos</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  {o.repuestos.map((r, i) => (
                    <div key={r.productId ?? i} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-gray-50 last:border-0">
                      <span className="text-gray-700">{r.name}</span>
                      <span className="text-gray-500 ml-4">{r.qty ?? 1} × <Money value={r.precio} /></span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-gray-50 font-semibold">
                    <span>Total repuestos</span>
                    <Money value={(o.repuestos ?? []).reduce((s, r) => s + r.precio * (r.qty ?? 1), 0)} />
                  </div>
                </div>
              </div>
            )}

            {/* Técnico + fecha estimada */}
            <div className="flex flex-wrap gap-4">
              {o.tecnico && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>Técnico: <strong>{o.tecnico}</strong></span>
                </div>
              )}
              {o.fechaEstimada && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Entrega estimada: <strong>{fmtFecha(o.fechaEstimada)}</strong></span>
                </div>
              )}
            </div>

            {/* Fotos de ingreso */}
            {o.photosIngreso && o.photosIngreso.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Fotos de ingreso ({o.photosIngreso.length})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {o.photosIngreso.map((src, i) => (
                    <button key={i} onClick={() => setLightbox(src)} className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0 space-y-2">
            {/* Solicitar aprobación de presupuesto */}
            {o.aprobacion_estado !== 'aprobado' ? (
              <button onClick={abrirModalAprobacion}
                className={`w-full text-sm font-semibold py-2.5 rounded-xl border transition ${
                  o.aprobacion_estado === 'pendiente'
                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    : o.aprobacion_estado === 'rechazado'
                    ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}>
                {o.aprobacion_estado === 'pendiente' ? 'Aprobación pendiente — Reenviar' :
                 o.aprobacion_estado === 'rechazado' ? 'Rechazado — Reenviar solicitud' :
                 'Solicitar aprobación de presupuesto'}
              </button>
            ) : (
              <div className="w-full text-center text-sm font-semibold py-2.5 rounded-xl bg-green-50 text-green-700 border border-green-200">
                Presupuesto aprobado
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { onClose(); setTimeout(() => window.location.hash = '#/taller?tab=derivados', 50) }}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition">
                Derivar
              </button>
              <button onClick={() => onEditar(o)}
                className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition">
                Editar orden
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de notificación al cambiar estado */}
      {notifEstado && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Orden movida a <span className="text-blue-600">{notifEstado.estado}</span></h3>
              <p className="text-xs text-gray-400 mt-0.5">¿Notificar al cliente?</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {emailOk && o.email && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium text-green-700">Email enviado a {o.email}</span>
                </div>
              )}
              {notifEstado.waMsg && o.tel && (
                <button onClick={enviarWhatsApp}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200 hover:bg-green-100 transition text-left">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-green-800">Enviar por WhatsApp</div>
                    <div className="text-xs text-green-600 truncate">{o.tel}</div>
                  </div>
                </button>
              )}
              {notifEstado.emailMsg && o.email && (
                <button onClick={enviarEmail} disabled={enviandoEmail || emailOk}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition text-left disabled:opacity-60">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-blue-800">
                      {emailOk ? 'Email enviado' : enviandoEmail ? 'Enviando…' : 'Enviar por email'}
                    </div>
                    <div className="text-xs text-blue-600 truncate">{o.email}</div>
                  </div>
                </button>
              )}
              {(!notifEstado.waMsg || !o.tel) && (!notifEstado.emailMsg || !o.email) && (
                <p className="text-xs text-gray-400 text-center py-2">El cliente no tiene teléfono ni email registrado.</p>
              )}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-gray-100 bg-gray-50">
              <button onClick={() => { setNotifEstado(null); onClose() }}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                Cerrar sin notificar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aprobación de presupuesto */}
      {showAprobacion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Solicitar aprobación</h3>
              <p className="text-xs text-gray-400 mt-0.5">{o.nombre} · {o.modelo} · #{String(o.num).padStart(4, '0')}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Presupuesto resumen */}
              <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm text-gray-600">Presupuesto</span>
                <span className="text-lg font-bold text-blue-600">
                  ${(o.repuestos?.length
                    ? o.repuestos.reduce((s, r) => s + (r.precio ?? 0) * (r.qty ?? 1), 0)
                    : (o.presup ?? 0)).toLocaleString('es-CL')}
                </span>
              </div>
              {/* WA */}
              {o.tel && (
                <button onClick={() => enviarAprobacion('wa')} disabled={enviandoAprob}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200 hover:bg-green-100 transition text-left disabled:opacity-60">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-green-800">Enviar por WhatsApp</div>
                    <div className="text-xs text-green-600">{o.tel}</div>
                  </div>
                </button>
              )}
              {/* Email */}
              {o.email && (
                <button onClick={() => enviarAprobacion('email')} disabled={enviandoAprob}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition text-left disabled:opacity-60">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-blue-800">
                      {enviandoAprob ? 'Enviando…' : 'Enviar por email'}
                    </div>
                    <div className="text-xs text-blue-600">{o.email}</div>
                  </div>
                </button>
              )}
              {!o.tel && !o.email && (
                <p className="text-xs text-gray-400 text-center py-2">El cliente no tiene teléfono ni email registrado.</p>
              )}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setShowAprobacion(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR fotos inspección */}
      {showQrInspec && o.id && (
        <QrFotosModal ordenId={o.id} tipo="inspeccion" onClose={() => setShowQrInspec(false)} />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition text-lg">
            ✕
          </button>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}
