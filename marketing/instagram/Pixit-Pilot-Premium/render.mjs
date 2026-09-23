import { chromium } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const output = join(here, 'exports')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1160, height: 1430 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(join(here, 'pilot.html')).href, { waitUntil: 'networkidle' })
await page.locator('.post').screenshot({ path: join(output, 'pixit-piloto-premium-gastos.png') })
await browser.close()
