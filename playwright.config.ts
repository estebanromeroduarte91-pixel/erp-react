import { defineConfig, devices } from '@playwright/test'

// Smoke tests sobre el build REAL (dist), no sobre el dev server: el bug que
// motivó esto —pantalla en blanco por chunks lazy que no cargan— solo aparece
// con los archivos hasheados de producción. En dev nunca se habría visto.
//
// No hay pruebas con sesión a propósito: crearían órdenes y ventas de verdad
// contra la base de producción. Eso queda pendiente hasta tener un entorno de
// pruebas aparte (ver README).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
