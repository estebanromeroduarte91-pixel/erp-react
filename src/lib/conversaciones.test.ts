import { describe, expect, it } from 'vitest'
import { filtrarConversaciones, horaCorta, quitarCitado, type Conversacion } from './conversaciones'

const conv = (p: Partial<Conversacion>): Conversacion => ({
  id: 'c', canal: 'email', contacto_externo: 'ana@gmail.com', contacto_nombre: 'Ana', asunto: 'Pantalla',
  ultimo_mensaje_en: '2026-10-31T12:00:00Z', ultimo_extracto: 'hola', ultima_direccion: 'entrante',
  no_leidos: 1, estado: 'abierta', ...p,
})

describe('quitarCitado', () => {
  it('corta el historial de Gmail en español', () => {
    const t = 'Perfecto, paso mañana.\n\nEl jue, 30 oct 2026 a las 10:12, Steve Docs <contacto@stevedocs.cl> escribió:\n> Hola Ana\n> ya está lista'
    expect(quitarCitado(t)).toBe('Perfecto, paso mañana.')
  })

  it('corta cuando Gmail parte la línea del "escribió:"', () => {
    const t = 'Gracias!\n\nEl jue, 30 oct 2026 a las 10:12, Steve Docs <\ncontacto@stevedocs.cl> escribió:\n> Hola'
    expect(quitarCitado(t)).toBe('Gracias!')
  })

  it('corta el "Mensaje original" de Outlook y el bloque de citas final', () => {
    expect(quitarCitado('Ok\n-----Mensaje original-----\nDe: x')).toBe('Ok')
    expect(quitarCitado('Dale\n\n> antes\n> dije')).toBe('Dale')
  })

  it('no toca un correo sin citas, ni deja un mensaje vacío', () => {
    expect(quitarCitado('Hola, ¿cuánto sale la batería?')).toBe('Hola, ¿cuánto sale la batería?')
    expect(quitarCitado('> solo cita')).toBe('> solo cita')
  })
})

describe('filtrarConversaciones', () => {
  const lista = [
    conv({ id: 'a' }),
    conv({ id: 'b', ultima_direccion: 'saliente', contacto_externo: 'luis@x.cl', contacto_nombre: 'Luis' }),
    conv({ id: 'c', estado: 'cerrada' }),
  ]
  const ids = (r: Conversacion[]) => r.map(c => c.id)

  it('"Todas" muestra las abiertas; "Cerradas" solo las cerradas', () => {
    expect(ids(filtrarConversaciones(lista, { canal: 'todos', filtro: 'todas', busqueda: '' }))).toEqual(['a', 'b'])
    expect(ids(filtrarConversaciones(lista, { canal: 'todos', filtro: 'cerradas', busqueda: '' }))).toEqual(['c'])
  })

  it('"Sin responder" deja las que terminan con un mensaje del cliente', () => {
    expect(ids(filtrarConversaciones(lista, { canal: 'todos', filtro: 'sin_responder', busqueda: '' }))).toEqual(['a'])
  })

  it('busca por nombre o correo y filtra por canal', () => {
    expect(ids(filtrarConversaciones(lista, { canal: 'todos', filtro: 'todas', busqueda: 'luis' }))).toEqual(['b'])
    expect(filtrarConversaciones(lista, { canal: 'instagram', filtro: 'todas', busqueda: '' })).toEqual([])
  })
})

describe('horaCorta', () => {
  const ahora = new Date('2026-10-31T15:00:00')
  it('hoy muestra la hora, ayer dice "Ayer"', () => {
    expect(horaCorta('2026-10-31T09:05:00', ahora)).toMatch(/09:05/)
    expect(horaCorta('2026-10-30T09:05:00', ahora)).toBe('Ayer')
  })
})
