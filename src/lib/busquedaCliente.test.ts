import { describe, expect, it } from 'vitest'
import { coincideCliente } from './busquedaCliente'

describe('búsqueda de clientes en una orden', () => {
  const cliente = { nombre: 'Florencia María', apellido: 'Martínez Pérez', rut: '12.345.678-K', tel: '+56 9 8765 4321' }

  it('combina nombre y apellido con fragmentos y sin distinguir tildes o mayúsculas', () => {
    expect(coincideCliente(cliente, 'florencia mart')).toBe(true)
    expect(coincideCliente(cliente, '  MARTINEZ   MARIA ')).toBe(true)
    expect(coincideCliente(cliente, 'Floréncia pérez')).toBe(true)
    expect(coincideCliente(cliente, 'florencia gomez')).toBe(false)
  })
  it('encuentra RUT completo o parcial con y sin formato y K minúscula', () => {
    for (const q of ['12.345.678-k', '12345678k', '12345678', '345678']) expect(coincideCliente(cliente, q)).toBe(true)
    expect(coincideCliente(cliente, '99999999')).toBe(false)
  })
  it('conserva la búsqueda de teléfono', () => {
    expect(coincideCliente(cliente, '+56 9 8765')).toBe(true)
    expect(coincideCliente(cliente, '987654321')).toBe(true)
  })
  it('no confunde letras de un nombre con el dígito verificador K', () => {
    expect(coincideCliente(cliente, 'karen')).toBe(false)
    expect(coincideCliente(cliente, 'k')).toBe(false)
  })
  it('tolera campos vacíos o nulos', () => {
    expect(coincideCliente({ nombre: null, apellido: 'Pérez', rut: null }, 'perez')).toBe(true)
    expect(coincideCliente({}, 'florencia')).toBe(false)
    expect(coincideCliente({}, '')).toBe(true)
  })
})
