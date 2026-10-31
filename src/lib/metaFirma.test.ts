import { describe, expect, it, beforeAll } from 'vitest'
import { createHmac } from 'node:crypto'

// _shared/meta.ts es código de Deno (lee Deno.env al cargar). Se simula ese
// global para probar la verificación de firma del webhook con el formato
// exacto que usa Meta: "sha256=" + HMAC-SHA256(secreto de la app, cuerpo crudo).
let firmaMetaValida: (raw: Uint8Array, cabecera: string | null) => Promise<boolean>

beforeAll(async () => {
  ;(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => (k === 'META_APP_SECRET' ? 'secreto-de-prueba' : undefined) } }
  ;({ firmaMetaValida } = await import('../../supabase/functions/_shared/meta'))
})

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
})
