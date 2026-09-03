import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useOrdenesLite, useOrdenPorNum, useActualizarOrden, usePagarComisionTecnica, useMsgTemplates, useSeguimientoConfig, useChecklist, useEquipos, useBuscarProductos, useBodegas, useTraslados, useTerminos, useUserProfiles } from '@/lib/queries'
import { DerivarModal } from './DerivarModal'
import { useAuth } from '@/context/AuthContext'
import { sendEmail, buildEmailIngreso, buildEmailAprobacion, buildEmailInspeccion, buildEmailListo, puedeResponderCorreo } from '@/lib/email'
import { supabase } from '@/lib/supabase'
import { EstadoBadge } from '@/components/shared/Badge'
import { Money } from '@/components/shared/Money'
import { QrFotosModal } from './QrFotosModal'
import { OrdenModal } from './OrdenModal'
import { formatHorario, resolverCategoriaEquipo } from './utils'
import { Spinner } from '@/components/shared/Spinner'
import type { EstadoOrden, Inspeccion, CheckItem, Producto } from '@/types'
import { comprimirImagenADataUrl } from '@/lib/imagen'

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

export function OrdenDetallePage({ num: numProp, onClose }: { num?: string; onClose?: () => void } = {}) {
  const { num: numParam } = useParams<{ num: string }>()
  const num = numProp ?? numParam
  const { empresaId, empresaNombre, esAdmin } = useAuth()
  const qc = useQueryClient()
  // Órdenes livianas (misma caché que TallerPage, sin fotos/checklists) — solo
  // se usan para el número siguiente/lookup por id que necesita OrdenModal.
  // La orden que se muestra en ESTA pantalla se pide completa aparte, una sola
  // fila, en vez de descargar las ~2800 órdenes de la empresa para encontrarla.
  const { data: ordenes } = useOrdenesLite()
  const { data: o, isLoading } = useOrdenPorNum(num)
  const actualizarOrden = useActualizarOrden()
  const pagarComision = usePagarComisionTecnica()
  const { data: msgTemplates } = useMsgTemplates()
  const { data: segCfg } = useSeguimientoConfig()
  const { data: terminos } = useTerminos()

  const { data: checklistPorCategoria } = useChecklist()
  const { data: equipos = [] } = useEquipos()
  const { data: bodegas = [] } = useBodegas()
  const { data: traslados = [] } = useTraslados()
  const { data: usuarios = [] } = useUserProfiles()

  const [editarOpen, setEditarOpen] = useState(false)
  const [showDerivar, setShowDerivar] = useState(false)
  const [pendingEstado, setPendingEstado] = useState<EstadoOrden | null>(null)
  const [notif, setNotif] = useState<{ estado: EstadoOrden; waMsg: string; emailMsg: string } | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checkItems, setCheckItems] = useState<CheckItem[]>([])
  const [checklistSalidaOpen, setChecklistSalidaOpen] = useState(false)
  const [checkItemsSalida, setCheckItemsSalida] = useState<CheckItem[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [emailOk, setEmailOk] = useState(false)
  const [enviandoEmailDirecto, setEnviandoEmailDirecto] = useState(false)
  const [emailOkDirecto, setEmailOkDirecto] = useState(false)
  const [aprobEnviando, setAprobEnviando] = useState(false)
  const [aprobMsg, setAprobMsg] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [tecnicoForm, setTecnicoForm] = useState('')
  const [tecnicoIdForm, setTecnicoIdForm] = useState('')
  const [comisionActivaForm, setComisionActivaForm] = useState(false)
  const [comisionBrutoForm, setComisionBrutoForm] = useState('')
  const [comisionPorcentajeForm, setComisionPorcentajeForm] = useState('')
  const [guardandoTecnico, setGuardandoTecnico] = useState(false)
  const [tecnicoSyncedId, setTecnicoSyncedId] = useState<string | null>(null)
  const [pagoComisionOpen, setPagoComisionOpen] = useState(false)

  // Inspección
  const [showInspeccion, setShowInspeccion] = useState(false)
  const [inspecNotas, setInspecNotas] = useState('')
  const [inspecFotos, setInspecFotos] = useState<string[]>([])
  const [showQrInspec, setShowQrInspec] = useState(false)
  const [guardandoInspec, setGuardandoInspec] = useState(false)
  const [enviandoInspec, setEnviandoInspec] = useState(false)
  const [reenviarOpen, setReenviarOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const reenviarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reenviarOpen) return
    function handleClick(e: MouseEvent) {
      if (reenviarRef.current && !reenviarRef.current.contains(e.target as Node)) setReenviarOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [reenviarOpen])

  // Fotos de ingreso
  const [showFotosIngreso, setShowFotosIngreso] = useState(false)
  const [showQrIngreso, setShowQrIngreso] = useState(false)
  const [guardandoIngreso, setGuardandoIngreso] = useState(false)
  const fileRefIngreso = useRef<HTMLInputElement>(null)

  // La tarjeta lateral permite asignar/cambiar el técnico sin abrir la edición
  // completa. Se reinicia solo al abrir una OT distinta, no mientras se edita.
  // Este patrón de ajuste durante render evita un frame con datos de la OT anterior.
  if (o && tecnicoSyncedId !== o.id) {
    setTecnicoSyncedId(o.id)
    setTecnicoForm(o?.tecnico ?? '')
    setTecnicoIdForm(o?.tecnicoId ?? '')
    setComisionActivaForm(o?.comisionTecnicaActiva === true)
    setComisionBrutoForm(o?.comisionTecnicaBruto ? String(o.comisionTecnicaBruto) : '')
    setComisionPorcentajeForm(o?.comisionTecnicaPorcentaje ? String(o.comisionTecnicaPorcentaje) : '')
  }

  // Repuestos — modal con búsqueda de inventario
  const [showRepModal, setShowRepModal] = useState(false)
  const [repSearch, setRepSearch] = useState('')
  const [repSelected, setRepSelected] = useState<Producto | null>(null)
  const [repQty, setRepQty] = useState('1')
  const [repPrecio, setRepPrecio] = useState('')
  const [repPreciosEditando, setRepPreciosEditando] = useState<Record<number, string>>({})
  const [repManualNombre, setRepManualNombre] = useState('')
  const [repManual, setRepManual] = useState(false)
  // Búsqueda server-side (ilike + índice) en vez de filtrar el catálogo
  // completo en el navegador.
  const { data: repResultados = [] } = useBuscarProductos(repSearch)

  // Sync inspección local con la orden cuando cambia. Se usa useState (no un ref)
  // para trackear el último id sincronizado, siguiendo el patrón oficial de React
  // para "ajustar estado cuando cambia un prop" — mutar un ref durante el render
  // no está permitido (lo marca react-hooks/refs).
  const [inspecSyncedId, setInspecSyncedId] = useState<string | null>(null)
  const qrInspecSnapshot = useRef<string[]>([])
  if (o && inspecSyncedId !== o.id) {
    setInspecSyncedId(o.id)
    setInspecNotas(o.inspeccion?.notas ?? '')
    setInspecFotos(o.inspeccion?.fotos ?? [])
    // Merge template (según la categoría del equipo de ESTA orden) con el
    // estado ya guardado en la orden. El checklist de salida usa los MISMOS
    // ítems que el de ingreso (misma categoría) — se vuelven a revisar los
    // mismos componentes antes de entregar, no una lista aparte.
    const categoriaEquipo = resolverCategoriaEquipo(o.modelo, equipos)
    const checklistTemplate = checklistPorCategoria?.[categoriaEquipo] ?? []
    const saved = o.checkIngreso ?? []
    const merged: CheckItem[] = checklistTemplate.map(label => {
      const s = saved.find(s => s.label === label)
      return { label, checked: s?.checked ?? false, estado: s?.estado }
    })
    setCheckItems(merged.length ? merged : saved)

    const savedSalida = o.checkSalida ?? []
    const mergedSalida: CheckItem[] = checklistTemplate.map(label => {
      const s = savedSalida.find(s => s.label === label)
      return { label, checked: s?.checked ?? false, estado: s?.estado }
    })
    setCheckItemsSalida(mergedSalida.length ? mergedSalida : savedSalida)
  }

  // Sumar en vivo las fotos que llegan por QR a la inspección (realtime),
  // incluso con el formulario abierto. Solo agrega las nuevas — no revierte borrados locales.
  const inspecDbFotos = o?.inspeccion?.fotos
  useEffect(() => {
    const dbFotos = inspecDbFotos ?? []
    const nuevas = dbFotos.filter(f => !qrInspecSnapshot.current.includes(f))
    qrInspecSnapshot.current = dbFotos
    if (nuevas.length) setInspecFotos(prev => [...new Set([...prev, ...nuevas])])
  }, [inspecDbFotos])

  // Mientras un modal QR esté abierto, refrescar la orden cada 3s para que
  // las fotos subidas desde el iPhone aparezcan aunque el realtime no dispare.
  // OJO: la clave de caché era 'tp_orders' (del blob viejo, previo a la
  // migración a tabla relacional) — no correspondía a ninguna query activa, así
  // que este refresco nunca hacía nada. La orden individual vive en
  // ['orden-por-num', empresaId, num] (useOrdenPorNum).
  useEffect(() => {
    if (!showQrInspec && !showQrIngreso) return
    const id = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['orden-por-num', empresaId, num] })
    }, 3000)
    return () => clearInterval(id)
  }, [showQrInspec, showQrIngreso, qc, empresaId, num])

  const pollAprobacion = useCallback(async () => {
    if (!o?.aprobacion_token || o.aprobacion_estado !== 'pendiente') return
    const { data } = await supabase
      .from('aprobaciones')
      .select('token,estado,aprobado_en')
      .eq('token', o.aprobacion_token)
      .neq('estado', 'pendiente')
      .maybeSingle()
    if (!data) return
    await actualizarOrden.mutateAsync({
      id: o.id, aprobacion_estado: data.estado as 'aprobado' | 'rechazado', aprobacion_fecha: data.aprobado_en,
    })
  }, [o, actualizarOrden])

  useEffect(() => {
    if (o?.aprobacion_estado !== 'pendiente') return
    const id = setInterval(() => void pollAprobacion(), 30_000)
    return () => clearInterval(id)
  }, [o?.aprobacion_estado, pollAprobacion])

  useEffect(() => {
    if (!aprobMsg) return
    const id = setTimeout(() => setAprobMsg(null), 5000)
    return () => clearTimeout(id)
  }, [aprobMsg])

  if (isLoading) return (
    <div className="flex items-center justify-center h-full py-24">
      <Spinner className="w-8 h-8" />
    </div>
  )
  if (!o) return (
    <div className="flex flex-col items-center justify-center h-full py-24 gap-3">
      <p className="text-gray-500">Orden no encontrada</p>
      {onClose && (
        <button onClick={onClose} className="text-sm text-blue-600 hover:underline">← Volver al taller</button>
      )}
    </div>
  )

  const pipelineIdx = PIPELINE.indexOf(o.status as EstadoOrden)

  // Everything below uses `o` only after the early-return guards above
  const orden = o! // safe: early returns above guarantee o is defined here during render
  const brutoComisionable = Math.max(0, Number(comisionBrutoForm) || 0)
  const porcentajeComision = Math.min(100, Math.max(0, Number(comisionPorcentajeForm) || 0))
  const netoComisionableEstimado = Math.round(brutoComisionable / 1.19)
  const montoComisionEstimado = Math.round(netoComisionableEstimado * porcentajeComision / 100)

  function buildVars() {
    const branch = bodegas.find(b => b.id === orden.branchId)
    return {
      nombre: orden.nombre ?? '', modelo: orden.modelo ?? '', orden: orden.num,
      sucursal: branch?.nombre ?? branch?.name ?? empresaNombre ?? '',
      horario: formatHorario(branch?.horario) || formatHorario(segCfg?.horario) || '',
      direccion: branch?.direccion ?? '', telefono: branch?.tel ?? '', email: branch?.email ?? '',
      presupuesto: String(orden.presup ?? ''), trabajo: orden.trabajo ?? '',
      link: '', fecha_estimada: orden.fechaEstimada ?? '',
    }
  }

  async function buildListoHtml(msgTexto: string) {
    const branch = bodegas.find(b => b.id === orden.branchId)
    return buildEmailListo({
      tallerNombre: empresaNombre || 'tu taller',
      logoUrl: segCfg?.logoUrl,
      msgTexto,
      orden: { num: orden.num, modelo: orden.modelo ?? '', nombre: orden.nombre ?? '' },
      branchNombre: branch?.nombre ?? branch?.name ?? empresaNombre ?? '',
      horario: formatHorario(branch?.horario) || formatHorario(segCfg?.horario) || '',
      puedeResponder: empresaId ? await puedeResponderCorreo(empresaId) : false,
    })
  }

  function asuntoListo(estado: EstadoOrden) {
    return estado === 'Listo'
      ? `Tu ${orden.modelo ?? 'equipo'} está listo para retirar — #OT-${String(orden.num).padStart(4, '0')}`
      : `Orden #OT-${String(orden.num).padStart(4, '0')} entregada`
  }

  async function cambiarEstadoConSubestado(estado: EstadoOrden, subestado: string) {
    await actualizarOrden.mutateAsync({ id: orden.id, status: estado, subestado })
    setPendingEstado(null)
    setEmailOk(false)
    const vars = buildVars()
    const esListo = estado === 'Listo' || estado === 'Entregado'
    const waMsg = esListo && msgTemplates?.listo_wa ? rellenarTemplate(msgTemplates.listo_wa, vars) : ''
    const emailMsg = esListo && msgTemplates?.listo_email ? rellenarTemplate(msgTemplates.listo_email, vars) : ''
    if (esListo && emailMsg && orden.email && empresaId) {
      const html = await buildListoHtml(emailMsg)
      const res = await sendEmail(empresaId, orden.email, asuntoListo(estado), html, { notifyError: false })
      if (res.ok) {
        setEmailOk(true)
      } else {
        setAprobMsg({
          msg: `La orden se actualizó, pero el correo a ${orden.email} no salió: ${res.error ?? 'error desconocido'}`,
          type: 'err',
        })
      }
    }
    const mostrarEmail = esListo && emailMsg && orden.email && !empresaId
    if (waMsg || mostrarEmail) setNotif({ estado, waMsg, emailMsg: mostrarEmail ? emailMsg : '' })
  }

  async function guardarTecnicoYComision() {
    const porcentaje = Math.min(100, Math.max(0, Number(comisionPorcentajeForm) || 0))
    const bruto = Math.max(0, Number(comisionBrutoForm) || 0)
    const comisionActiva = comisionActivaForm && !!tecnicoForm.trim() && bruto > 0 && porcentaje > 0
    const baseEstimada = Math.round(bruto / 1.19)
    const montoEstimado = Math.round(baseEstimada * porcentaje / 100)
    setGuardandoTecnico(true)
    try {
      await actualizarOrden.mutateAsync({
        id: orden.id,
        tecnico: tecnicoForm.trim() || undefined,
        tecnicoId: tecnicoIdForm || undefined,
        comisionTecnicaActiva: comisionActiva,
        comisionTecnicaBruto: bruto,
        comisionTecnicaBase: comisionActiva ? baseEstimada : undefined,
        comisionTecnicaPorcentaje: porcentaje,
        comisionTecnicaMonto: comisionActiva ? montoEstimado : undefined,
      })
    } finally {
      setGuardandoTecnico(false)
    }
  }

  async function cambiarEstado(estado: EstadoOrden) {
    if (orden.status === estado) return
    if (estado === 'Listo' || estado === 'Entregado') {
      setPendingEstado(estado)
      return
    }
    await actualizarOrden.mutateAsync({ id: orden.id, status: estado, subestado: undefined })
  }

  async function enviarEmail() {
    if (!notif?.emailMsg || !orden.email || !empresaId) return
    setEnviandoEmail(true)
    try {
      const res = await sendEmail(
        empresaId,
        orden.email,
        asuntoListo(notif.estado),
        await buildListoHtml(notif.emailMsg),
        { notifyError: false },
      )
      if (res.ok) setEmailOk(true)
      else setAprobMsg({ msg: `El correo no salió: ${res.error ?? 'error desconocido'}`, type: 'err' })
    } finally {
      setEnviandoEmail(false)
    }
  }

  function enviarWhatsApp() {
    if (!notif?.waMsg || !orden.tel) return
    window.open(`https://wa.me/${orden.tel.replace(/\D/g, '')}?text=${encodeURIComponent(notif.waMsg)}`, '_blank')
  }

  async function enviarEmailDirecto() {
    if (!orden.email || !empresaId || enviandoEmailDirecto) return
    setEnviandoEmailDirecto(true)
    try {
      const vars = buildVars()
      const branch = bodegas.find(b => b.id === orden.branchId)
      const branchNombre = branch?.nombre ?? branch?.name ?? empresaNombre ?? ''
      const tallerNombre = empresaNombre || 'tu taller'
      const status = orden.status as EstadoOrden

      let asunto: string
      let html: string

      if (status === 'Listo' || status === 'Entregado') {
        const msgTexto = msgTemplates?.listo_email
          ? rellenarTemplate(msgTemplates.listo_email, vars)
          : `Hola ${orden.nombre}, tu ${orden.modelo ?? 'equipo'} ${status === 'Listo' ? 'está listo para retirar' : 'ha sido entregado'}.`
        asunto = asuntoListo(status)
        html = await buildListoHtml(msgTexto)
      } else if (status === 'Chequeo') {
        const msgTexto = msgTemplates?.ingreso_email
          ? rellenarTemplate(msgTemplates.ingreso_email, vars)
          : `Hola ${orden.nombre}, tu ${orden.modelo ?? 'equipo'} ha ingresado a nuestro taller y será revisado a la brevedad.`
        asunto = `Tu equipo ha ingresado — #OT-${String(orden.num).padStart(4, '0')}`
        html = buildEmailIngreso({
          tallerNombre,
          logoUrl: segCfg?.logoUrl,
          msgTexto,
          orden: {
            num: orden.num, modelo: orden.modelo ?? '', nombre: orden.nombre ?? '',
            serie: orden.serie, color: orden.color, estadoFisico: orden.estadoFisico,
            trabajo: orden.trabajo, rut: orden.rut, tel: orden.tel, email: orden.email,
          },
          branchNombre,
          branchDir: branch?.direccion,
          branchTel: branch?.tel,
          branchEmail: branch?.email,
          fotos: orden.photosIngreso,
          terminos,
        })
      } else {
        // Reparación u otro estado intermedio
        const msgTexto = msgTemplates?.listo_email
          ? rellenarTemplate(msgTemplates.listo_email, vars)
          : `Hola ${orden.nombre}, tu ${orden.modelo ?? 'equipo'} se encuentra actualmente en reparación.`
        asunto = `Tu equipo está en reparación — #OT-${String(orden.num).padStart(4, '0')}`
        html = await buildListoHtml(msgTexto)
      }

      const res = await sendEmail(empresaId, orden.email, asunto, html, { notifyError: false })
      if (res.ok) {
        setEmailOkDirecto(true)
        setTimeout(() => setEmailOkDirecto(false), 4000)
      } else {
        setAprobMsg({ msg: `El correo a ${orden.email} no salió: ${res.error ?? 'error desconocido'}`, type: 'err' })
      }
    } finally {
      setEnviandoEmailDirecto(false)
    }
  }

  function handleFotosInspec(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 6 - inspecFotos.length)
    // Se comprime antes de guardar: estas fotos viven como base64 dentro de la
    // fila de la orden (ver src/lib/imagen.ts).
    files.forEach(async f => {
      const dataUrl = await comprimirImagenADataUrl(f)
      setInspecFotos(prev => [...prev, dataUrl])
    })
    e.target.value = ''
  }

  function printLabel() {
    if (!o) return
    const branch = bodegas.find(b => b.id === o.branchId)
    const tallerNom = empresaNombre || 'tu taller'
    const sucNom = branch?.nombre ?? branch?.name ?? ''
    const footer = [tallerNom, sucNom].filter(Boolean).join(' — ')
    const otUrl = `${window.location.origin}${window.location.pathname}?orden=${encodeURIComponent(o.id)}`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Etiqueta OT #${o.num}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
  @page{size:6cm 4cm;margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:6cm;height:4cm;font-family:'Manrope',system-ui,sans-serif;overflow:hidden;background:#fff;padding:3mm 3mm 3mm 4mm;display:flex;gap:3mm}
  .left{display:flex;flex-direction:column;justify-content:space-between;flex:1;min-width:0}
  .modelo{font-size:8pt;font-weight:800;color:#000;line-height:1.2}
  .cliente{font-size:7.5pt;font-weight:600;color:#000;margin-top:.5mm}
  .orden-label{font-size:4.5pt;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-top:1.5mm}
  .orden{font-size:13pt;font-weight:800;color:#000;line-height:1.1;margin-bottom:1.5mm}
  .row{font-size:6.5pt;color:#000;margin-top:1.5mm;font-weight:500;line-height:1.4}
  .row b{font-weight:700}
  .footer{font-size:4.5pt;color:#999;font-weight:500;margin-top:auto;padding-top:2mm}
  .right{display:flex;flex-direction:column;align-items:center;justify-content:center;width:15mm;border-left:.3px solid #ddd;padding-left:2.5mm;flex-shrink:0}
  .qr-lbl{font-size:4pt;color:#aaa;margin-top:1.5mm;text-align:center;font-weight:500}
  @media print{@page{size:6cm 4cm;margin:0}}
</style></head><body>
<div class="left">
  <div>
    <div class="modelo">${o.modelo ?? '—'}</div>
    <div class="cliente">${o.nombre ?? '—'}${o.apellido ? ' ' + o.apellido : ''}</div>
    <div class="orden-label">Orden</div>
    <div class="orden">#${o.num}</div>
    <div class="row"><b>Trabajo:</b> ${o.trabajo ?? '—'}</div>
    ${o.pin ? `<div class="row"><b>Clave:</b> ${o.pin}</div>` : ''}
  </div>
  <div class="footer">${footer}</div>
</div>
<div class="right">
  <div id="qr"></div>
  <div class="qr-lbl">Abrir OT</div>
</div>
<script>
  new QRCode(document.getElementById('qr'),{text:'${otUrl}',width:52,height:52,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});
  window.onload=()=>setTimeout(()=>window.print(),600);
</script>
</body></html>`)
    w.document.close()
  }

  // Fija estado explícito a una función en el detalle (bloqueado si llegó apagado)
  function setEstadoDetalle(idx: number, estado: 'ok' | 'no_funciona' | 'no_probado') {
    if (orden.checkApagado) return
    setCheckItems(prev => prev.map((c, j) => {
      if (j !== idx) return c
      const nuevo = c.estado === estado ? undefined : estado
      return { ...c, estado: nuevo, checked: nuevo === 'ok' }
    }))
  }

  async function guardarChecklist() {
    await actualizarOrden.mutateAsync({ id: orden.id, checkIngreso: checkItems })
    setChecklistOpen(false)
  }

  // Checklist de salida: mismos ítems que el de ingreso, sin el bloqueo por
  // "llegó apagado" (a esta altura el equipo ya se probó al menos una vez).
  function setEstadoSalida(idx: number, estado: 'ok' | 'no_funciona' | 'no_probado') {
    setCheckItemsSalida(prev => prev.map((c, j) => {
      if (j !== idx) return c
      const nuevo = c.estado === estado ? undefined : estado
      return { ...c, estado: nuevo, checked: nuevo === 'ok' }
    }))
  }

  async function guardarChecklistSalida() {
    await actualizarOrden.mutateAsync({ id: orden.id, checkSalida: checkItemsSalida })
    setChecklistSalidaOpen(false)
  }

  async function guardarInspeccion() {
    setGuardandoInspec(true)
    const inspeccion: Inspeccion = { fotos: inspecFotos, notas: inspecNotas, fecha: new Date().toISOString() }
    await actualizarOrden.mutateAsync({ id: orden.id, inspeccion })
    setGuardandoInspec(false)
    setShowInspeccion(false)
  }

  async function guardarYEnviarInspeccion(canal: 'correo' | 'whatsapp') {
    if (canal === 'correo' && !orden.email) { setAprobMsg({ msg: 'La orden no tiene email del cliente.', type: 'err' }); return }
    if (canal === 'whatsapp' && !orden.tel) { setAprobMsg({ msg: 'La orden no tiene teléfono del cliente.', type: 'err' }); return }
    if (!empresaId) { setAprobMsg({ msg: 'No se pudo identificar la empresa. Recarga la página.', type: 'err' }); return }
    setEnviandoInspec(true)
    try {
      const inspeccion: Inspeccion = { fotos: inspecFotos, notas: inspecNotas, fecha: new Date().toISOString() }
      await actualizarOrden.mutateAsync({ id: orden.id, inspeccion })

      const tplVars: Record<string, string> = {
        nombre: orden.nombre ?? '', modelo: orden.modelo ?? '', orden: orden.num ?? '',
        serie: orden.serie ?? '', diagnostico: inspecNotas,
      }

      if (canal === 'correo') {
        const rawTpl = msgTemplates?.inspeccion_email ?? `Hola {{nombre}}, al abrir tu {{modelo}} para la reparación detectamos algunos detalles que queremos informarte antes de continuar.`
        const msgTexto = rawTpl.split(/\n\n/)[0].replace(/\{\{(\w+)\}\}/g, (_, k: string) => tplVars[k] ?? '')
        const html = buildEmailInspeccion({
          tallerNombre: empresaNombre || 'tu taller',
          logoUrl: segCfg?.logoUrl,
          msgTexto,
          orden: { num: orden.num ?? '', modelo: orden.modelo ?? '', nombre: orden.nombre ?? '', serie: orden.serie },
          notas: inspecNotas,
          fotos: inspecFotos,
          puedeResponder: empresaId ? await puedeResponderCorreo(empresaId) : false,
        })
        const asunto = `Reporte de inspección — ${orden.modelo ?? 'Equipo'} #OT-${String(orden.num).padStart(4, '0')}`
        const res = await sendEmail(empresaId, orden.email!, asunto, html, { notifyError: false })
        setAprobMsg(res.ok
          ? { msg: `Reporte enviado a ${orden.email}`, type: 'ok' }
          : { msg: 'Guardado, pero el email falló: ' + (res.error ?? 'error desconocido'), type: 'err' })
      }

      if (canal === 'whatsapp') {
        const rawTpl = msgTemplates?.inspeccion_wa ?? `Hola {{nombre}}, te informamos que realizamos la inspección de tu {{modelo}} (OT #{{orden}}).\n\nDiagnóstico:\n{{diagnostico}}`
        const msg = rawTpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => tplVars[k] ?? '')
        const tel = (orden.tel ?? '').replace(/\D/g, '')
        const telWa = tel.startsWith('56') ? tel : '56' + tel
        window.open(`https://wa.me/${telWa}?text=${encodeURIComponent(msg)}`, '_blank')
      }
    } catch (e) {
      setAprobMsg({ msg: 'Error inesperado: ' + (e as Error).message, type: 'err' })
    } finally {
      setEnviandoInspec(false)
      setShowInspeccion(false)
    }
  }

  async function handleFotosIngreso(e: React.ChangeEvent<HTMLInputElement>) {
    const existing = orden.photosIngreso ?? []
    const files = Array.from(e.target.files ?? []).slice(0, 6 - existing.length)
    e.target.value = ''
    // De a una y esperando cada guardado: acá se lee la lista completa de la
    // caché y se reescribe entera, así que dos archivos en paralelo leerían la
    // misma lista y el segundo pisaría al primero. Con `forEach(async …)` no se
    // esperaba nada y la foto perdida dependía de cuál terminara antes.
    for (const f of files) {
      const dataUrl = await comprimirImagenADataUrl(f)
      const fresca = qc.getQueryData<typeof orden | null>(['orden-por-num', empresaId, num])
      const nuevas = [...(fresca?.photosIngreso ?? []), dataUrl]
      await actualizarOrden.mutateAsync({ id: orden.id, photosIngreso: nuevas })
    }
  }

  function stockTotal(p: Producto): number {
    if (p.stock_sucursales && Object.keys(p.stock_sucursales).length)
      return Object.values(p.stock_sucursales).reduce((s, v) => s + (v ?? 0), 0)
    return p.stock ?? 0
  }

  function abrirRepModal() {
    setRepSearch(''); setRepSelected(null); setRepQty('1'); setRepPrecio('')
    setRepManualNombre(''); setRepManual(false); setShowRepModal(true)
  }

  function seleccionarProducto(p: Producto) {
    setRepSelected(p)
    setRepPrecio(String(p.precio_venta ?? 0))
    setRepQty('1')
    setRepManual(false)
  }

  async function confirmarRepuesto() {
    const qty = Math.max(1, parseInt(repQty) || 1)
    const precio = parseFloat(repPrecio) || 0
    let nuevo: { productId?: string; name: string; qty: number; precio: number }

    if (repManual) {
      if (!repManualNombre.trim()) return
      nuevo = { name: repManualNombre.trim(), qty, precio }
    } else {
      if (!repSelected) return
      nuevo = { productId: repSelected.id, name: repSelected.nombre, qty, precio }
    }

    await actualizarOrden.mutateAsync({ id: orden.id, repuestos: [...(orden.repuestos ?? []), nuevo] })
    setShowRepModal(false)
  }

  async function eliminarRepuesto(idx: number) {
    await actualizarOrden.mutateAsync({ id: orden.id, repuestos: (orden.repuestos ?? []).filter((_, i) => i !== idx) })
  }

  async function guardarPrecioRepuesto(idx: number) {
    const repuesto = (orden.repuestos ?? [])[idx]
    if (!repuesto) return
    const precio = Math.max(0, Number(repPreciosEditando[idx] ?? repuesto.precio) || 0)
    setRepPreciosEditando(prev => {
      const siguiente = { ...prev }
      delete siguiente[idx]
      return siguiente
    })
    if (precio === repuesto.precio) return
    await actualizarOrden.mutateAsync({
      id: orden.id,
      repuestos: (orden.repuestos ?? []).map((r, i) => i === idx ? { ...r, precio } : r),
    })
  }

  const APROB_BASE_URL = `${window.location.origin}/aprobar.html`

  async function solicitarAprobacion() {
    const aprobOrden = orden
    if (!aprobOrden.email) { setAprobMsg({ msg: 'La orden no tiene email del cliente.', type: 'err' }); return }
    if (!empresaId) { setAprobMsg({ msg: 'No se pudo identificar la empresa. Recarga la página.', type: 'err' }); return }
    setAprobEnviando(true)
    setAprobMsg(null)
    try {
      const aprobBranch = bodegas.find(b => b.id === aprobOrden.branchId)
      const aprobHorario = formatHorario(aprobBranch?.horario) || formatHorario(segCfg?.horario) || ''
      let token = aprobOrden.aprobacion_token
      if (!token || aprobOrden.aprobacion_estado !== 'pendiente') {
        token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
        const trabajoData = JSON.stringify({
          v: 2,
          items: (aprobOrden.repuestos ?? []).map(r => ({ name: r.name, qty: r.qty, precio: r.precio ?? 0 })),
          trabajo: aprobOrden.trabajo ?? '',
          taller: empresaNombre || 'tu taller',
          sucursal: aprobBranch?.nombre ?? aprobBranch?.name ?? '',
          horario: aprobHorario,
          tel: aprobBranch?.tel ?? '',
          logoUrl: segCfg?.logoUrl ?? '',
        })
        const { error } = await supabase.from('aprobaciones').insert({
          token,
          orden_id: aprobOrden.id,
          empresa_id: empresaId,
          orden_num: aprobOrden.num ?? '',
          cliente: aprobOrden.nombre ?? '',
          equipo: aprobOrden.modelo ?? '',
          trabajo: trabajoData,
          presupuesto: Number(aprobOrden.presup) || 0,
          estado: 'pendiente',
        })
        if (error) {
          console.error('Error insert aprobaciones:', error)
          setAprobMsg({ msg: 'No se pudo crear la solicitud: ' + error.message, type: 'err' })
          setAprobEnviando(false)
          return
        }

        await actualizarOrden.mutateAsync({
          id: aprobOrden.id, aprobacion_token: token, aprobacion_estado: 'pendiente' as const,
          aprobacion_enviado: new Date().toISOString(),
        })
      }

      const link = `${APROB_BASE_URL}?t=${token}`
      const totalPresup = Number(aprobOrden.presup) || (aprobOrden.repuestos ?? []).reduce((s, r) => s + r.precio * (r.qty ?? 1), 0)
      const tplVars: Record<string, string> = {
        nombre: aprobOrden.nombre ?? '',
        modelo: aprobOrden.modelo ?? '',
        orden: aprobOrden.num ?? '',
        trabajo: aprobOrden.trabajo ?? '—',
        presupuesto: '$' + totalPresup.toLocaleString('es-CL'),
        sucursal: aprobBranch?.nombre ?? aprobBranch?.name ?? '',
        horario: aprobHorario,
        tecnico: aprobOrden.tecnico ?? '',
        fecha_estimada: aprobOrden.fechaEstimada ?? '',
        link,
      }
      const rawTpl = msgTemplates?.aprobacion_email ?? `Hola {{nombre}}, hemos revisado tu {{modelo}} y necesitamos tu autorización para proceder.`
      // Solo el primer párrafo como intro (las líneas Trabajo/Presupuesto/Orden ya van en las tarjetas)
      const introTexto = rawTpl.split(/\n\n/)[0].replace(/\{\{(\w+)\}\}/g, (_, k: string) => tplVars[k] ?? '')
      const html = buildEmailAprobacion({
        tallerNombre: empresaNombre || 'tu taller',
        logoUrl: segCfg?.logoUrl,
        introTexto,
        orden: { num: aprobOrden.num ?? '', modelo: aprobOrden.modelo ?? '', nombre: aprobOrden.nombre ?? '', trabajo: aprobOrden.trabajo },
        repuestos: aprobOrden.repuestos,
        presupuesto: Number(aprobOrden.presup ?? 0),
        link,
      })
      const asunto = `Aprobación de presupuesto — ${aprobOrden.modelo ?? 'Equipo'} #${aprobOrden.num ?? ''}`
      const res = await sendEmail(empresaId, aprobOrden.email, asunto, html, { notifyError: false })
      if (res.ok) {
        setAprobMsg({ msg: `Solicitud enviada a ${aprobOrden.email}`, type: 'ok' })
      } else {
        setAprobMsg({ msg: 'Solicitud creada, pero el email falló: ' + (res.error ?? 'error desconocido'), type: 'err' })
      }
    } catch (e) {
      console.error('Error solicitarAprobacion:', e)
      setAprobMsg({ msg: 'Error inesperado: ' + (e as Error).message, type: 'err' })
    } finally {
      setAprobEnviando(false)
    }
  }

  async function eliminarFotoIngreso(idx: number) {
    setGuardandoIngreso(true)
    const nuevas = (orden.photosIngreso ?? []).filter((_, i) => i !== idx)
    await actualizarOrden.mutateAsync({ id: orden.id, photosIngreso: nuevas })
    setGuardandoIngreso(false)
  }

  const content = (
    <>
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3.5 border-b border-gray-200 bg-white/95 flex-shrink-0 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-800">Orden #{o.num}</span>
          <div className="md:hidden"><EstadoBadge estado={o.status} subestado={o.subestado} /></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:block"><EstadoBadge estado={o.status} subestado={o.subestado} /></div>
          {(() => {
            const derivado = traslados.some(t => t.order_id === o.id && t.estado !== 'retornado')
            return (
              <button onClick={() => setShowDerivar(true)}
                className={`flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-1.5 border transition ${
                  derivado ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                {derivado ? 'Derivado' : 'Derivar'}
              </button>
            )
          })()}
          <button onClick={printLabel}
            className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Etiqueta
          </button>
          <button onClick={() => setEditarOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Editar
          </button>
          {onClose && (
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 3 columnas */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-auto md:overflow-hidden">

        {/* ── Col 1: Cliente + Equipo + Trabajo ── */}
        <div className="w-full md:w-80 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-slate-50/70 p-3 md:overflow-y-auto flex flex-col gap-3">

          {/* Cliente */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Cliente</p>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {initials([o.nombre, o.apellido].filter(Boolean).join(' '))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{[o.nombre, o.apellido].filter(Boolean).join(' ') || '—'}</p>
                {o.rut && <p className="text-xs text-gray-400 mt-0.5">RUT: {o.rut}</p>}
                {o.tel && <a href={`tel:${o.tel}`} className="text-xs text-blue-600 font-semibold hover:underline block mt-1">{o.tel}</a>}
                {o.email && <p className="text-xs text-gray-500 mt-0.5 truncate">{o.email}</p>}
              </div>
              {o.tel && (
                <a href={`https://wa.me/${o.tel.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                  className="w-7 h-7 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center hover:bg-green-100 transition flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          {/* Equipo */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Equipo</p>
            <p className="font-semibold text-gray-900 text-sm">{o.modelo || '—'}</p>
            {o.color && <p className="text-xs text-gray-500 mt-1">{o.color}</p>}
            {o.serie && <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="5" y="2" width="14" height="20" rx="2"/></svg>
              {o.serie}
            </p>}
            {o.pin && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              PIN: {o.pin}
            </p>}
          </div>

          {/* Trabajo */}
          {o.trabajo && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Trabajo a realizar</p>
              <p className="text-sm text-gray-700 leading-relaxed">{o.trabajo}</p>
            </div>
          )}

          {/* Estado físico */}
          {o.estadoFisico && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Estado físico</p>
              <p className="text-sm text-gray-700 leading-relaxed">{o.estadoFisico}</p>
            </div>
          )}

          {/* Técnico y comisión: siempre visible para que la OT no dependa de
              abrir el modal completo antes de poder asignar responsabilidad. */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Técnico y comisión</p>
              <p className="text-xs text-gray-500 mt-1">Asigna el responsable y define su comisión para esta reparación.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Técnico asignado</label>
              <select value={tecnicoIdForm} onChange={e => {
                const tecnico = usuarios.find(u => u.id === e.target.value)
                setTecnicoIdForm(e.target.value)
                setTecnicoForm(tecnico?.nombre ?? '')
              }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                <option value="">Asignar técnico…</option>
                {usuarios.filter(u => u.activo).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span>
                <span className="block text-xs font-medium text-gray-700">Aplicar comisión técnica</span>
                <span className="block text-[11px] text-gray-400 mt-0.5">Ingresa el valor bruto de la parte comisionable.</span>
              </span>
              <input type="checkbox" checked={comisionActivaForm}
                onChange={e => setComisionActivaForm(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            </label>

            {comisionActivaForm && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Monto bruto comisionable</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input type="number" min="0" step="1" value={comisionBrutoForm}
                      onChange={e => setComisionBrutoForm(e.target.value)} placeholder="Ej: 100000"
                      className="w-full border border-gray-200 rounded-lg py-2 pl-7 pr-3 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Neto calculado: ${netoComisionableEstimado.toLocaleString('es-CL')}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Porcentaje de comisión</label>
                  <div className="relative">
                    <input type="number" min="0" max="100" step="0.01" value={comisionPorcentajeForm}
                      onChange={e => setComisionPorcentajeForm(e.target.value)} placeholder="Ej: 20"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center justify-between gap-3">
                  <span>Comisión estimada</span>
                  <strong>${montoComisionEstimado.toLocaleString('es-CL')}</strong>
                </div>
              </div>
            )}

            {o.comisionTecnicaMonto != null && (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {o.venta_id ? 'Comisión registrada: ' : 'Comisión estimada: '}<strong>${Math.round(o.comisionTecnicaMonto).toLocaleString('es-CL')}</strong>
                {o.comisionTecnicaBase != null && <> sobre ${Math.round(o.comisionTecnicaBase).toLocaleString('es-CL')} netos.</>}
                {!o.venta_id && <span className="block mt-1 text-emerald-700/80">Se confirmará al registrar la venta.</span>}
              </div>
            )}

            {o.comisionTecnicaMonto != null && o.venta_id && (
              o.comisionTecnicaPagada ? (
                <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800 border border-green-100">
                  Comisión pagada{ o.comisionTecnicaPagadaAt ? ` el ${fmtFecha(o.comisionTecnicaPagadaAt)}` : '' }. El gasto quedó registrado en Comisiones.
                </div>
              ) : esAdmin ? (
                <button type="button" onClick={() => setPagoComisionOpen(true)}
                  className="w-full rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 transition">
                  Marcar comisión como pagada
                </button>
              ) : (
                <p className="text-[11px] text-amber-700 rounded-lg bg-amber-50 px-3 py-2">Pendiente de pago por administración.</p>
              )
            )}

            <button onClick={() => void guardarTecnicoYComision()} disabled={guardandoTecnico || actualizarOrden.isPending}
              className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60 transition">
              {guardandoTecnico ? 'Guardando…' : 'Guardar asignación'}
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:mt-auto">
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {fmtFecha(o.fecha)}
            </p>
          </div>
        </div>

        {/* ── Col 2: Repuestos (destacado) + Checklist + Inspección + Fotos ── */}
        <div className="w-full md:flex-1 border-b md:border-b-0 md:border-r border-gray-200 md:overflow-y-auto flex flex-col">

          {/* ── REPUESTOS — sección principal ── */}
          <div className="p-5 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-gray-800">Repuestos</span>
                {(o.repuestos ?? []).length > 0 && (
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {(o.repuestos ?? []).length}
                  </span>
                )}
              </div>
              <button onClick={abrirRepModal}
                className="text-[11px] font-semibold text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition">
                + Agregar
              </button>
            </div>

            {(o.repuestos ?? []).length > 0 ? (
              <div className="space-y-2">
                {(o.repuestos ?? []).map((r, i) => (
                  <div key={r.productId ?? i} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3 group">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{r.productId ? 'Del inventario' : 'Ingreso manual'}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-800"><Money value={r.precio * (r.qty ?? 1)} /></p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-[10px] text-gray-400">{r.qty ?? 1} × $</span>
                          <input
                            type="number"
                            min="0"
                            aria-label={`Precio unitario de ${r.name}`}
                            value={repPreciosEditando[i] ?? String(r.precio)}
                            onChange={e => setRepPreciosEditando(prev => ({ ...prev, [i]: e.target.value }))}
                            onBlur={() => void guardarPrecioRepuesto(i)}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            className="w-24 text-right text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus:border-blue-400"
                          />
                        </div>
                      </div>
                      <button onClick={() => eliminarRepuesto(i)}
                        className="w-6 h-6 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
                          <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3">
                  <span className="text-sm font-bold text-blue-800">Total repuestos</span>
                  <span className="text-lg font-extrabold text-blue-700">
                    <Money value={(o.repuestos ?? []).reduce((s, r) => s + r.precio * (r.qty ?? 1), 0)} />
                  </span>
                </div>
                <button onClick={abrirRepModal}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 rounded-xl text-xs font-medium text-gray-400 hover:border-blue-300 hover:text-blue-500 transition">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                  </svg>
                  Agregar otro repuesto
                </button>
              </div>
            ) : (
              <button onClick={abrirRepModal}
                className="w-full flex flex-col items-center gap-2 py-8 border border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-300 hover:text-blue-500 transition">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                </svg>
                <span className="text-sm">Sin repuestos — clic para agregar</span>
              </button>
            )}
          </div>

          {/* ── Checklist de ingreso (colapsable) ── */}
          <div className="border-b border-gray-200">
          {checkItems.length > 0 && (() => {
            const apagado = !!o.checkApagado
            const mojado = !!o.checkMojado
            const total = checkItems.length
            const resueltos = apagado ? total : checkItems.filter(c => c.estado).length
            const ninguno = !apagado && resueltos === 0
            const todos = apagado || resueltos === total
            return (
              <div>
                <button
                  onClick={() => setChecklistOpen(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">Checklist de ingreso</span>
                    {mojado && (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2.5s6 6.5 6 10.5a6 6 0 11-12 0c0-4 6-10.5 6-10.5z" /></svg>
                        Mojado
                      </span>
                    )}
                    {apagado && (
                      <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded-full">Apagado</span>
                    )}
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
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{resueltos}/{total}</span>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${checklistOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {checklistOpen && (
                  <div className="border border-gray-200 border-t-0 rounded-b-xl bg-white">
                    {/* Condición de llegada — registrada al ingreso, se muestra siempre. */}
                    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-50">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Llegó:</span>
                      {!apagado && !mojado && (
                        <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Enciende</span>
                      )}
                      {apagado && (
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Apagado</span>
                      )}
                      {mojado && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2.5s6 6.5 6 10.5a6 6 0 11-12 0c0-4 6-10.5 6-10.5z" /></svg>
                          Mojado
                        </span>
                      )}
                    </div>
                    {apagado && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100 px-4 py-2">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        No se prueban funciones (equipo apagado)
                      </div>
                    )}
                    <div className="divide-y divide-gray-50">
                      {checkItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                          <span className={`text-sm flex-1 ${item.estado && item.estado !== 'no_probado' ? 'text-gray-700' : 'text-gray-400'}`}>{item.label}</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <button type="button" disabled={apagado} onClick={() => setEstadoDetalle(i, 'ok')} title="Funciona"
                              className={`w-7 h-7 rounded-md flex items-center justify-center border transition disabled:opacity-40 ${item.estado === 'ok' ? 'bg-green-600 border-green-600' : 'bg-white border-gray-200'}`}>
                              <svg className={`w-3.5 h-3.5 ${item.estado === 'ok' ? 'stroke-white' : 'stroke-gray-300'}`} fill="none" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            </button>
                            <button type="button" disabled={apagado} onClick={() => setEstadoDetalle(i, 'no_funciona')} title="Falla"
                              className={`w-7 h-7 rounded-md flex items-center justify-center border transition disabled:opacity-40 ${item.estado === 'no_funciona' ? 'bg-red-500 border-red-500' : 'bg-white border-gray-200'}`}>
                              <svg className={`w-3.5 h-3.5 ${item.estado === 'no_funciona' ? 'stroke-white' : 'stroke-gray-300'}`} fill="none" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                            <button type="button" disabled={apagado} onClick={() => setEstadoDetalle(i, 'no_probado')} title="No se prueba"
                              className={`w-7 h-7 rounded-md flex items-center justify-center border transition text-sm font-bold leading-none disabled:opacity-40 ${item.estado === 'no_probado' ? 'bg-amber-400 border-amber-400 text-white' : 'bg-white border-gray-200 text-gray-300'}`}>
                              –
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden mr-3">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${total ? (resueltos / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 mr-3">{resueltos}/{total}</span>
                      <button
                        onClick={guardarChecklist}
                        disabled={actualizarOrden.isPending}
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
          </div>

          {/* ── Checklist de salida (mismos ítems que el de ingreso) ── */}
          <div className="border-b border-gray-200">
          {checkItemsSalida.length > 0 && (() => {
            const total = checkItemsSalida.length
            const resueltos = checkItemsSalida.filter(c => c.estado).length
            const ninguno = resueltos === 0
            const todos = resueltos === total
            return (
              <div>
                <button
                  onClick={() => setChecklistSalidaOpen(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">Checklist de salida</span>
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
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{resueltos}/{total}</span>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${checklistSalidaOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {checklistSalidaOpen && (
                  <div className="border border-gray-200 border-t-0 rounded-b-xl bg-white">
                    <div className="divide-y divide-gray-50">
                      {checkItemsSalida.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                          <span className={`text-sm flex-1 ${item.estado && item.estado !== 'no_probado' ? 'text-gray-700' : 'text-gray-400'}`}>{item.label}</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <button type="button" onClick={() => setEstadoSalida(i, 'ok')} title="Funciona"
                              className={`w-7 h-7 rounded-md flex items-center justify-center border transition ${item.estado === 'ok' ? 'bg-green-600 border-green-600' : 'bg-white border-gray-200'}`}>
                              <svg className={`w-3.5 h-3.5 ${item.estado === 'ok' ? 'stroke-white' : 'stroke-gray-300'}`} fill="none" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            </button>
                            <button type="button" onClick={() => setEstadoSalida(i, 'no_funciona')} title="Falla"
                              className={`w-7 h-7 rounded-md flex items-center justify-center border transition ${item.estado === 'no_funciona' ? 'bg-red-500 border-red-500' : 'bg-white border-gray-200'}`}>
                              <svg className={`w-3.5 h-3.5 ${item.estado === 'no_funciona' ? 'stroke-white' : 'stroke-gray-300'}`} fill="none" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                            <button type="button" onClick={() => setEstadoSalida(i, 'no_probado')} title="No se prueba"
                              className={`w-7 h-7 rounded-md flex items-center justify-center border transition text-sm font-bold leading-none ${item.estado === 'no_probado' ? 'bg-amber-400 border-amber-400 text-white' : 'bg-white border-gray-200 text-gray-300'}`}>
                              –
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden mr-3">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${total ? (resueltos / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 mr-3">{resueltos}/{total}</span>
                      <button
                        onClick={guardarChecklistSalida}
                        disabled={actualizarOrden.isPending}
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
          </div>

          {/* ── Inspección (abre modal) ── */}
          <div className="border-b border-gray-200">
            <button onClick={() => setShowInspeccion(true)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-gray-800">Inspección del equipo</span>
                {o.inspeccion
                  ? <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Registrada</span>
                  : <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Sin registrar</span>}
              </div>
              <span className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1">
                {o.inspeccion ? 'Ver / editar' : '+ Agregar'}
              </span>
            </button>

            {/* Preview compacto de lo guardado */}
            {o.inspeccion && (o.inspeccion.notas || (o.inspeccion.fotos?.length ?? 0) > 0) && (
              <button onClick={() => setShowInspeccion(true)} className="block w-full text-left px-5 pb-4">
                <div className="bg-gray-50 rounded-xl p-3.5 space-y-2.5 hover:bg-gray-100 transition">
                  {o.inspeccion.notas && (
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">{o.inspeccion.notas}</p>
                  )}
                  {(o.inspeccion.fotos?.length ?? 0) > 0 && (
                    <div className="grid grid-cols-5 gap-1.5">
                      {o.inspeccion.fotos!.slice(0, 5).map((src, i) => (
                        <div key={i} className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            )}
          </div>

          {/* ── Fotos de ingreso (colapsable) ── */}
          <div>
            <button onClick={() => setShowFotosIngreso(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-gray-800">Fotos de ingreso</span>
                {(o.photosIngreso?.length ?? 0) > 0 && (
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{o.photosIngreso!.length}</span>
                )}
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showFotosIngreso ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showFotosIngreso && (
              <div className="px-5 pb-4 space-y-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowQrIngreso(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-100 transition">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM17 17v3M14 17h.01" />
                    </svg>
                    QR iPhone
                  </button>
                  {(!o.photosIngreso || o.photosIngreso.length < 6) && (
                    <button type="button" onClick={() => fileRefIngreso.current?.click()}
                      className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition">
                      + Subir
                    </button>
                  )}
                  <input ref={fileRefIngreso} type="file" accept="image/*" multiple className="hidden" onChange={handleFotosIngreso} />
                </div>
                {o.photosIngreso && o.photosIngreso.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {o.photosIngreso.map((src, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 group">
                        <img src={src} alt="" onClick={() => setLightbox(src)} className="w-full h-full object-cover cursor-pointer" />
                        <button onClick={() => eliminarFotoIngreso(i)} disabled={guardandoIngreso}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Sin fotos de ingreso.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Col 3: Pipeline + Acciones ── */}
        <div className="w-full md:w-64 md:flex-shrink-0 bg-slate-50/70 p-3 flex flex-col gap-3 md:overflow-y-auto">
          {/* Pipeline vertical */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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

          {/* Fecha estimada: el técnico y su comisión viven junto al estado
              físico, donde se gestiona la reparación. */}
          {o.fechaEstimada && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Entrega estimada</p>
                <p className="text-sm text-gray-700">{fmtFecha(o.fechaEstimada)}</p>
              </div>
            </div>
          )}

          {/* Notificaciones */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:mt-auto space-y-2">
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
              <button
                onClick={enviarEmailDirecto}
                disabled={enviandoEmailDirecto || emailOkDirecto}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition text-sm font-medium text-blue-800 disabled:opacity-60"
              >
                {emailOkDirecto ? (
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
                <span>{emailOkDirecto ? 'Email enviado' : enviandoEmailDirecto ? 'Enviando…' : 'Enviar email'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-400">Sin email</div>
            )}
            {/* Bloque de aprobación */}
            <div className="mt-2">
              {o.aprobacion_estado === 'aprobado' ? (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-green-50 border border-green-200">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-green-800">Aprobado por cliente</p>
                    {o.aprobacion_fecha && (
                      <p className="text-[10px] text-green-600 mt-0.5">{new Date(o.aprobacion_fecha).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    )}
                  </div>
                </div>
              ) : o.aprobacion_estado === 'rechazado' ? (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-red-800">Rechazado por cliente</p>
                    <button onClick={() => void solicitarAprobacion()} className="text-[10px] text-red-600 underline mt-0.5">Reenviar solicitud</button>
                  </div>
                </div>
              ) : o.aprobacion_estado === 'pendiente' ? (
                <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <p className="text-xs font-semibold text-amber-800">Aprobación pendiente</p>
                  </div>
                  {o.aprobacion_enviado && (
                    <p className="text-[10px] text-amber-600 mb-1.5">Enviada {new Date(o.aprobacion_enviado).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  )}
                  <button onClick={() => void solicitarAprobacion()} disabled={aprobEnviando || !o.email}
                    className="w-full text-[11px] font-semibold text-amber-800 bg-transparent border border-amber-300 rounded-lg py-1.5 hover:bg-amber-100 disabled:opacity-50 transition">
                    {aprobEnviando ? 'Enviando…' : 'Reenviar solicitud'}
                  </button>
                </div>
              ) : o.email ? (
                <button onClick={() => void solicitarAprobacion()} disabled={aprobEnviando}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-60 transition">
                  {aprobEnviando ? (
                    <span>Enviando…</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
                      </svg>
                      Solicitar aprobación
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-400">
                  Sin email — no se puede solicitar aprobación
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal subestado al poner Listo / Entregado */}
      {pendingEstado && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Mover a <span className="text-blue-600">{pendingEstado}</span></h3>
              <p className="text-xs text-gray-400 mt-0.5">¿Cuál fue el resultado de la reparación?</p>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {([
                { label: 'Reparado',          icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'Sin solución',       icon: 'M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'No reparado',        icon: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'No presento falla',  icon: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
              ] as const).map(({ label, icon }) => (
                <button key={label} onClick={() => void cambiarEstadoConSubestado(pendingEstado, label)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition">
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                  {label}
                </button>
              ))}
            </div>
            <div className="px-3 pb-3">
              <button onClick={() => setPendingEstado(null)}
                className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal notificación al cambiar estado */}
      {notif && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Orden movida a <span className="text-blue-600">{notif.estado}</span></h3>
              <p className="text-xs text-gray-400 mt-0.5">¿Notificar al cliente?</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {emailOk && o.email && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-green-800">Email enviado al cliente</p>
                    <p className="text-[11px] text-green-600 truncate">{o.email}</p>
                  </div>
                </div>
              )}
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
                      {emailOk ? 'Email enviado' : enviandoEmail ? 'Enviando…' : 'Enviar por email'}
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
      {/* QR fotos de ingreso */}
      {showQrIngreso && o.id && (
        <QrFotosModal ordenId={o.id} tipo="ingreso" onClose={() => setShowQrIngreso(false)} />
      )}

      {/* Modal derivar a técnico externo */}
      {showDerivar && (
        <DerivarModal orden={o} onClose={() => setShowDerivar(false)} />
      )}

      {/* Modal inspección del equipo */}
      {showInspeccion && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowInspeccion(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900">Inspección del equipo</h3>
                <p className="text-xs text-gray-400 truncate">{o.modelo}{o.num ? ` · Orden #${o.num}` : ''}{o.nombre ? ` · ${[o.nombre, o.apellido].filter(Boolean).join(' ')}` : ''}</p>
              </div>
              <button onClick={() => setShowInspeccion(false)} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5">
              {/* Diagnóstico de apertura */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Diagnóstico de apertura</label>
                <textarea value={inspecNotas} onChange={e => { const v = e.target.value; setInspecNotas(v.charAt(0).toUpperCase() + v.slice(1)) }}
                  placeholder="Describe lo que encontraste al abrir el equipo: humedad, sulfatación, golpes internos…" rows={4}
                  autoCapitalize="sentences"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none leading-relaxed" />
              </div>

              {/* Fotos */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-semibold text-gray-600">Fotos <span className="text-gray-400 font-normal">({inspecFotos.length}/6)</span></label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShowQrInspec(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-100 transition">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM17 17v3M14 17h.01" />
                      </svg>
                      QR iPhone
                    </button>
                    {inspecFotos.length < 6 && (
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16"/></svg>
                        Subir
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFotosInspec} />
                </div>
                {inspecFotos.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {inspecFotos.map((src, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                        <img src={src} alt="" onClick={() => setLightbox(src)} className="w-full h-full object-cover cursor-pointer" />
                        <button onClick={() => setInspecFotos(f => f.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-1.5 text-gray-400">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-xs">Sin fotos · usa QR iPhone o Subir</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2.5 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowInspeccion(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                Cancelar
              </button>
              <div className="flex-1" />
              <button onClick={guardarInspeccion} disabled={guardandoInspec || enviandoInspec}
                className="px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-60 transition">
                {guardandoInspec ? 'Guardando…' : 'Guardar'}
              </button>
              {(o.tel || o.email) && (
                <div ref={reenviarRef} className="relative">
                  <button
                    onClick={() => setReenviarOpen(v => !v)}
                    disabled={guardandoInspec || enviandoInspec}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-60 transition">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    {enviandoInspec ? 'Enviando…' : 'Reenviar'}
                    <svg className={`w-3 h-3 transition-transform ${reenviarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  {reenviarOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
                      {o.tel && (
                        <button
                          onClick={() => { setReenviarOpen(false); void guardarYEnviarInspeccion('whatsapp') }}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition border-b border-gray-100">
                          <svg className="w-4 h-4 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.123 1.532 5.855L.057 23.01a.75.75 0 0 0 .931.931l5.163-1.476A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.68-.524-5.2-1.435l-.373-.222-3.865 1.105 1.105-3.851-.24-.386A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                          Por WhatsApp
                        </button>
                      )}
                      {o.email && (
                        <button
                          onClick={() => { setReenviarOpen(false); void guardarYEnviarInspeccion('correo') }}
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
        </div>
      )}

      {/* Toast de aprobación */}
      {aprobMsg && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[400] max-w-sm">
          <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
            aprobMsg.type === 'ok' ? 'bg-green-600 text-white border-green-700' : 'bg-red-600 text-white border-red-700'
          }`}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              {aprobMsg.type === 'ok'
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />}
            </svg>
            <span>{aprobMsg.msg}</span>
            <button onClick={() => setAprobMsg(null)} className="ml-1 opacity-70 hover:opacity-100 flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Modal repuestos — búsqueda de inventario */}
      {showRepModal && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRepModal(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-800">Agregar repuesto</p>
                <p className="text-xs text-gray-400 mt-0.5">Busca en inventario o ingresa manual</p>
              </div>
              <button onClick={() => setShowRepModal(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Toggle manual */}
            <div className="px-5 pt-3 pb-2 flex gap-2">
              <button onClick={() => setRepManual(false)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${!repManual ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                Inventario
              </button>
              <button onClick={() => { setRepManual(true); setRepSelected(null) }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${repManual ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                Manual
              </button>
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto px-5 pb-3">
              {repManual ? (
                /* Modo manual */
                <div className="space-y-2 pt-1">
                  <input autoFocus value={repManualNombre} onChange={e => setRepManualNombre(e.target.value)}
                    placeholder="Nombre del repuesto"
                    className="w-full text-base md:text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400" />
                  <div className="flex gap-2">
                    <input value={repQty} onChange={e => setRepQty(e.target.value)}
                      type="number" min="1" placeholder="Cant."
                      className="w-20 text-base md:text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400" />
                    <input value={repPrecio} onChange={e => setRepPrecio(e.target.value)}
                      type="number" min="0" placeholder="Precio unitario"
                      className="flex-1 text-base md:text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400" />
                  </div>
                </div>
              ) : (
                /* Modo inventario */
                <div className="pt-1">
                  {/* Buscador */}
                  <div className="relative mb-3">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input autoFocus value={repSearch} onChange={e => { setRepSearch(e.target.value); setRepSelected(null) }}
                      placeholder="Buscar producto por nombre o SKU…"
                      className="w-full text-base md:text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-blue-400" />
                  </div>

                  {/* Lista de resultados */}
                  {repSearch.trim().length > 0 && !repSelected && (() => {
                    const results = repResultados
                    return results.length > 0 ? (
                      <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                        {results.map((p, i) => {
                          const stk = stockTotal(p)
                          return (
                            <button key={p.id} onClick={() => seleccionarProducto(p)}
                              className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition ${i > 0 ? 'border-t border-gray-100' : ''} ${p.tipo !== 'servicio' && stk === 0 ? 'opacity-50' : ''}`}>
                              <div className="text-sm font-medium text-gray-800 truncate">{p.nombre}</div>
                              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                                {p.tipo === 'servicio'
                                  ? <span className="text-violet-600">Servicio · sin control de stock</span>
                                  : <span className={stk > 0 ? 'text-green-600' : 'text-red-500'}>Stock: {stk}</span>
                                }
                                {p.precio_venta ? <span>· ${p.precio_venta.toLocaleString('es-CL')}</span> : null}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-3">Sin resultados</p>
                    )
                  })()}

                  {/* Producto seleccionado */}
                  {repSelected && (
                    <div className="border border-green-200 bg-green-50 rounded-xl p-4 mb-3">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-green-800">{repSelected.nombre}</p>
                          {repSelected.tipo === 'servicio'
                            ? <p className="text-xs text-violet-600 mt-0.5">Servicio · sin control de stock</p>
                            : <p className="text-xs text-green-600 mt-0.5">Stock disponible: {stockTotal(repSelected)} unidades</p>
                          }
                          {repSelected.tipo !== 'servicio' && stockTotal(repSelected) === 0 && (
                            <p className="text-xs font-semibold text-red-600 mt-1">Advertencia: este producto no tiene stock disponible.</p>
                          )}
                        </div>
                        <button onClick={() => { setRepSelected(null); setRepSearch('') }}
                          className="text-green-400 hover:text-green-600 transition">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500 font-medium block mb-1">Cantidad</label>
                          <input value={repQty} onChange={e => setRepQty(e.target.value)}
                            type="number" min="1" max={repSelected.tipo === 'servicio' ? undefined : stockTotal(repSelected)}
                            className="w-20 text-base md:text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400 bg-white" />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-500 font-medium block mb-1">Precio unitario</label>
                          <input value={repPrecio} onChange={e => setRepPrecio(e.target.value)}
                            type="number" min="0"
                            className="w-full text-base md:text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400 bg-white" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowRepModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button
                onClick={confirmarRepuesto}
                disabled={actualizarOrden.isPending || (!repManual && !repSelected) || (repManual && !repManualNombre.trim())}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition">
                {actualizarOrden.isPending ? 'Guardando…' : 'Agregar repuesto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  const lightboxEl = lightbox ? createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-4"
      onClick={() => setLightbox(null)}>
      <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
      <button onClick={() => setLightbox(null)}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white text-lg hover:bg-white/25 transition">✕</button>
    </div>,
    document.body,
  ) : null

  const pagoComisionEl = pagoComisionOpen ? (
    <PagoComisionModal
      tecnico={orden.tecnico ?? 'Técnico asignado'}
      monto={orden.comisionTecnicaMonto ?? 0}
      onClose={() => setPagoComisionOpen(false)}
      onConfirm={async ({ fecha, metodo }) => {
        await pagarComision.mutateAsync({ ordenId: orden.id, fecha, metodo })
        setPagoComisionOpen(false)
      }}
    />
  ) : null

  if (onClose) {
    return (
      <>
        {createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-2 md:px-4"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 0.5rem)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
          >
            {/* 90dvh (no vh): en mobile Safari con la barra de dirección visible,
                vh se calcula sobre el viewport "grande" (barra oculta) y la tarjeta
                queda más alta que el área visible real, perdiendo el margen/redondeo
                contra el status bar. */}
            <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col overflow-hidden"
              style={{ height: '90dvh' }}>
              {content}
            </div>
          </div>,
          document.body,
        )}
        {lightboxEl}
        {pagoComisionEl}
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {content}
      </div>
      {lightboxEl}
      {pagoComisionEl}
    </>
  )
}

function PagoComisionModal({ tecnico, monto, onClose, onConfirm }: {
  tecnico: string
  monto: number
  onClose: () => void
  onConfirm: (data: { fecha: string; metodo: string }) => Promise<void>
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [metodo, setMetodo] = useState('Transferencia')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    setGuardando(true)
    setError('')
    try {
      await onConfirm({ fecha, metodo })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.')
      setGuardando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div><p className="text-base font-bold text-gray-900">Registrar pago de comisión</p><p className="text-xs text-gray-500 mt-1">{tecnico}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 flex justify-between items-center"><span className="text-xs font-semibold text-green-800">Monto a pagar</span><strong className="text-lg text-green-700">${Math.round(monto).toLocaleString('es-CL')}</strong></div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1.5">Método de pago</label><select value={metodo} onChange={e => setMetodo(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Cheque</option></select></div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1.5">Fecha de pago</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
          <p className="text-[11px] leading-relaxed text-gray-500">Al confirmar, Pixit marcará la comisión como pagada y creará el gasto en la categoría Comisiones.</p>
          {error && <p className="text-xs text-red-600 rounded-lg bg-red-50 p-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 bg-gray-50 border-t border-gray-100 px-5 py-4"><button onClick={onClose} disabled={guardando} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">Cancelar</button><button onClick={() => void confirmar()} disabled={guardando} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">{guardando ? 'Registrando…' : 'Confirmar pago'}</button></div>
      </div>
    </div>,
    document.body,
  )
}
