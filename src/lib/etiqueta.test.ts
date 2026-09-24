import { describe, expect, it } from 'vitest'
import { etiquetaHtml } from './etiqueta'

describe('etiquetaHtml', () => {
  const base = { num: '3999', url: 'https://pixit.cl/?orden=1' }

  it('declara una sola hoja de 60 × 40 mm sin márgenes', () => {
    const html = etiquetaHtml(base)
    expect(html).toContain('@page{size:60mm 40mm;margin:0}')
    // Alto fijo y sin desborde: es lo que evita la segunda hoja en blanco.
    expect(html).toContain('html,body{width:60mm;height:40mm;overflow:hidden}')
  })

  it('muestra un solo QR aunque la librería dibuje canvas e imagen', () => {
    expect(etiquetaHtml(base)).toContain('#qr img{display:none}')
  })

  it('recorta los textos largos en vez de dejarlos crecer', () => {
    const html = etiquetaHtml(base)
    expect(html).toContain('-webkit-line-clamp:2')
    expect(html).toContain('text-overflow:ellipsis')
  })

  it('escapa los datos del cliente', () => {
    const html = etiquetaHtml({ ...base, cliente: 'Ana <script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('Ana &lt;script&gt;')
  })

  it('pone la URL dentro del QR como texto válido', () => {
    expect(etiquetaHtml({ ...base, url: "https://pixit.cl/?orden=it's" }))
      .toContain('text:"https://pixit.cl/?orden=it\'s"')
  })
})
