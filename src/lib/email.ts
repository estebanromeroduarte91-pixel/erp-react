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

// ── HTML de ingreso (mismo diseño que el ERP vanilla) ─────────────────────────
interface IngresoEmailData {
  tallerNombre: string
  logoUrl?: string
  msgTexto: string        // texto plano del template ya relleno
  orden: { num: string | number; modelo: string; color?: string; serie?: string; estadoFisico?: string; trabajo?: string; nombre: string; rut?: string; tel?: string; email: string }
  branchNombre: string
  branchDir?: string
  fotos?: string[]
}

function fila(label: string, valor: string) {
  return `<p style="font-size:11px;color:#6b7280;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px">${label}</p>
          <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 10px">${valor || '—'}</p>`
}

export function buildEmailIngreso(d: IngresoEmailData): string {
  const msgHtml = d.msgTexto
    .replace(/\*([^*]+)\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>')

  const fotosHtml = d.fotos && d.fotos.length
    ? `<div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px">
        <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin:0 0 12px">Fotos de ingreso</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${d.fotos.map(src => `<img src="${src}" width="80" height="80" style="border-radius:8px;object-fit:cover;border:1px solid #e5e7eb">`).join('')}
        </div>
      </div>`
    : ''

  const header = d.logoUrl
    ? `<tr><td style="background:#ffffff;border-bottom:1px solid #e5e7eb;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center">
        <img src="${d.logoUrl}" style="max-width:200px;max-height:72px;object-fit:contain;display:block;margin:0 auto" alt="${d.tallerNombre}">
      </td></tr>`
    : `<tr><td style="background:#3656e6;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center">
        <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px">${d.tallerNombre}</h2>
      </td></tr>`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%">
  ${header}
  <tr><td style="background:#ffffff;padding:32px 40px">
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 28px">${msgHtml}</p>

    <!-- Equipo -->
    <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px">
      <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin:0 0 12px">Datos del equipo</p>
      ${fila('Modelo', d.orden.modelo)}
      ${fila('Color', d.orden.color || '')}
      ${fila('N° Serie / IMEI', d.orden.serie || '')}
      ${d.orden.estadoFisico ? fila('Estado físico', d.orden.estadoFisico) : ''}
      ${fila('Falla reportada', d.orden.trabajo || '')}
    </div>

    <!-- Cliente -->
    <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px">
      <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin:0 0 12px">Datos del cliente</p>
      ${fila('Nombre', d.orden.nombre)}
      ${fila('RUT', d.orden.rut || '')}
      ${fila('Teléfono', d.orden.tel || '')}
      ${fila('Correo', d.orden.email)}
    </div>

    <!-- Sucursal -->
    <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px">
      <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin:0 0 12px">Sucursal asignada</p>
      ${fila('Sucursal', d.branchNombre)}
      ${d.branchDir ? fila('Dirección', d.branchDir) : ''}
    </div>

    ${fotosHtml}

    <!-- Nota -->
    <div style="background:#f0f4ff;border-left:3px solid #3656e6;border-radius:0 10px 10px 0;padding:12px 16px;margin:4px 0 24px">
      <p style="font-size:13px;color:#374151;line-height:1.6;margin:0"><strong>Nota:</strong> Cualquier trabajo adicional será consultado contigo antes de realizarlo.</p>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8fafc;border-radius:0 0 16px 16px;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center">
    <p style="font-size:12px;color:#9ca3af;margin:0"><strong style="color:#6b7280">${d.tallerNombre}</strong>${d.branchNombre && d.branchNombre !== d.tallerNombre ? ' · ' + d.branchNombre : ''}${d.branchDir ? ' · ' + d.branchDir : ''}</p>
    <p style="font-size:12px;color:#d1d5db;margin:6px 0 0">Correo generado automáticamente desde el sistema de gestión.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

// ── Helpers compartidos ────────────────────────────────────────────────────────
function emailShell(tallerNombre: string, logoUrl: string | undefined, body: string, footer?: string): string {
  const header = logoUrl
    ? `<tr><td style="background:#ffffff;border-bottom:1px solid #e5e7eb;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center">
        <img src="${logoUrl}" style="max-width:200px;max-height:72px;object-fit:contain;display:block;margin:0 auto" alt="${tallerNombre}">
      </td></tr>`
    : `<tr><td style="background:#3656e6;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center">
        <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px">${tallerNombre}</h2>
      </td></tr>`
  const footerHtml = footer ?? `<p style="font-size:12px;color:#9ca3af;margin:0">${tallerNombre} · Mensaje generado automáticamente</p>`
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%">
  ${header}
  <tr><td style="background:#ffffff;padding:32px 40px">${body}</td></tr>
  <tr><td style="background:#f8fafc;border-radius:0 0 16px 16px;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center">${footerHtml}</td></tr>
</table>
</td></tr></table>
</body></html>`
}

function msgHtml(texto: string): string {
  return texto.replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
}

function seccion(titulo: string, filas: [string, string][]): string {
  return `<div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin-bottom:20px">
    <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin:0 0 12px">${titulo}</p>
    ${filas.map(([l, v]) => `<p style="font-size:11px;color:#6b7280;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px">${l}</p>
    <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 10px">${v || '—'}</p>`).join('')}
  </div>`
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
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 28px">${msgHtml(d.msgTexto)}</p>
    ${seccion('Detalle de la orden', [
      ['Equipo', d.orden.modelo],
      ['N° Orden', `#OT-${String(d.orden.num).padStart(4, '0')}`],
      ['Sucursal', d.branchNombre],
      ['Horario', d.horario ?? ''],
    ])}
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
    ? `<div style="margin-bottom:20px">
        <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin:0 0 12px">Fotos del equipo (${d.fotos.length})</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${d.fotos.map(src => `<img src="${src}" width="156" height="156" style="border-radius:10px;object-fit:cover;border:1px solid #e5e7eb">`).join('')}</div>
      </div>` : ''
  const notasHtml = d.notas
    ? `<div style="background:#f0f4ff;border-left:3px solid #3656e6;border-radius:0 12px 12px 0;padding:18px 20px;margin-bottom:20px">
        <p style="font-size:10px;font-weight:700;color:#3656e6;text-transform:uppercase;letter-spacing:.7px;margin:0 0 10px">Estado del equipo</p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0">${d.notas.replace(/\n/g, '<br>')}</p>
      </div>` : ''
  const body = `
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 28px">${msgHtml(d.msgTexto)}</p>
    ${seccion('Datos de la orden', [
      ['Equipo', d.orden.modelo],
      ['Cliente', d.orden.nombre],
      ...(d.orden.serie ? [['N° Serie / IMEI', d.orden.serie] as [string, string]] : []),
      ['N° Orden', `#OT-${String(d.orden.num).padStart(4, '0')}`],
    ])}
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
    ? d.repuestos.map(r => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#111827;font-weight:600">${r.name || '—'}<br><span style="font-size:11px;color:#9ca3af;font-weight:400">x${r.qty ?? 1}</span></td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;font-weight:700;color:#111827">$${((r.precio ?? 0) * (r.qty ?? 1)).toLocaleString('es-CL')}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:10px 0;font-size:14px;color:#374151">${d.orden.trabajo || 'Trabajo a realizar'}</td></tr>`
  const body = `
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 28px">${msgHtml(d.introTexto)}</p>
    ${seccion('Datos de la orden', [
      ['Cliente', d.orden.nombre],
      ['Equipo', d.orden.modelo],
      ['N° Orden', `#OT-${String(d.orden.num).padStart(4, '0')}`],
    ])}
    <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;margin-bottom:24px">
      <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin:0 0 12px">Presupuesto a aprobar</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        ${itemsHtml}
        <tr>
          <td style="padding:14px 0 4px;font-size:13px;font-weight:700;color:#374151">Total</td>
          <td style="padding:14px 0 4px;text-align:right;font-size:22px;font-weight:800;color:#3656e6">$${total.toLocaleString('es-CL')}</td>
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
