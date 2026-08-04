import { describe, it, expect } from 'vitest'
import { urlConCacheBust } from './lazyWithReload'

// Esta URL es la que se usa para recuperarse de un deploy: si no cambia
// respecto a la actual, el navegador puede servir el index.html cacheado —
// que apunta a los mismos chunks muertos— y la pantalla queda en blanco igual.

describe('urlConCacheBust', () => {
  it('conserva la ruta del hash, que es donde vive la navegación', () => {
    const r = urlConCacheBust('https://pixit.cl/#/taller', 'abc')
    expect(new URL(r).hash).toBe('#/taller')
  })

  it('agrega un parámetro que hace la URL distinta de la actual', () => {
    const r = urlConCacheBust('https://pixit.cl/#/taller', 'abc')
    expect(r).not.toBe('https://pixit.cl/#/taller')
    expect(new URL(r).searchParams.get('_v')).toBe('abc')
  })

  it('no pisa otros parámetros que ya venían', () => {
    const r = urlConCacheBust('https://pixit.cl/?tab=smtp#/config', 'abc')
    const u = new URL(r)
    expect(u.searchParams.get('tab')).toBe('smtp')
    expect(u.searchParams.get('_v')).toBe('abc')
    expect(u.hash).toBe('#/config')
  })

  it('reemplaza la marca anterior en vez de acumularla', () => {
    // Sin esto, cada recuperación dejaría ?_v=a&_v=b&_v=c... creciendo sin fin.
    const r = urlConCacheBust('https://pixit.cl/?_v=viejo#/dashboard', 'nuevo')
    const u = new URL(r)
    expect(u.searchParams.getAll('_v')).toEqual(['nuevo'])
    expect(u.hash).toBe('#/dashboard')
  })

  it('dos llamadas seguidas producen URLs distintas', () => {
    const a = urlConCacheBust('https://pixit.cl/#/x', 'm1')
    const b = urlConCacheBust('https://pixit.cl/#/x', 'm2')
    expect(a).not.toBe(b)
  })
})
