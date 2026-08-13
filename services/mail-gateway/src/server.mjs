import http from 'node:http'
import process from 'node:process'
import { createHash } from 'node:crypto'
import nodemailer from 'nodemailer'
import {
  ALLOWED_SMTP_PORTS,
  resolvePublicSmtpHost,
  validEmail,
  verifySignature,
} from './security.mjs'

const PORT = Number(process.env.PORT || 3000)
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 2 * 1024 * 1024)
const REQUEST_TTL_SECONDS = Number(process.env.REQUEST_TTL_SECONDS || 300)
const MAX_CONCURRENT_SENDS = Number(process.env.MAX_CONCURRENT_SENDS || 5)
const MAX_QUEUED_SENDS = Number(process.env.MAX_QUEUED_SENDS || 100)
const SHARED_SECRET = process.env.SMTP_GATEWAY_SECRET || ''

if (SHARED_SECRET.length < 32) {
  throw new Error('SMTP_GATEWAY_SECRET debe tener al menos 32 caracteres')
}

const processed = new Map()
const inFlight = new Set()
const blockedCredentials = new Map()
const waiting = []
let activeSends = 0

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Mensaje demasiado grande'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function validatePayload(payload) {
  const smtp = payload?.smtp
  const message = payload?.message
  const port = Number(smtp?.port)
  if (!payload?.requestId || payload.requestId.length > 100) throw new Error('requestId no válido')
  if (!smtp?.host || !ALLOWED_SMTP_PORTS.has(port)) throw new Error('Servidor o puerto SMTP no permitido')
  if (!String(smtp.user ?? '').trim() || String(smtp.user).length > 254 || !smtp.password || !validEmail(smtp.fromEmail)) {
    throw new Error('Credenciales o remitente SMTP incompletos')
  }
  if (!validEmail(message?.to) || !message?.subject || (!message?.html && !message?.text)) throw new Error('Mensaje incompleto')
  if (smtp.replyTo && !validEmail(smtp.replyTo)) throw new Error('Reply-To no válido')
}

function publicError(error) {
  const raw = String(error?.response || error?.message || error)
  if (/\b535\b|authentication|credentials|username and password/i.test(raw)) {
    return { code: 'SMTP_AUTH', error: 'El servidor rechazó el usuario o la contraseña (535). Confirma también que la IP fija de Pixit esté autorizada.' }
  }
  if (/timeout|timed out|ETIMEDOUT|ESOCKET/i.test(raw)) {
    return { code: 'SMTP_TIMEOUT', error: 'El servidor SMTP no respondió. Revisa el host, el puerto o si el hosting bloqueó la IP fija de Pixit.' }
  }
  if (/certificate|TLS|SSL|STARTTLS/i.test(raw)) {
    return { code: 'SMTP_TLS', error: 'No se pudo negociar una conexión segura con el servidor SMTP.' }
  }
  if (/sender|recipient|\b550\b|\b553\b/i.test(raw)) {
    return { code: 'SMTP_REJECTED', error: 'El servidor SMTP rechazó el remitente o destinatario.' }
  }
  return { code: 'SMTP_ERROR', error: 'El servidor SMTP no pudo entregar el correo.' }
}

function credentialFingerprint(smtp) {
  return createHash('sha256')
    .update(`${String(smtp.host).toLowerCase()}\0${String(smtp.user).toLowerCase()}\0${smtp.password}`)
    .digest('hex')
}

function isAuthenticationError(error) {
  const raw = String(error?.response || error?.message || error)
  return /\b535\b|authentication|credentials|username and password/i.test(raw)
}

