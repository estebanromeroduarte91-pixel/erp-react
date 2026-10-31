import test from 'node:test'
import assert from 'node:assert/strict'
import { simpleParser } from 'mailparser'
import { esAutomatico, validateFetchPayload } from '../src/imap.mjs'

const correo = (cabeceras, from = 'cliente@gmail.com') => simpleParser(
  `From: Cliente <${from}>\r\nTo: contacto@stevedocs.cl\r\nSubject: Hola\r\n${cabeceras}\r\nMe cambian la pantalla?\r\n`,
)

test('un cliente escribiendo no es automático', async () => {
  assert.equal(esAutomatico(await correo('')), false)
  assert.equal(esAutomatico(await correo('Auto-Submitted: no\r\n')), false)
})

test('boletines, autorespuestas y no-reply se marcan como automáticos', async () => {
  assert.equal(esAutomatico(await correo('List-Unsubscribe: <mailto:x@y.cl>\r\n')), true)
  assert.equal(esAutomatico(await correo('Auto-Submitted: auto-replied\r\n')), true)
  assert.equal(esAutomatico(await correo('Precedence: bulk\r\n')), true)
  assert.equal(esAutomatico(await correo('', 'no-reply@mercadolibre.cl')), true)
  assert.equal(esAutomatico(await correo('', 'mailer-daemon@stevedocs.cl')), true)
})

test('la lectura solo acepta IMAPS en el puerto 993', () => {
  const base = { requestId: 'r1', imap: { host: 'mail.stevedocs.cl', port: 993, user: 'contacto@stevedocs.cl', password: 'x' } }
  assert.doesNotThrow(() => validateFetchPayload(base))
  assert.throws(() => validateFetchPayload({ ...base, imap: { ...base.imap, port: 143 } }))
  assert.throws(() => validateFetchPayload({ ...base, imap: { ...base.imap, password: '' } }))
  assert.throws(() => validateFetchPayload({ ...base, sinceUid: -1 }))
})
