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

// URL de la página externa que sube fotos desde el iPhone (misma que el ERP vanilla).
// La página escribe las fotos directo en `tp_orders`; el realtime de useOrdenes las recibe.
export function urlFotosQR(empresaId: string, ordenId: string, tipo: 'ingreso' | 'inspeccion' | 'salida' | 'traslado' = 'ingreso'): string {
  return `https://erp-stevedocs.netlify.app/foto-orden.html?e=${empresaId}&o=${ordenId}&tipo=${tipo}`
}
