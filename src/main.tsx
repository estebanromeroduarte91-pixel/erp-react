import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/context/AuthContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Por defecto (staleTime: 0) cada vuelta a la pestaña o cambio de foco
      // repetía TODAS las consultas, incluidas las pesadas de Taller/Gastos.
      // Con 30s de "fresco", los datos ya cargados no se vuelven a pedir de
      // inmediato — solo cuando realmente pasó tiempo o algo los invalida.
      staleTime: 30_000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
