import { describe, it, expect } from 'vitest'
import { calcularDimensiones, MAX_LADO } from './imagen'

describe('calcularDimensiones', () => {
  it('achica una foto apaisada de celular respetando la proporción', () => {
    // 4032x3024 (4:3) es lo típico de la cámara de un iPhone.
    const r = calcularDimensiones(4032, 3024)
    expect(r.ancho).toBe(MAX_LADO)
    expect(r.alto).toBe(1050)
    expect(r.ancho / r.alto).toBeCloseTo(4032 / 3024, 2)
  })

  it('achica una foto vertical tomando el lado mayor', () => {
    const r = calcularDimensiones(3024, 4032)
    expect(r.alto).toBe(MAX_LADO)
    expect(r.ancho).toBe(1050)
  })

  it('deja igual una imagen que ya entra en el límite', () => {
    // Reescalar hacia arriba solo agrega peso, no detalle.
    const r = calcularDimensiones(800, 600)
    expect(r).toEqual({ ancho: 800, alto: 600 })
  })

  it('deja igual una imagen exactamente en el límite', () => {
    const r = calcularDimensiones(MAX_LADO, 900)
    expect(r).toEqual({ ancho: MAX_LADO, alto: 900 })
  })

  it('respeta un límite distinto al de por defecto', () => {
    const r = calcularDimensiones(2000, 1000, 500)
    expect(r).toEqual({ ancho: 500, alto: 250 })
  })

  it('no rompe con dimensiones en cero', () => {
    expect(calcularDimensiones(0, 0)).toEqual({ ancho: 0, alto: 0 })
  })

  it('nunca devuelve un lado mayor al límite', () => {
    for (const [w, h] of [[4032, 3024], [1600, 1600], [5000, 200], [200, 5000]]) {
      const r = calcularDimensiones(w, h)
      expect(Math.max(r.ancho, r.alto)).toBeLessThanOrEqual(MAX_LADO)
    }
  })
})
