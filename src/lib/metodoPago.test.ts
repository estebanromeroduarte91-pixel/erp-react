import { describe, it, expect } from 'vitest'
import { nombreMetodoPago } from './metodoPago'
import type { MetodoPago } from '@/types'

const metodos: MetodoPago[] = [
  { id: 'efectivo', icon: 'cash', label: 'Efectivo', desc: '' },
  { id: 'mpt7zej50ss1s', icon: 'card', label: 'Tarjeta Sodexo', desc: '' },
]

describe('nombreMetodoPago', () => {
  it('devuelve el label cuando el método existe', () => {
    expect(nombreMetodoPago('mpt7zej50ss1s', metodos)).toBe('Tarjeta Sodexo')
  })

  it('capitaliza los ids por defecto cuando faltan de la lista', () => {
    expect(nombreMetodoPago('transfer', [])).toBe('Transfer')
  })

  // El caso real: alguien borró el método de pago desde Configuración y una
  // venta vieja quedó apuntando a un ID que ya no existe. Sin esto, la
  // pantalla mostraba el ID interno tal cual ("mpt7zej50ss1s").
  it('no expone el id crudo cuando el método fue borrado', () => {
    expect(nombreMetodoPago('mpt7zej50ss1s', [])).toBe('Método eliminado')
  })

  it('maneja ids vacíos o indefinidos', () => {
    expect(nombreMetodoPago(undefined, metodos)).toBe('—')
    expect(nombreMetodoPago('', metodos)).toBe('—')
  })
})
