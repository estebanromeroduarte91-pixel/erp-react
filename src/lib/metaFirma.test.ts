import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'

import { hmacHex, verificarFirmaMeta } from '../../supabase/functions/_shared/metaFirma'

// Probar la misma criptografía del servidor sin importar Deno ni sus secretos.
const secreto = 'secreto-de-prueba'
const firmaMetaValida = (raw: Uint8Array, cabecera: string | null) => verificarFirmaMeta(secreto, raw, cabecera)

describe('firma del webhook de Meta', () => {
  const cuerpo = new TextEncoder().encode('{"object":"page","entry":[]}')
  const firma = 'sha256=' + createHmac('sha256', 'secreto-de-prueba').update(cuerpo).digest('hex')

  it('acepta la firma correcta', async () => {
    expect(await firmaMetaValida(cuerpo, firma)).toBe(true)
  })

  it('rechaza cuerpo alterado, firma ajena o ausente', async () => {
    expect(await firmaMetaValida(new TextEncoder().encode('{"object":"page","entry":[1]}'), firma)).toBe(false)
    expect(await firmaMetaValida(cuerpo, 'sha256=' + createHmac('sha256', 'otro').update(cuerpo).digest('hex'))).toBe(false)
    expect(await firmaMetaValida(cuerpo, null)).toBe(false)
    expect(await firmaMetaValida(cuerpo, firma.slice(7))).toBe(false)
  })

  it('rechaza mensajes cuando el secreto no está configurado', async () => {
    expect(await verificarFirmaMeta('', cuerpo, firma)).toBe(false)
  })

  it('firma solo los bytes de una vista, sin incluir datos anteriores o posteriores', async () => {
    const bytes = new TextEncoder().encode('antes-mensaje-después')
    const vista = bytes.subarray(6, 13)
    expect(await hmacHex(secreto, vista)).toBe(createHmac('sha256', secreto).update(vista).digest('hex'))
  })

  it('mantiene appsecret_proof compatible con HMAC-SHA256', async () => {
    const token = 'token-ficticio-de-prueba'
    expect(await hmacHex(secreto, token)).toBe(createHmac('sha256', secreto).update(token).digest('hex'))
  })

})
