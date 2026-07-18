import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Login } from '@/modules/auth/Login'
import { ResetPassword } from '@/modules/auth/ResetPassword'
import { TrialExpirado } from '@/modules/auth/TrialExpirado'
import { Shell } from '@/components/layout/Shell'
import { TallerPage } from '@/modules/taller/TallerPage'
import { InventarioPage } from '@/modules/inventario/InventarioPage'
import { ContactosPage } from '@/modules/contactos/ContactosPage'
import { VentasPage } from '@/modules/ventas/VentasPage'
import { ContabilidadPage } from '@/modules/contabilidad/ContabilidadPage'
import { DashboardPage } from '@/modules/dashboard/DashboardPage'
import { EstadisticasPage } from '@/modules/estadisticas/EstadisticasPage'
import { ConfigPage } from '@/modules/config/ConfigPage'
import { ComprasPage } from '@/modules/compras/ComprasPage'
import { BuscarPage } from '@/modules/buscar/BuscarPage'
import { Spinner } from '@/components/shared/Spinner'

function AppRoutes() {
  const { session, cargando, recoveryMode, trialExpirado } = useAuth()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    )
  }

  // Llegó por el enlace de "olvidé mi contraseña" → fijar nueva clave (antes de todo lo demás)
  if (recoveryMode) return <ResetPassword />

  if (!session) return <Login />

  if (trialExpirado) return <TrialExpirado />

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/taller" element={<TallerPage />} />
<Route path="/dashboard"     element={<DashboardPage />} />
        <Route path="/inventario"    element={<InventarioPage />} />
        <Route path="/ventas"        element={<VentasPage />} />
        <Route path="/contactos"     element={<ContactosPage />} />
        <Route path="/contabilidad"  element={<ContabilidadPage />} />
        <Route path="/estadisticas"  element={<EstadisticasPage />} />
        <Route path="/config"        element={<ConfigPage />} />
        <Route path="/compras"       element={<ComprasPage />} />
        <Route path="/buscar"        element={<BuscarPage />} />
        <Route path="*"              element={<Navigate to="/taller" replace />} />
      </Routes>
    </Shell>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
