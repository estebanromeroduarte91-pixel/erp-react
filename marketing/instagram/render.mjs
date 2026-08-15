import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const output = join(root, 'exports')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 2000 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(join(root, 'campaign.html')).href)
await page.waitForFunction(() => document.fonts.status === 'loaded')
await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0))

const frames = page.locator('.frame')
const total = await frames.count()
for (let i = 0; i < total; i += 1) {
  const frame = frames.nth(i)
  const file = await frame.getAttribute('data-file')
  if (!file) continue
  await frames.evaluateAll((nodes, visibleIndex) => {
    nodes.forEach((node, index) => {
      const visible = index === visibleIndex
      node.style.display = visible ? 'block' : 'none'
      if (visible) {
        node.style.position = 'fixed'
        node.style.inset = '0 auto auto 0'
      }
    })
  }, i)
  const size = await frame.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }))
  await page.setViewportSize(size)
  await page.evaluate(() => {
    document.body.style.padding = '0'
    document.body.style.gap = '0'
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(50)
  await page.screenshot({
    path: join(output, `${file}.png`),
  })
}

await browser.close()
console.log(`Exportadas ${total} piezas en ${output}`)
