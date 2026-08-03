import { test, expect, type Page } from '@playwright/test'

// Red de seguridad mínima contra el peor fallo posible: que un despliegue deje
// la app en pantalla en blanco para todos. Ya pasó una vez (los chunks lazy del
// build anterior dejaban de existir y el error caía en el ErrorBoundary), y
// ningún test unitario lo detectó porque el bug vive en el build, no en la
// lógica.

/** Errores de consola que no indican un problema real de la app. */
const RUIDO = [
  'favicon',
  'ResizeObserver loop',
  // Sin credenciales de Supabase válidas en el entorno de CI, las llamadas de
  // red fallan: eso es esperado y no es lo que estos tests vigilan.
  'Failed to load resource',
  'net::ERR_',
]

function capturarErrores(page: Page): string[] {
  const errores: string[] = []
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const texto = msg.text()
    if (RUIDO.some(r => texto.includes(r))) return
    errores.push(texto)
  })
  page.on('pageerror', err => errores.push(String(err)))
  return errores
}

test('la landing carga y muestra contenido', async ({ page }) => {
  const errores = capturarErrores(page)
  await page.goto('/')

  // "Algo salió mal" es la pantalla del ErrorBoundary: si aparece acá, el
  // build está roto para cualquier visitante.
  await expect(page.getByText('Algo salió mal')).toHaveCount(0)

  const texto = await page.locator('body').innerText()
  expect(texto.length, 'la página cargó vacía').toBeGreaterThan(200)
  expect(errores, `errores de consola: ${errores.join(' | ')}`).toHaveLength(0)
})

test('el login carga sin romperse', async ({ page }) => {
  const errores = capturarErrores(page)
  await page.goto('/#/login')
  await expect(page.getByText('Algo salió mal')).toHaveCount(0)
  await expect(page.locator('input[type="password"]')).toBeVisible()
  expect(errores, `errores de consola: ${errores.join(' | ')}`).toHaveLength(0)
})

// Estas páginas se sirven fuera del bundle de React y se abren SIN sesión, por
// token (el cliente que escanea el QR, o el que aprueba un presupuesto). Si una
// se rompe, el que lo sufre es el cliente final del taller, no el taller — así
// que nadie se entera.
for (const pagina of ['foto-orden.html', 'aprobar.html', 'cotizacion.html']) {
  test(`la página pública ${pagina} carga`, async ({ page }) => {
    const respuesta = await page.goto(`/${pagina}`)
    expect(respuesta?.status(), `${pagina} no se sirve`).toBeLessThan(400)
    const texto = await page.locator('body').innerText()
    expect(texto.length, `${pagina} cargó vacía`).toBeGreaterThan(10)
  })
}

test('una ruta inexistente no deja la pantalla en blanco', async ({ page }) => {
  await page.goto('/#/ruta-que-no-existe')
  const texto = await page.locator('body').innerText()
  expect(texto.length).toBeGreaterThan(50)
})
