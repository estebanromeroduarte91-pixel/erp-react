import { createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

export const ALLOWED_SMTP_PORTS = new Set([465, 587, 2525])

export function signature(secret, timestamp, requestId, rawBody) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${requestId}.`)
    .update(rawBody)
    .digest('hex')
}

export function verifySignature({ secret, timestamp, requestId, rawBody, received, now = Date.now(), ttlSeconds = 300 }) {
  if (!secret || secret.length < 32 || !/^\d{10,13}$/.test(timestamp ?? '') || !requestId || !received) return false
  const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp)
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > ttlSeconds * 1000) return false

  const expected = Buffer.from(signature(secret, timestamp, requestId, rawBody), 'hex')
  const suppliedHex = received.startsWith('v1=') ? received.slice(3) : received
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false
  const supplied = Buffer.from(suppliedHex, 'hex')
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

function privateIpv4(address) {
  const p = address.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  return p[0] === 0
    || p[0] === 10
    || p[0] === 127
    || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
    || (p[0] === 169 && p[1] === 254)
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    || (p[0] === 192 && p[1] === 0)
    || (p[0] === 192 && p[1] === 168)
    || (p[0] === 198 && (p[1] === 18 || p[1] === 19))
    || p[0] >= 224
}

export function isPrivateAddress(address) {
  const normalized = String(address).trim().toLowerCase()
  if (isIP(normalized) === 4) return privateIpv4(normalized)
  if (isIP(normalized) !== 6) return true
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? privateIpv4(mapped[1]) : false
}

export function validHostname(host) {
  const value = String(host ?? '').trim().toLowerCase()
  if (!value || value.length > 253 || /[/:?#@\s]/.test(value)) return false
  if (isIP(value)) return true
  return value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

export async function resolvePublicSmtpHost(host) {
  if (!validHostname(host)) throw new Error('Servidor SMTP no válido')
  const records = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true, verbatim: true })
  const publicRecords = records.filter(record => !isPrivateAddress(record.address))
  if (!publicRecords.length || publicRecords.length !== records.length) {
    throw new Error('El servidor SMTP apunta a una red privada o reservada')
  }
  return publicRecords[0]
}

export function validEmail(email) {
  const value = String(email ?? '').trim()
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
