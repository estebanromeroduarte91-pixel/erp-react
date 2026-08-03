import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // jsdom porque algunos módulos importan supabase.ts (usa `window` a nivel
    // de módulo) de forma transitiva, aunque el test en sí sea lógica pura.
    environment: 'jsdom',
    // Los archivos de `e2e/` son de Playwright, que tiene su propia API y su
    // propio runner (`npm run test:e2e`). Sin esta exclusión, vitest los toma
    // como suyos y falla al no encontrar sus hooks.
    exclude: ['node_modules', 'dist', 'e2e'],
  },
})
