// Exporta cada lámina de feed-instagram.html como PNG de 1080 × 1080.
//
//   node marketing/instagram/render-feed.mjs
//
// Las piezas se dibujan a 1080 px reales dentro de la página; acá solo se
// desactiva el escalado de la vista previa y se fotografía cada una.
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const output = join(root, 'exports-feed')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(join(root, 'feed-instagram.html')).href)
await page.waitForFunction(() => document.fonts.status === 'loaded')
await page.waitForTimeout(400)

// Nombre de archivo por pieza: 01-simplifica-tu-taller-1.png
const nombres = await page.evaluate(() => {
  const limpia = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42)
  return [...document.querySelectorAll('.piece')].flatMap((piece, i) => {
    const titulo = limpia(piece.querySelector('h2').textContent)
    const laminas = piece.querySelectorAll('[data-post]')
    return [...laminas].map((_, j) =>
      `${String(i + 1).padStart(2, '0')}-${titulo}${laminas.length > 1 ? `-${j + 1}` : ''}.png`)
  })
})

// Las piezas se llevan a su tamaño real (1080 × 1080) y se fotografía cada
// elemento: Playwright se encarga de desplazarse hasta él.
await page.evaluate(() => {
  document.querySelectorAll('.wrap > *:not(#feed)').forEach(n => { n.style.display = 'none' })
  document.querySelectorAll('.cap, .piece-head').forEach(n => { n.style.display = 'none' })
  document.querySelectorAll('.slides').forEach(n => { n.style.display = 'block' })
  document.querySelectorAll('.stage').forEach(n => {
    n.style.width = '1080px'
    n.style.height = '1080px'
    n.style.aspectRatio = 'auto'
    n.style.borderRadius = '0'
    n.style.boxShadow = 'none'
    n.style.margin = '0 0 40px'
  })
  document.querySelectorAll('[data-post]').forEach(p => { p.style.transform = 'none' })
})
await page.waitForTimeout(300)

const laminas = page.locator('[data-post]')
const total = await laminas.count()
for (let i = 0; i < total; i += 1) {
  await laminas.nth(i).screenshot({ path: join(output, nombres[i]) })
  console.log('✓', nombres[i])
}

await browser.close()
console.log(`\n${total} láminas en ${output}`)
