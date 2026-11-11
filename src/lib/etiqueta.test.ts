import { describe, expect, it } from 'vitest'
import { etiquetaHtml as etiquetaConQr, qrSvg } from './etiqueta'

const QR = '<svg data-qr></svg>'
const etiquetaHtml = (d: Parameters<typeof etiquetaConQr>[0]) => etiquetaConQr(d, QR)

describe('etiquetaHtml', () => {
  const base = { num: '3999', url: 'https://pixit.cl/?orden=1' }

  it('declara una sola hoja de 60 × 40 mm sin márgenes', () => {
    const html = etiquetaHtml(base)
    expect(html).toContain('@page{size:60mm 40mm;margin:0}')
    // Alto fijo y sin desborde: es lo que evita la segunda hoja en blanco.
    expect(html).toContain('html,body{width:60mm;height:40mm;overflow:hidden}')
  })

  it('pone el QR ya dibujado, escalado completo y sin depender de un script externo', () => {
    const html = etiquetaHtml(base)
    expect(html).toContain('<div id="qr"><svg data-qr></svg></div>')
    expect(html).toContain('#qr svg{display:block;width:13mm;height:13mm')
    expect(html).not.toContain('qrcode.min.js')
    expect(html).not.toContain('overflow:hidden}\n  #qr')
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

  it('el QR completo trae sus tres cuadros de esquina y la URL', async () => {
    const svg = await qrSvg('https://pixit.cl/?orden=abc123')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 ')
    const QRCode = (await import('qrcode')).default
    const qr = QRCode.create('https://pixit.cl/?orden=abc123', { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    // Esquina superior izquierda de un QR: fila 0, columnas 0–6 oscuras.
    for (let c = 0; c < 7; c++) expect(qr.modules.get(0, c)).toBeTruthy()
    expect(svg).toContain(`viewBox="0 0 ${n} ${n}"`)
  })
})
