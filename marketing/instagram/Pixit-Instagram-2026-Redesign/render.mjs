import { chromium } from '@playwright/test'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const scale = Number(process.env.PIXIT_EXPORT_SCALE || 1)
const out = join(root, scale > 1 ? 'exports-2x' : 'exports')
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: scale })
await page.goto(pathToFileURL(join(root, 'campaign.html')).href)
await page.waitForFunction(() => document.fonts.status === 'loaded')
await page.waitForTimeout(250)
const names = await page.locator('.piece').evaluateAll(nodes => nodes.map(n => `${n.dataset.export}.png`))
await page.evaluate(() => {
  document.querySelectorAll('.wrap > *:not(#feed),.piece-head,.caption').forEach(n => n.style.display = 'none')
  document.querySelectorAll('.stage').forEach(n => {
    n.style.width = '1080px'; n.style.height = '1080px'; n.style.borderRadius = '0'; n.style.boxShadow = 'none'; n.style.margin = '0 0 24px'
  })
  document.querySelectorAll('.post').forEach(n => n.style.transform = 'none')
})
const shots = page.locator('[data-post]')
for (let i = 0; i < await shots.count(); i++) {
  await shots.nth(i).screenshot({ path: join(out, names[i]) })
  console.log('✓', names[i])
}
await browser.close()
console.log(`\n${names.length} publicaciones en ${out}`)
