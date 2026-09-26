import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HighlightText } from './HighlightText'

describe('HighlightText', () => {
  it('resalta coincidencias sin interpretar el texto como HTML', () => {
    const html = renderToStaticMarkup(
      <HighlightText text={'<img src=x onerror="alert(1)"> iPhone'} query="iPhone" />,
    )

    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
    expect(html).not.toContain('<img')
    expect(html).toContain('<strong')
    expect(html).toContain('iPhone</strong>')
  })
})
