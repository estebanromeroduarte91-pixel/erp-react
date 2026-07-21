import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Login } from '@/modules/auth/Login'
import { ResetPassword } from '@/modules/auth/ResetPassword'
import { TrialExpirado } from '@/modules/auth/TrialExpirado'
import { LandingPage } from '@/modules/landing/LandingPage'
import { Shell } from '@/components/layout/Shell'
import { Spinner } from '@/components/shared/Spinner'

// Carga perezosa (Lazy Loading) de todos los módulos pesados del ERP
const TallerPage = lazy(() => import('@/modules/taller/TallerPage').then(m => ({ default: m.TallerPage })))
const InventarioPage = lazy(() => import('@/modules/inventario/InventarioPage').then(m => ({ default: m.InventarioPage })))
const ContactosPage = lazy(() => import('@/modules/contactos/ContactosPage').then(m => ({ default: m.ContactosPage })))
const VentasPage = lazy(() => import('@/modules/ventas/VentasPage').then(m => ({ default: m.VentasPage })))
const ContabilidadPage = lazy(() => import('@/modules/contabilidad/ContabilidadPage').then(m => ({ default: m.ContabilidadPage })))
const DashboardPage = lazy(() => import('@/modules/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const EstadisticasPage = lazy(() => import('@/modules/estadisticas/EstadisticasPage').then(m => ({ default: m.EstadisticasPage })))
const ConfigPage = lazy(() => import('@/modules/config/ConfigPage').then(m => ({ default: m.ConfigPage })))
const ComprasPage = lazy(() => import('@/modules/compras/ComprasPage').then(m => ({ default: m.ComprasPage })))
const BuscarPage = lazy(() => import('@/modules/buscar/BuscarPage').then(m => ({ default: m.BuscarPage })))
const PixitAdminPage = lazy(() => import('@/modules/pixitadmin/PixitAdminPage').then(m => ({ default: m.PixitAdminPage })))

function AppRoutes() {
  const { session, cargando, recoveryMode, trialExpirado, cuentaSuspendida, esPlatformAdmin, empresaId } = useAuth()
  // Un platform admin sin empresa propia (solo entra a administrar la plataforma,
  // no opera ningún taller) cae directo al panel — el resto de las rutas requieren empresa.
  const soloPlatformAdmin = esPlatformAdmin && !empresaId

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    )
  }

  // Llegó por el enlace de "olvidé mi contraseña" → fijar nueva clave (antes de todo lo demás)
  if (recoveryMode) return <ResetPassword />

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  // El dueño de Pixit nunca queda bloqueado afuera de su propio panel, aunque
  // su empresa de pruebas esté vencida/suspendida.
  if (!esPlatformAdmin && trialExpirado) return <TrialExpirado motivo="trial" />
  if (!esPlatformAdmin && cuentaSuspendida) return <TrialExpirado motivo="suspendida" />

  return (
    <Shell>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      }>
        <Routes>
          <Route path="/" element={<Navigate to={soloPlatformAdmin ? '/pixit-admin' : '/dashboard'} replace />} />
          <Route path="/login" element={<Navigate to={soloPlatformAdmin ? '/pixit-admin' : '/dashboard'} replace />} />
          {!soloPlatformAdmin && <>
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
          </>}
          {esPlatformAdmin && <Route path="/pixit-admin" element={<PixitAdminPage />} />}
          <Route path="*"              element={<Navigate to={soloPlatformAdmin ? '/pixit-admin' : '/taller'} replace />} />
        </Routes>
      </Suspense>
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
