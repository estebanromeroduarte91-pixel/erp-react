import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `supabase/functions` son Edge Functions de Deno (Deno.serve, imports por
  // URL, sin el tsconfig ni los globals del navegador). Se versionan en el
  // repo como respaldo/histórico del código desplegado, pero no son parte del
  // build del frontend — pasarlas por este ESLint solo genera errores falsos.
  globalIgnores(['dist', 'supabase/functions']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
