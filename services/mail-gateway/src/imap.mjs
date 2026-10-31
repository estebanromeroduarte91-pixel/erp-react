import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { resolvePublicSmtpHost } from './security.mjs'

export const ALLOWED_IMAP_PORTS = new Set([993])
// Al activar la casilla (o si el hosting reinicia los UID) se traen solo los
// últimos mensajes: importar años de correo llenaría la bandeja de ruido.
const INITIAL_MESSAGES = 10
const MAX_PER_FETCH = 30
// Un correo con adjuntos pesados se registra igual, pero sin descargarlo
// entero: el gateway no es un almacenamiento y el body HTTP tiene límite.
const MAX_SOURCE_BYTES = 3 * 1024 * 1024
const MAX_TEXT = 50_000
const MAX_HTML = 200_000

export function validateFetchPayload(payload) {
  const imap = payload?.imap
  const port = Number(imap?.port)
  if (!payload?.requestId || payload.requestId.length > 100) throw new Error('requestId no válido')
  if (!imap?.host || !ALLOWED_IMAP_PORTS.has(port)) throw new Error('Servidor o puerto IMAP no permitido')
  if (!String(imap.user ?? '').trim() || String(imap.user).length > 254 || !imap.password) {
    throw new Error('Credenciales IMAP incompletas')
  }
  for (const key of ['sinceUid', 'uidValidity']) {
    const value = payload[key]
    if (value != null && (!Number.isSafeInteger(Number(value)) || Number(value) < 0)) throw new Error(`${key} no válido`)
  }
}

// Se leen las líneas crudas y no `parsed.headers`: mailparser agrupa las
// cabeceras List-* en un objeto `list`, y `headers.get('list-id')` vuelve vacío.
function header(parsed, name) {
  const line = parsed.headerLines?.find(h => h.key === name)?.line ?? ''
  return line.slice(line.indexOf(':') + 1).trim()
}

// Respuestas automáticas, boletines y avisos de sistemas: no son un cliente
// escribiendo, y si entraran a la bandeja tapan las conversaciones reales.
// Se reportan igual (con `automatico: true`) para que Pixit decida.
export function esAutomatico(parsed) {
  const autoSubmitted = header(parsed, 'auto-submitted').toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (header(parsed, 'list-id') || header(parsed, 'list-unsubscribe')) return true
  if (/^(bulk|list|junk)$/i.test(header(parsed, 'precedence').trim())) return true
  if (header(parsed, 'x-autoreply') || header(parsed, 'x-autorespond')) return true
  const from = parsed.from?.value?.[0]?.address ?? ''
  return /^(no-?reply|mailer-daemon|postmaster|notificaciones?|notifications?)@/i.test(from)
}

function referencias(parsed) {
  const refs = parsed.references
  if (!refs) return ''
  return (Array.isArray(refs) ? refs : [refs]).join(' ')
}

function resumen(uid, parsed, size) {
  const from = parsed.from?.value?.[0] ?? {}
  return {
    uid,
    messageId: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
    references: referencias(parsed) || null,
    fromName: from.name || null,
    fromAddress: from.address ? String(from.address).toLowerCase() : null,
    replyTo: parsed.replyTo?.value?.[0]?.address?.toLowerCase() ?? null,
    to: parsed.to?.text ?? null,
    subject: parsed.subject ?? '',
    date: (parsed.date ?? new Date()).toISOString(),
    text: (parsed.text ?? '').slice(0, MAX_TEXT),
    html: typeof parsed.html === 'string' ? parsed.html.slice(0, MAX_HTML) : null,
    attachments: (parsed.attachments ?? []).map(a => ({
      filename: a.filename ?? null,
      contentType: a.contentType ?? null,
      size: a.size ?? null,
    })),
    automatico: esAutomatico(parsed),
    size,
  }
}

export async function fetchInbox(payload) {
  validateFetchPayload(payload)
  const { imap } = payload
  const resolved = await resolvePublicSmtpHost(imap.host)
  const client = new ImapFlow({
    // Igual que en el envío: se conecta a la IP ya validada (contra DNS
    // rebinding) y `servername` valida el certificado contra el hostname.
    host: resolved.address,
    port: Number(imap.port),
    secure: true,
    auth: { user: imap.user, pass: imap.password },
    tls: { servername: imap.host, minVersion: 'TLSv1.2' },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })

  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      const mailbox = client.mailbox
      const uidValidity = Number(mailbox.uidValidity)
      const uidNext = Number(mailbox.uidNext)
      const reinicio = payload.uidValidity == null || Number(payload.uidValidity) !== uidValidity || payload.sinceUid == null
      const desde = reinicio
        ? Math.max(1, uidNext - INITIAL_MESSAGES)
        : Number(payload.sinceUid) + 1

      if (desde >= uidNext) {
        return { ok: true, uidValidity, lastUid: reinicio ? uidNext - 1 : Number(payload.sinceUid), reset: reinicio, more: false, messages: [] }
      }

      // Primero solo UID y tamaño: así se decide qué descargar sin bajar
      // los adjuntos de todos.
      const candidatos = []
      for await (const msg of client.fetch(`${desde}:*`, { uid: true, size: true }, { uid: true })) {
        if (msg.uid >= desde) candidatos.push({ uid: msg.uid, size: msg.size })
      }
      candidatos.sort((a, b) => a.uid - b.uid)
      const lote = candidatos.slice(0, MAX_PER_FETCH)

      const messages = []
      for (const c of lote) {
        const parcial = c.size > MAX_SOURCE_BYTES
        const fetched = await client.fetchOne(String(c.uid), parcial
          ? { uid: true, headers: true }
          : { uid: true, source: true }, { uid: true })
        if (!fetched) continue
        const parsed = await simpleParser(parcial ? fetched.headers : fetched.source, { skipImageLinks: true, skipTextToHtml: true })
        const item = resumen(c.uid, parsed, c.size)
        if (parcial) {
          item.text = `Correo de ${Math.round(c.size / 1024 / 1024)} MB con adjuntos. Ábrelo en la casilla para verlo completo.`
          item.parcial = true
        }
        messages.push(item)
      }

      const lastUid = lote.length ? lote[lote.length - 1].uid : (reinicio ? uidNext - 1 : Number(payload.sinceUid))
      return { ok: true, uidValidity, lastUid, reset: reinicio, more: candidatos.length > lote.length, messages }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}
