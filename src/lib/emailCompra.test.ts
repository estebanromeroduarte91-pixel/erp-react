import { describe, expect, it } from 'vitest'
import { asuntoCompra, buildEmailCompra, type CompraEmailData } from './email'

const base: CompraEmailData = {
  tallerNombre: 'Steve Docs',
  clienteNombre: 'Maria Morgoño',
  documento: 'boleta',
  folio: 1234,
  ventaNumero: 'VTA-03758',
  fecha: '2026-11-09T18:02:21.181Z',
  items: [
    { nombre: 'Pantalla iPhone 14 <Original>', cantidad: 1, total: 249990 },
    { nombre: 'Mica 3D', cantidad: 2, total: 40000 },
  ],
  total: 289990,
  formaPago: 'Transferencia',
  branchNombre: 'Los Dominicos',
}

describe('correo de compra del POS', () => {
  it('arma el asunto según el documento', () => {
    expect(asuntoCompra(base)).toBe('Tu boleta electrónica N° 1234 — Steve Docs')
    expect(asuntoCompra({ ...base, documento: 'comprobante', folio: null })).toBe('Tu comprobante de compra VTA-03758 — Steve Docs')
  })

  it('muestra el detalle, el total y escapa los nombres', () => {
    const html = buildEmailCompra(base)
    expect(html).toContain('Hola Maria,')
    expect(html).toContain('Pantalla iPhone 14 &lt;Original&gt;')
    expect(html).toContain('× 2')
    expect(html).toContain('$289.990')
    expect(html).toContain('Los Dominicos')
    expect(html).not.toContain('<Original>')
  })

  it('no saluda por nombre al cliente genérico', () => {
    expect(buildEmailCompra({ ...base, clienteNombre: 'Cliente genérico' })).toContain('Hola,<br>')
  })
})
