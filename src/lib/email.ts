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

// URL de la página externa que sube fotos desde el iPhone (misma que el ERP vanilla).
// La página escribe las fotos directo en `tp_orders`; el realtime de useOrdenes las recibe.
export function urlFotosQR(empresaId: string, ordenId: string, tipo: 'ingreso' | 'inspeccion' | 'salida' | 'traslado' = 'ingreso'): string {
  return `https://erp-stevedocs.netlify.app/foto-orden.html?e=${empresaId}&o=${ordenId}&tipo=${tipo}`
}
