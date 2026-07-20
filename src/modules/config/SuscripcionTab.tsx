import {
  useUserProfiles, usePendingInvites, useBodegas, usePlanLimits
} from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

export function SuscripcionTab() {
  const { data: limits, isLoading: loadL } = usePlanLimits()
  const { data: perfiles = [], isLoading: loadU } = useUserProfiles()
  const { data: invites = [], isLoading: loadI } = usePendingInvites()
  const { data: bodegas = [], isLoading: loadB } = useBodegas()

  if (loadL || loadU || loadI || loadB) {
    return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
  }

  const activeUsersCount = perfiles.filter(p => p.activo).length
  const pendingInvitesCount = invites.length
  const totalUsers = activeUsersCount + pendingInvitesCount
  const maxUsuarios = limits?.max_usuarios ?? 1

  const totalBodegas = bodegas.length
  const maxBodegas = limits?.max_sucursales ?? 1

  const usersPct = Math.min(100, Math.round((totalUsers / maxUsuarios) * 100))
  const bodegasPct = Math.min(100, Math.round((totalBodegas / maxBodegas) * 100))

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Mi Plan Actual</h3>
        <p className="text-sm text-gray-500 mt-1">Estás suscrito al plan <strong>{limits?.tier.toUpperCase() ?? 'STARTER'}</strong>.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        
        {/* Progress Usuarios */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-700">Usuarios (Técnicos/Vendedores)</span>
            <span className="text-sm text-gray-500">{totalUsers} / {maxUsuarios}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className={`h-2.5 rounded-full ${usersPct >= 100 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${usersPct}%` }}></div>
          </div>
          {usersPct >= 100 && <p className="text-xs text-red-600 mt-1.5">Límite de usuarios alcanzado.</p>}
        </div>

        {/* Progress Sucursales */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-700">Sucursales (Bodegas)</span>
            <span className="text-sm text-gray-500">{totalBodegas} / {maxBodegas}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className={`h-2.5 rounded-full ${bodegasPct >= 100 ? 'bg-red-500' : 'bg-purple-600'}`} style={{ width: `${bodegasPct}%` }}></div>
          </div>
          {bodegasPct >= 100 && <p className="text-xs text-red-600 mt-1.5">Límite de sucursales alcanzado.</p>}
        </div>

      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div>
          <h4 className="font-bold text-blue-900">¿Necesitas más capacidad?</h4>
          <p className="text-sm text-blue-800 mt-1">Sube al plan PRO o Scale para agregar sucursales y usuarios adicionales ilimitados a tu negocio.</p>
        </div>
        <a 
          href="https://wa.me/56900000000?text=Hola,%20necesito%20hacer%20un%20upgrade%20de%20mi%20plan%20en%20Pixit"
          target="_blank" 
          rel="noreferrer"
          className="flex-shrink-0 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-sm"
        >
          Mejorar mi Plan
        </a>
      </div>
    </div>
  )
}
