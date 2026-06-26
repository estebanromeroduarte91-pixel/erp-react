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
  const fromName = cfg?.from_name || tpCfg?.nombre || 'TallerPro'
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
function contactPills(tel?: string, email?: string): string {
  if (!tel && !email) return ''
  const telLimpio = (tel ?? '').replace(/\s/g, '')
  const waIcon = `<table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:22px;height:22px;background:#25d366;border-radius:5px;text-align:center;vertical-align:middle"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTE3LjQ3MiAxNC4zODJjLS4yOTctLjE0OS0xLjc1OC0uODY3LTIuMDMtLjk2Ny0uMjczLS4wOTktLjQ3MS0uMTQ4LS42Ny4xNS0uMTk3LjI5Ny0uNzY3Ljk2Ni0uOTQgMS4xNjQtLjE3My4xOTktLjM0Ny4yMjMtLjY0NC4wNzUtLjI5Ny0uMTUtMS4yNTUtLjQ2My0yLjM5LTEuNDc1LS44ODMtLjc4OC0xLjQ4LTEuNzYxLTEuNjUzLTIuMDU5LS4xNzMtLjI5Ny0uMDE4LS40NTguMTMtLjYwNi4xMzQtLjEzMy4yOTgtLjM0Ny40NDYtLjUyLjE0OS0uMTc0LjE5OC0uMjk4LjI5OC0uNDk3LjA5OS0uMTk4LjA1LS4zNzEtLjAyNS0uNTItLjA3NS0uMTQ5LS42NjktMS42MTItLjkxNi0yLjIwNy0uMjQyLS41NzktLjQ4Ny0uNS0uNjY5LS41MS0uMTczLS4wMDgtLjM3MS0uMDEtLjU3LS4wMS0uMTk4IDAtLjUyLjA3NC0uNzkyLjM3Mi0uMjcyLjI5Ny0xLjA0IDEuMDE2LTEuMDQgMi40NzkgMCAxLjQ2MiAxLjA2NSAyLjg3NSAxLjIxMyAzLjA3NC4xNDkuMTk4IDIuMDk2IDMuMiA1LjA3NyA0LjQ4Ny43MDkuMzA2IDEuMjYyLjQ4OSAxLjY5NC42MjUuNzEyLjIyNyAxLjM2LjE5NSAxLjg3MS4xMTguNTcxLS4wODUgMS43NTgtLjcxOSAyLjAwNi0xLjQxMy4yNDgtLjY5NC4yNDgtMS4yODkuMTczLTEuNDEzLS4wNzQtLjEyNC0uMjcyLS4xOTgtLjU3LS4zNDd6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJDNi40NzcgMiAyIDYuNDc3IDIgMTJjMCAxLjg5LjUyNSAzLjY2IDEuNDM4IDUuMTY4TDIgMjJsNC45ODctMS4zOTlBOS45NTQgOS45NTQgMCAwIDAgMTIgMjJjNS41MjMgMCAxMC00LjQ3NyAxMC0xMFMxNy41MjMgMiAxMiAyem0wIDE4Yy0xLjY2IDAtMy4yMDItLjQ5LTQuNDg5LTEuMzMzbC0uMzIyLS4xOS0zLjMuOTI0LjkxNi0zLjIyLS4yMS0uMzM4QTcuOTU3IDcuOTU3IDAgMCAxIDQgMTJjMC00LjQxOCAzLjU4Mi04IDgtOHM4IDMuNTgyIDggOC0zLjU4MiA4LTggOHoiLz48L3N2Zz4=" width="13" height="13" style="display:block;margin:4px auto"></td></tr></table>`
  const mailIcon = `<table cellpadding="0" cellspacing="0" border="0"><tr><td style="width:22px;height:22px;background:#3b82f6;border-radius:5px;text-align:center;vertical-align:middle"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iNCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxwYXRoIGQ9Im0yMiA3LTguOTcgNS43YTEuOTQgMS45NCAwIDAgMS0yLjA2IDBMMiA3Ii8+PC9zdmc+" width="13" height="13" style="display:block;margin:4px auto"></td></tr></table>`
  const pills = [
    telLimpio ? `<td style="padding-right:8px"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:7px 12px"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:middle;padding-right:7px">${waIcon}</td><td style="vertical-align:middle;font-size:12px;font-weight:700;color:#15803d">${telLimpio}</td></tr></table></td></tr></table></td>` : '',
    email ? `<td><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:7px 12px"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:middle;padding-right:7px">${mailIcon}</td><td style="vertical-align:middle;font-size:12px;font-weight:700;color:#1d4ed8">${email}</td></tr></table></td></tr></table></td>` : '',
  ].filter(Boolean).join('')
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px"><tr>${pills}</tr></table>`
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
      ${contactPills(d.branchTel, d.branchEmail)}
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
    <p style="font-size:13px;color:#6b7280;margin:0">¿Tienes alguna pregunta? Responde directamente a este correo.</p>`
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
    ? `<div style="background:#f0f4ff;border-left:3px solid #3656e6;border-radius:0 12px 12px 0;padding:18px 20px;margin-bottom:20px">
        <p style="font-size:10px;font-weight:700;color:#3656e6;text-transform:uppercase;letter-spacing:.7px;margin:0 0 10px">Estado del equipo</p>
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
    <p style="font-size:13px;color:#6b7280;margin:0">Cualquier consulta puedes responder directamente a este correo.</p>`
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

// URL de la página externa que sube fotos desde el iPhone (misma que el ERP vanilla).
// La página escribe las fotos directo en `tp_orders`; el realtime de useOrdenes las recibe.
export function urlFotosQR(empresaId: string, ordenId: string, tipo: 'ingreso' | 'inspeccion' | 'salida' | 'traslado' = 'ingreso'): string {
  return `https://erp-stevedocs.netlify.app/foto-orden.html?e=${empresaId}&o=${ordenId}&tipo=${tipo}`
}
