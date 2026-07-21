import { supabase } from './supabase'
import { dbGet } from './db'
import type { SmtpConfig, EmailDomain } from '@/types'

interface TpConfig {
  nombre?: string
  from_email?: string
  email?: string
}

export interface SendEmailResult {
  ok: boolean
  error?: string
}

// Envía un correo reutilizando la MISMA Edge Function `send-email` y la misma
// configuración (dominio Resend verificado o SMTP/Resend manual) del ERP vanilla.
export async function sendEmail(
  empresaId: string,
  to: string,
  subject: string,
  bodyHtml: string,
): Promise<SendEmailResult> {
  const [cfg, tpCfg, dom, resendKey] = await Promise.all([
    dbGet<SmtpConfig>(empresaId, 'tp_smtp_config'),
    dbGet<TpConfig>(empresaId, 'tp_config'),
    dbGet<EmailDomain>(empresaId, 'tp_email_domain'),
    dbGet<string>(empresaId, 'resend_key'),
  ])

  // Prioridad 1: dominio verificado en Resend → enviar vía Resend
  if (dom?.status === 'verified' && dom.from_email) {
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to, subject, html: bodyHtml,
          from: dom.from_email,
          from_name: dom.from_name || tpCfg?.nombre || 'Taller',
        },
      })
      if (error) return { ok: false, error: error.message }
      return (data as SendEmailResult) ?? { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  // Prioridad 2: SMTP / Resend manual (legacy)
  const fromEmail = cfg?.from_email || tpCfg?.from_email || tpCfg?.email || 'onboarding@resend.dev'
  // "Pixit" es el respaldo neutral cuando la empresa no puso su propio nombre de
  // taller — antes decía "Steve Docs" a secas, el taller de Esteban, hardcodeado
  // como si fuera el default de cualquier cliente nuevo de la plataforma.
  const fromName = cfg?.from_name || tpCfg?.nombre || 'Pixit'
  try {
    const body: Record<string, unknown> = { to, subject, html: bodyHtml, from: fromEmail, from_name: fromName }
    if (cfg?.host && cfg?.user && cfg?.password) {
      body.smtp = {
        host: cfg.host,
        port: Number(cfg.port) || 465,
        secure: cfg.secure ?? true,
        user: cfg.user,
        password: cfg.password,
      }
    }
    if (resendKey) body.resend_api_key = resendKey
    const { data, error } = await supabase.functions.invoke('send-email', { body })
    if (error) return { ok: false, error: error.message }
    return (data as SendEmailResult) ?? { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Indica si un correo enviado con sendEmail() de verdad llega a una casilla que
// la empresa lee (dominio propio verificado, o SMTP/Resend manual con su email
// real) — o si va a salir del remitente genérico de respaldo (onboarding@resend.dev,
// que nadie del taller revisa). Los templates usan esto para no invitar al
// cliente a "responder este correo" cuando esa respuesta se perdería.
export async function puedeResponderCorreo(empresaId: string): Promise<boolean> {
  const [cfg, dom] = await Promise.all([
    dbGet<SmtpConfig>(empresaId, 'tp_smtp_config'),
    dbGet<EmailDomain>(empresaId, 'tp_email_domain'),
  ])
  if (dom?.status === 'verified' && dom.from_email) return true
  return !!(cfg?.from_email && cfg?.host && cfg?.user && cfg?.password)
}

// ── Helpers compartidos ────────────────────────────────────────────────────────
const ICONS_URL = 'https://estebanromeroduarte91-pixel.github.io/modulo-compras/icons'

const SECTION_ICONS: Record<string, { bg: string; file: string }> = {
  equipo:    { bg: '#ecefff', file: 'device.svg' },
  cliente:   { bg: '#ecfdf5', file: 'person.svg' },
  sucursal:  { bg: '#f3f0ff', file: 'pin.svg' },
  checklist: { bg: '#fffbeb', file: 'checklist.svg' },
  fotos:     { bg: '#f0f4ff', file: 'camera.svg' },
  orden:     { bg: '#ecefff', file: 'order.svg' },
  presupuesto: { bg: '#fffbeb', file: 'bag.svg' },
}

function secIcon(titulo: string): string {
  const key = Object.keys(SECTION_ICONS).find(k => titulo.toLowerCase().includes(k)) ?? 'equipo'
  const ic = SECTION_ICONS[key]
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #e8edf5;width:100%"><tr>
    <td style="width:32px;vertical-align:middle">
      <table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:32px;height:32px;background:${ic.bg};border-radius:9px;text-align:center;vertical-align:middle">
        <img src="${ICONS_URL}/${ic.file}" width="15" height="15" alt="" style="display:block;margin:8px auto">
      </td></tr></table>
    </td>
    <td style="padding-left:10px;vertical-align:middle">
      <span style="font-size:11px;font-weight:800;color:#374151;letter-spacing:.7px;text-transform:uppercase">${titulo}</span>
    </td>
  </tr></table>`
}

function campo(label: string, valor: string): string {
  return `<p style="font-size:11px;color:#6b7280;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px">${label}</p>
          <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 10px">${valor || '—'}</p>`
}

function campo2col(izq: [string, string], der: [string, string]): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>
    <td style="width:50%;padding:0 8px 10px 0;vertical-align:top">
      <p style="font-size:11px;color:#6b7280;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px">${izq[0]}</p>
      <p style="font-size:13px;font-weight:600;color:#111827;margin:0">${izq[1] || '—'}</p>
    </td>
    <td style="width:50%;padding:0 0 10px 0;vertical-align:top">
      <p style="font-size:11px;color:#6b7280;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px">${der[0]}</p>
      <p style="font-size:13px;font-weight:600;color:#111827;margin:0">${der[1] || '—'}</p>
    </td>
  </tr></table>`
}

function msgToHtml(texto: string): string {
  return texto.replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
}

function emailHeader(tallerNombre: string, logoUrl?: string): string {
  return logoUrl
    ? `<tr><td style="background:#ffffff;border-bottom:1px solid #e5e7eb;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center">
        <img src="${logoUrl}" style="max-width:200px;max-height:72px;object-fit:contain;display:block;margin:0 auto" alt="${tallerNombre}">
      </td></tr>`
    : `<tr><td style="background:#3656e6;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center">
        <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px">${tallerNombre}</h2>
      </td></tr>`
}

function emailShell(tallerNombre: string, logoUrl: string | undefined, body: string, footerHtml?: string): string {
  const footer = footerHtml ?? `<p style="font-size:12px;color:#9ca3af;margin:0">${tallerNombre} · Mensaje generado automáticamente</p>`
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%">
  ${emailHeader(tallerNombre, logoUrl)}
  <tr><td style="background:#ffffff;padding:32px 40px">${body}</td></tr>
  <tr><td style="background:#f8fafc;border-radius:0 0 16px 16px;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`
}

// Pills de contacto (tel WA + email) para sección sucursal
function contactPills(tel?: string, email?: string, ordenNum?: string | number): string {
  if (!tel && !email) return ''
  const telLimpio = (tel ?? '').replace(/\s/g, '')
  
  const waUrl = ordenNum 
    ? `https://wa.me/${telLimpio}?text=${encodeURIComponent(`Hola, quiero información sobre la orden #${String(ordenNum).padStart(4, '0')}`)}`
    : `https://wa.me/${telLimpio}`

  const waPill = telLimpio ? `
    <td style="padding-right:8px">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center;">
            <a href="${waUrl}" target="_blank" style="display:inline-block;padding:7px 12px;text-decoration:none;color:#15803d;font-size:12px;font-weight:700;">
              <img src="https://img.icons8.com/color/48/whatsapp--v1.png" width="14" height="14" style="vertical-align:middle;margin-right:6px;border:0" alt="WA">
              <span style="vertical-align:middle">${telLimpio}</span>
            </a>
          </td>
        </tr>
      </table>
    </td>` : ''

  const emailPill = email ? `
    <td>
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;text-align:center;">
            <a href="mailto:${email}" target="_blank" style="display:inline-block;padding:7px 12px;text-decoration:none;color:#1d4ed8;font-size:12px;font-weight:700;">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Email_icon.svg/150px-Email_icon.svg.png" width="14" height="14" style="vertical-align:middle;margin-right:6px;border:0" alt="Email">
              <span style="vertical-align:middle">${email}</span>
            </a>
          </td>
        </tr>
      </table>
    </td>` : ''

  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px"><tr>${waPill}${emailPill}</tr></table>`
}

// ── Email: Ingreso de orden ────────────────────────────────────────────────────
interface IngresoEmailData {
  tallerNombre: string
  logoUrl?: string
  msgTexto: string
  orden: { num: string | number; modelo: string; color?: string; serie?: string; estadoFisico?: string; trabajo?: string; nombre: string; rut?: string; tel?: string; email: string }
  branchNombre: string
  branchDir?: string
  branchTel?: string
  branchEmail?: string
  fotos?: string[]
}

export function buildEmailIngreso(d: IngresoEmailData): string {
  const fotosHtml = d.fotos?.length
    ? `<div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px;border:1px solid #eef0f5">
        ${secIcon('Fotos de ingreso')}
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%">
          ${chunk(d.fotos, 2).map(row => `<tr>${row.map(src => `<td style="width:50%;padding:4px"><a href="${src}" target="_blank" style="display:block"><img src="${src}" width="240" style="width:100%;border-radius:8px;border:1px solid #e5e7eb;display:block"></a></td>`).join('')}</tr>`).join('')}
        </table>
        <p style="font-size:11px;color:#9ca3af;margin:10px 0 0">Toca una foto para verla en tamaño completo.</p>
      </div>` : ''

  const body = `
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 28px">${msgToHtml(d.msgTexto)}</p>

    <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px;border:1px solid #eef0f5">
      ${secIcon('Datos del equipo')}
      ${campo2col(['Modelo', d.orden.modelo], ['Color', d.orden.color ?? ''])}
      ${campo('N° Serie / IMEI', d.orden.serie ?? '')}
      ${d.orden.estadoFisico ? campo('Estado físico', d.orden.estadoFisico) : ''}
      ${campo('Falla reportada', d.orden.trabajo ?? '')}
    </div>

    <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px;border:1px solid #eef0f5">
      ${secIcon('Datos del cliente')}
      ${campo2col(['Nombre', d.orden.nombre], ['RUT', d.orden.rut ?? ''])}
      ${campo2col(['Teléfono', d.orden.tel ?? ''], ['Correo', d.orden.email])}
    </div>

    <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px;border:1px solid #eef0f5">
      ${secIcon('Sucursal asignada')}
      ${campo2col(['Sucursal', d.branchNombre], ['Dirección', d.branchDir ?? ''])}
      ${contactPills(d.branchTel, d.branchEmail, d.orden.num)}
    </div>

    ${fotosHtml}

    <div style="background:#f0f4ff;border-left:3px solid #3656e6;border-radius:0 10px 10px 0;padding:12px 16px;margin:4px 0 24px">
      <p style="font-size:13px;color:#374151;line-height:1.6;margin:0"><strong>Nota:</strong> Cualquier trabajo adicional será consultado contigo antes de realizarlo.</p>
    </div>`

  const footer = `<p style="font-size:12px;color:#9ca3af;margin:0"><strong style="color:#6b7280">${d.tallerNombre}</strong>${d.branchNombre && d.branchNombre !== d.tallerNombre ? ' · ' + d.branchNombre : ''}${d.branchDir ? ' · ' + d.branchDir : ''}</p>
    <p style="font-size:12px;color:#d1d5db;margin:6px 0 0">Correo generado automáticamente desde el sistema de gestión.</p>`

  return emailShell(d.tallerNombre, d.logoUrl, body, footer)
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Email: Listo / Entregado ───────────────────────────────────────────────────
interface ListoEmailData {
  tallerNombre: string
  logoUrl?: string
  msgTexto: string
  orden: { num: string | number; modelo: string; nombre: string }
  branchNombre: string
  horario?: string
  // false cuando el correo sale del remitente genérico de respaldo (sin dominio
  // propio ni SMTP configurado) — nadie del taller lee esa casilla, así que no
  // se invita al cliente a responder ahí. Ver puedeResponderCorreo().
  puedeResponder?: boolean
}

export function buildEmailListo(d: ListoEmailData): string {
  const body = `
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 28px">${msgToHtml(d.msgTexto)}</p>
    <div style="background:#f8fafc;border-radius:12px;padding:20px 24px;margin-bottom:24px;border:1px solid #eef0f5">
      ${secIcon('Detalle de la orden')}
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr>
          <td style="width:50%;padding:0 12px 12px 0;vertical-align:top">
            <p style="font-size:11px;color:#9ca3af;margin:0 0 3px;text-transform:uppercase;letter-spacing:.5px">Equipo</p>
            <p style="font-size:14px;font-weight:600;color:#111827;margin:0">${d.orden.modelo || '—'}</p>
          </td>
          <td style="width:50%;padding:0 0 12px 0;vertical-align:top">
            <p style="font-size:11px;color:#9ca3af;margin:0 0 3px;text-transform:uppercase;letter-spacing:.5px">N° Orden</p>
            <p style="font-size:14px;font-weight:600;color:#111827;margin:0">#OT-${String(d.orden.num).padStart(4, '0')}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 12px 0 0;vertical-align:top">
            <p style="font-size:11px;color:#9ca3af;margin:0 0 3px;text-transform:uppercase;letter-spacing:.5px">Sucursal</p>
            <p style="font-size:14px;font-weight:600;color:#111827;margin:0">${d.branchNombre || '—'}</p>
          </td>
          <td style="padding:0;vertical-align:top">
            <p style="font-size:11px;color:#9ca3af;margin:0 0 3px;text-transform:uppercase;letter-spacing:.5px">Horario</p>
            <p style="font-size:14px;font-weight:600;color:#111827;margin:0">${d.horario || '—'}</p>
          </td>
        </tr>
      </table>
    </div>
    <p style="font-size:13px;color:#6b7280;margin:0">${
      d.puedeResponder === false
        ? '¿Tienes alguna pregunta? Contáctanos por WhatsApp o en la sucursal — este correo es solo informativo.'
        : '¿Tienes alguna pregunta? Responde directamente a este correo.'
    }</p>`
  return emailShell(d.tallerNombre, d.logoUrl, body)
}

// ── Email: Inspección ─────────────────────────────────────────────────────────
interface InspeccionEmailData {
  tallerNombre: string
  logoUrl?: string
  msgTexto: string
  orden: { num: string | number; modelo: string; nombre: string; serie?: string }
  notas?: string
  fotos?: string[]
  puedeResponder?: boolean
}

export function buildEmailInspeccion(d: InspeccionEmailData): string {
  const fotosHtml = d.fotos?.length
    ? `<div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px;border:1px solid #eef0f5">
        ${secIcon('Fotos del equipo')}
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%">
          ${chunk(d.fotos, 2).map(row => `<tr>${row.map(src => `<td style="width:50%;padding:4px"><a href="${src}" target="_blank" style="display:block"><img src="${src}" width="240" style="width:100%;border-radius:8px;border:1px solid #e5e7eb;display:block"></a></td>`).join('')}</tr>`).join('')}
        </table>
        <p style="font-size:11px;color:#9ca3af;margin:10px 0 0">Toca una foto para verla en tamaño completo.</p>
      </div>` : ''

  const notasHtml = d.notas
    ? `<div style="background:#f8fafc;border:1px solid #eef0f5;border-radius:12px;padding:16px 18px;margin-bottom:20px">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e8edf5"><tr>
          <td style="width:32px;vertical-align:middle">
            <table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:32px;height:32px;background:#ecefff;border-radius:9px;text-align:center;vertical-align:middle">
              <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMzNjU2ZTYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI3Ii8+PHBhdGggZD0iTTIxIDIxbC00LjM1LTQuMzUiLz48L3N2Zz4=" width="16" height="16" alt="" style="display:block;margin:8px auto">
            </td></tr></table>
          </td>
          <td style="padding-left:10px;vertical-align:middle">
            <span style="font-size:11px;font-weight:800;color:#374151;letter-spacing:.7px;text-transform:uppercase">Estado del equipo</span>
          </td>
        </tr></table>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0">${d.notas.replace(/\n/g, '<br>')}</p>
      </div>` : ''

  const body = `
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 28px">${msgToHtml(d.msgTexto)}</p>
    <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px;border:1px solid #eef0f5">
      ${secIcon('Datos del equipo')}
      ${campo2col(['Equipo', d.orden.modelo], ['Cliente', d.orden.nombre])}
      ${d.orden.serie ? campo('N° Serie / IMEI', d.orden.serie) : ''}
      ${campo('N° Orden', `#OT-${String(d.orden.num).padStart(4, '0')}`)}
    </div>
    ${notasHtml}
    ${fotosHtml}
    <p style="font-size:13px;color:#6b7280;margin:0">${
      d.puedeResponder === false
        ? 'Cualquier consulta, contáctanos por WhatsApp o en la sucursal — este correo es solo informativo.'
        : 'Cualquier consulta puedes responder directamente a este correo.'
    }</p>`
  return emailShell(d.tallerNombre, d.logoUrl, body)
}

// ── Email: Aprobación de presupuesto ──────────────────────────────────────────
interface RepuestoItem { name?: string; precio?: number; qty?: number }
interface AprobacionEmailData {
  tallerNombre: string
  logoUrl?: string
  introTexto: string
  orden: { num: string | number; modelo: string; nombre: string; trabajo?: string }
  repuestos?: RepuestoItem[]
  presupuesto?: number
  link: string
}

export function buildEmailAprobacion(d: AprobacionEmailData): string {
  const total = d.repuestos?.length
    ? d.repuestos.reduce((s, r) => s + (r.precio ?? 0) * (r.qty ?? 1), 0)
    : (d.presupuesto ?? 0)

  const itemsHtml = d.repuestos?.length
    ? d.repuestos.map(r => `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:12px 0;vertical-align:top">
          <p style="font-size:14px;font-weight:700;color:#111827;margin:0">${r.name || '—'}</p>
          <p style="font-size:11px;color:#9ca3af;margin:3px 0 0">x${r.qty ?? 1} unidad${(r.qty ?? 1) > 1 ? 'es' : ''}</p>
        </td>
        <td style="padding:12px 0;text-align:right;vertical-align:top;white-space:nowrap">
          <p style="font-size:14px;font-weight:700;color:#111827;margin:0">$${((r.precio ?? 0) * (r.qty ?? 1)).toLocaleString('es-CL')}</p>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:12px 0;font-size:14px;color:#374151">${d.orden.trabajo || 'Trabajo a realizar'}</td></tr>`

  const body = `
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 28px">${msgToHtml(d.introTexto)}</p>

    <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;margin-bottom:14px;border:1px solid #eef0f5">
      ${secIcon('Datos de la orden')}
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr>
          <td style="width:50%;padding:0 12px 12px 0;vertical-align:top">
            <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin:0 0 3px">Cliente</p>
            <p style="font-size:14px;font-weight:700;color:#111827;margin:0">${d.orden.nombre || '—'}</p>
          </td>
          <td style="width:50%;padding:0 0 12px 0;vertical-align:top">
            <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin:0 0 3px">Equipo</p>
            <p style="font-size:14px;font-weight:700;color:#111827;margin:0">${d.orden.modelo || '—'}</p>
          </td>
        </tr>
        <tr>
          <td colspan="2">
            <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin:0 0 3px">N° Orden</p>
            <p style="font-size:14px;font-weight:700;color:#111827;margin:0">#OT-${String(d.orden.num).padStart(4, '0')}</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;margin-bottom:24px;border:1px solid #eef0f5">
      ${secIcon('Presupuesto a aprobar')}
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        ${itemsHtml}
        <tr>
          <td style="padding:14px 0 4px"><p style="font-size:13px;font-weight:700;color:#374151;margin:0">Total</p></td>
          <td style="padding:14px 0 4px;text-align:right"><p style="font-size:22px;font-weight:800;color:#3656e6;margin:0">$${total.toLocaleString('es-CL')}</p></td>
        </tr>
      </table>
      <p style="font-size:11px;color:#9ca3af;margin:4px 0 0">Precios incluyen IVA</p>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px">
      <tr><td style="background:#3656e6;border-radius:10px;padding:15px 32px;text-align:center">
        <a href="${d.link}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">Aprobar presupuesto</a>
      </td></tr>
    </table>
    <p style="color:#9ca3af;font-size:12px;margin:0">Si el botón no funciona, copia este enlace:<br><span style="color:#6b7280;word-break:break-all">${d.link}</span></p>`

  return emailShell(d.tallerNombre, d.logoUrl, body)
}

// URL de la página que sube fotos desde el iPhone. Ahora vive en el mismo deploy
// (public/foto-orden.html), así que usamos el origin actual y el QR queda en el
// dominio propio (pixit.cl) automáticamente. La página escribe las fotos directo
// en la tabla `ordenes`; el realtime de useOrdenes/OrdenModal las recibe.
export function urlFotosQR(empresaId: string, ordenId: string, tipo: 'ingreso' | 'inspeccion' | 'salida' | 'traslado' = 'ingreso'): string {
  return `${window.location.origin}/foto-orden.html?e=${empresaId}&o=${ordenId}&tipo=${tipo}`
}