async function send(payload) {
  validatePayload(payload)
  const { smtp, message } = payload
  const credentialId = credentialFingerprint(smtp)
  const blockedUntil = blockedCredentials.get(credentialId)
  if (blockedUntil && blockedUntil > Date.now()) {
    throw new Error('535 authentication blocked by Pixit circuit breaker')
  }
  blockedCredentials.delete(credentialId)
  const port = Number(smtp.port)
  const resolved = await resolvePublicSmtpHost(smtp.host)
  const transporter = nodemailer.createTransport({
    // Se conecta a la IP ya validada para impedir DNS rebinding. `servername`
    // conserva la validación TLS contra el hostname original.
    host: resolved.address,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: smtp.host, minVersion: 'TLSv1.2' },
  })

  let result
  try {
    result = await transporter.sendMail({
      from: { name: smtp.fromName || 'Pixit', address: smtp.fromEmail },
      replyTo: smtp.replyTo || smtp.fromEmail,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: {
        'X-Pixit-Tenant': payload.tenantId,
        'X-Pixit-Request': payload.requestId,
      },
    })
  } catch (error) {
    // Un solo 535 basta para detener esa credencial durante 15 minutos. Las
    // contraseñas corregidas generan otra huella y pueden probarse enseguida.
    // Así un trabajo en cola no convierte un dato incorrecto en un bloqueo del
    // hosting, que fue exactamente lo ocurrido con Steve Docs.
    if (isAuthenticationError(error)) {
      blockedCredentials.set(credentialId, Date.now() + 15 * 60_000)
    }
    throw error
  }

  return {
    ok: true,
    messageId: result.messageId,
    accepted: result.accepted?.map(String) ?? [],
    rejected: result.rejected?.map(String) ?? [],
  }
}

async function queuedSend(payload) {
  if (activeSends >= MAX_CONCURRENT_SENDS) {
    if (waiting.length >= MAX_QUEUED_SENDS) throw Object.assign(new Error('Gateway temporalmente ocupado'), { busy: true })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = waiting.findIndex(entry => entry.resolve === resolve)
        if (index >= 0) waiting.splice(index, 1)
        reject(Object.assign(new Error('La cola de correo agotó su tiempo de espera'), { busy: true }))
      }, 25_000)
      waiting.push({
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
      })
    })
  }
  activeSends += 1
  try {
    return await send(payload)
  } finally {
    activeSends -= 1
    waiting.shift()?.resolve()
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, service: 'pixit-mail-gateway', uptime: Math.round(process.uptime()) })
  }
  if (req.method !== 'POST' || req.url !== '/v1/send') return json(res, 404, { ok: false, error: 'No encontrado' })

  try {
    const rawBody = await readBody(req)
    const timestamp = req.headers['x-pixit-timestamp']
    const requestId = req.headers['x-pixit-request-id']
    const received = req.headers['x-pixit-signature']
    if (!verifySignature({
      secret: SHARED_SECRET,
      timestamp: String(timestamp ?? ''),
      requestId: String(requestId ?? ''),
      received: String(received ?? ''),
      rawBody,
      ttlSeconds: REQUEST_TTL_SECONDS,
    })) return json(res, 401, { ok: false, error: 'Firma no válida' })

    const cached = processed.get(requestId)
    if (cached && cached.expiresAt > Date.now()) return json(res, cached.status, cached.body)
    if (inFlight.has(requestId)) return json(res, 409, { ok: false, error: 'Solicitud en proceso' })

    const payload = JSON.parse(rawBody.toString('utf8'))
    if (payload.requestId !== requestId) throw new Error('requestId no coincide con la firma')
    inFlight.add(requestId)
    try {
      const body = await queuedSend(payload)
      processed.set(requestId, { status: 200, body, expiresAt: Date.now() + 10 * 60_000 })
      return json(res, 200, body)
    } catch (error) {
      const body = { ok: false, ...publicError(error) }
      return json(res, error?.busy ? 503 : 502, body)
    } finally {
      inFlight.delete(requestId)
    }
  } catch (error) {
    return json(res, error?.status || 400, { ok: false, error: error?.message || 'Solicitud no válida' })
  }
})

const cleanup = setInterval(() => {
  const now = Date.now()
  for (const [id, result] of processed) if (result.expiresAt <= now) processed.delete(id)
  for (const [id, expiresAt] of blockedCredentials) if (expiresAt <= now) blockedCredentials.delete(id)
}, 60_000)
cleanup.unref()

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', event: 'gateway_started', port: PORT }))
})

function shutdown() {
  server.close(error => process.exit(error ? 1 : 0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
