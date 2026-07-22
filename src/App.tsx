import { Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { usePuedeUsarModulo } from '@/lib/queries'
import { Login } from '@/modules/auth/Login'
import { ResetPassword } from '@/modules/auth/ResetPassword'
import { TrialExpirado } from '@/modules/auth/TrialExpirado'
import { LandingPage } from '@/modules/landing/LandingPage'
import { Shell } from '@/components/layout/Shell'
import { Spinner } from '@/components/shared/Spinner'
import { ModuloBloqueado } from '@/components/shared/ModuloBloqueado'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { lazyWithReload } from '@/lib/lazyWithReload'
import { TourProvider } from '@/modules/onboarding/TourProvider'
import { TourOverlay } from '@/modules/onboarding/TourOverlay'

// Carga perezosa (Lazy Loading) de todos los módulos pesados del ERP.
// lazyWithReload (en vez de lazy de React) recarga la página sola una vez si
// el chunk pedido ya no existe en el servidor (deploy nuevo mientras la
// pestaña seguía abierta) — evita la pantalla en blanco tras un despliegue.
const TallerPage = lazyWithReload(() => import('@/modules/taller/TallerPage').then(m => ({ default: m.TallerPage })))
const InventarioPage = lazyWithReload(() => import('@/modules/inventario/InventarioPage').then(m => ({ default: m.InventarioPage })))
const ContactosPage = lazyWithReload(() => import('@/modules/contactos/ContactosPage').then(m => ({ default: m.ContactosPage })))
const VentasPage = lazyWithReload(() => import('@/modules/ventas/VentasPage').then(m => ({ default: m.VentasPage })))
const ContabilidadPage = lazyWithReload(() => import('@/modules/contabilidad/ContabilidadPage').then(m => ({ default: m.ContabilidadPage })))
const DashboardPage = lazyWithReload(() => import('@/modules/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const EstadisticasPage = lazyWithReload(() => import('@/modules/estadisticas/EstadisticasPage').then(m => ({ default: m.EstadisticasPage })))
const ConfigPage = lazyWithReload(() => import('@/modules/config/ConfigPage').then(m => ({ default: m.ConfigPage })))
const ComprasPage = lazyWithReload(() => import('@/modules/compras/ComprasPage').then(m => ({ default: m.ComprasPage })))
const BuscarPage = lazyWithReload(() => import('@/modules/buscar/BuscarPage').then(m => ({ default: m.BuscarPage })))
const CotizacionesPage = lazyWithReload(() => import('@/modules/cotizaciones/CotizacionesPage').then(m => ({ default: m.CotizacionesPage })))
const PixitAdminPage = lazyWithReload(() => import('@/modules/pixitadmin/PixitAdminPage').then(m => ({ default: m.PixitAdminPage })))

function AppRoutes() {
  const location = useLocation()
  const { session, cargando, recoveryMode, trialExpirado, cuentaSuspendida, esPlatformAdmin, empresaId } = useAuth()
  // Un platform admin sin empresa propia (solo entra a administrar la plataforma,
  // no opera ningún taller) cae directo al panel — el resto de las rutas requieren empresa.
  const soloPlatformAdmin = esPlatformAdmin && !empresaId
  const puedeCompras = usePuedeUsarModulo('compras')
  const puedeGastos = usePuedeUsarModulo('gastos')

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
      <ErrorBoundary key={location.pathname + location.search}>
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
            <Route path="/cotizaciones" element={<CotizacionesPage />} />
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/inventario"    element={<InventarioPage />} />
            <Route path="/ventas"        element={<VentasPage />} />
            <Route path="/contactos"     element={<ContactosPage />} />
            <Route path="/contabilidad"  element={puedeGastos ? <ContabilidadPage /> : <ModuloBloqueado nombre="Gastos" />} />
            <Route path="/estadisticas"  element={<EstadisticasPage />} />
            <Route path="/config"        element={<ConfigPage />} />
            <Route path="/compras"       element={puedeCompras ? <ComprasPage /> : <ModuloBloqueado nombre="Compras" />} />
            <Route path="/buscar"        element={<BuscarPage />} />
          </>}
          {esPlatformAdmin && <Route path="/pixit-admin" element={<PixitAdminPage />} />}
          <Route path="*"              element={<Navigate to={soloPlatformAdmin ? '/pixit-admin' : '/taller'} replace />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </Shell>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <TourProvider>
          <AppRoutes />
          <TourOverlay />
        </TourProvider>
      </HashRouter>
    </ErrorBoundary>
  )
}
