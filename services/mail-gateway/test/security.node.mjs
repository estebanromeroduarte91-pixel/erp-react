import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateAddress, signature, validEmail, validHostname, verifySignature } from '../src/security.mjs'

test('firma y valida solicitudes recientes', () => {
  const secret = 'x'.repeat(32)
  const timestamp = String(Date.now())
  const requestId = 'req-1'
  const rawBody = Buffer.from('{"ok":true}')
  const received = `v1=${signature(secret, timestamp, requestId, rawBody)}`
  assert.equal(verifySignature({ secret, timestamp, requestId, rawBody, received }), true)
  assert.equal(verifySignature({ secret, timestamp, requestId, rawBody: Buffer.from('{}'), received }), false)
})

test('rechaza firmas vencidas', () => {
  const secret = 'x'.repeat(32)
  const timestamp = String(Date.now() - 301_000)
  const requestId = 'req-2'
  const rawBody = Buffer.from('{}')
  const received = signature(secret, timestamp, requestId, rawBody)
  assert.equal(verifySignature({ secret, timestamp, requestId, rawBody, received }), false)
})

test('bloquea redes privadas, loopback y metadata', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateAddress(ip), true, ip)
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false)
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false)
})

test('valida hostnames y correos sin aceptar URLs', () => {
  assert.equal(validHostname('mail.stevedocs.cl'), true)
  assert.equal(validHostname('https://mail.stevedocs.cl'), false)
  assert.equal(validHostname('localhost'), true)
  assert.equal(validEmail('contacto@stevedocs.cl'), true)
  assert.equal(validEmail('contacto'), false)
})
