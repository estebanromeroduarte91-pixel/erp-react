import {
  useUserProfiles, usePendingInvites, useBodegas, usePlanLimits
} from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { PlanTier } from '@/lib/queries/usePlanLimits'
import { useAuth } from '@/context/AuthContext'

function getDiasTrial(trialTermina: string | null): number | null {
  if (!trialTermina) return null
  return Math.ceil((new Date(trialTermina).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export function SuscripcionTab() {
  const { planEstado, trialTermina } = useAuth()
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
  const maxUsuarios = limits?.max_usuarios ?? 999

  const totalBodegas = bodegas.length
  const maxBodegas = limits?.max_sucursales ?? 1

  const currentTier = limits?.tier ?? 'starter'

  // Calcular días restantes de trial
  const diasTrial = getDiasTrial(trialTermina)

  const planes = [
    {
      id: 'starter' as PlanTier,
      nombre: 'Starter',
      precio: '0,5 UF',
      descripcion: 'Ideal para talleres que inician y quieren digitalizar sus órdenes de trabajo.',
      caracteristicas: [
        '1 Sucursal / Bodega',
        'Usuarios ilimitados',
        'Módulo Taller (Órdenes)',
        'Gestión de Inventario',
        'Automatización de correos a clientes',
        'Estadísticas de taller',
        'Seguimiento Post-Venta',
        'Gestión de permisos y roles',
      ],
      color: 'border-gray-200 hover:border-blue-300',
      badgeColor: 'bg-gray-100 text-gray-700',
    },
    {
      id: 'pro' as PlanTier,
      nombre: 'PRO',
      precio: '1,2 UF',
      descripcion: 'El motor completo para expandir tu negocio, vender en sucursal y compras.',
      caracteristicas: [
        '2 Sucursales / Bodegas',
        'Usuarios ilimitados',
        'Módulo Taller (Órdenes)',
        'Punto de Venta (POS) / Caja',
        'Gestión de Inventario',
        'Módulo Gastos',
        'Módulo Compras (OC)',
        'Automatización de correos a clientes',
        'Estadísticas de taller y ventas',
        'Seguimiento Post-Venta',
        'Gestión de permisos y roles',
      ],
      destacado: true,
      color: 'border-blue-500 shadow-md hover:shadow-lg',
      badgeColor: 'bg-blue-100 text-blue-800',
    },
    {
      id: 'scale' as PlanTier,
      nombre: 'Scale',
      precio: '2,5 UF',
      descripcion: 'El plan ilimitado diseñado para franquicias, cadenas y negocios en gran escala.',
      caracteristicas: [
        'Sucursales / Bodegas ilimitadas',
        'Usuarios ilimitados',
        'Módulo Taller (Órdenes)',
        'Punto de Venta (POS) / Caja',
        'Gestión de Inventario',
        'Módulo Gastos y Compras',
        'Correos automáticos a clientes',
        'Estadísticas de taller y ventas',
        'Seguimiento Post-Venta',
        'Gestión de permisos y roles',
      ],
      color: 'border-gray-200 hover:border-purple-300',
      badgeColor: 'bg-purple-100 text-purple-800',
    }
  ]

  const usersPct = Math.min(100, Math.round((totalUsers / maxUsuarios) * 100))
  const bodegasPct = Math.min(100, Math.round((totalBodegas / maxBodegas) * 100))

  return (
    <div className="max-w-5xl space-y-8">
      
      {/* Encabezado e Info General de la Cuenta */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">Suscripción de la Empresa</span>
          <h3 className="text-xl font-bold text-gray-955 mt-0.5">
            Plan actual: <span className="text-blue-600">{currentTier.toUpperCase()}</span>
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {planEstado === 'trial' ? (
              <span>Período de prueba ({diasTrial !== null && diasTrial >= 0 ? `${diasTrial} días restantes` : 'vencido'})</span>
            ) : planEstado === 'activo' ? (
              <span>Tu cuenta tiene una suscripción activa y al día</span>
            ) : (
              <span>Estado de cuenta: {planEstado ?? 'Sin registrar'}</span>
            )}
          </p>
        </div>
        
        {/* Límites rápidos */}
        <div className="flex gap-4">
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 text-center min-w-[110px]">
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Sucursales</div>
            <div className="text-xl font-extrabold text-gray-800 mt-1">{totalBodegas} / {maxBodegas === 999 ? '∞' : maxBodegas}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 text-center min-w-[110px]">
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Usuarios</div>
            <div className="text-xl font-extrabold text-gray-800 mt-1">{totalUsers} / {maxUsuarios === 999 ? '∞' : maxUsuarios}</div>
          </div>
        </div>
      </div>

      {/* Consumo Detallado */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
        <h4 className="text-sm font-bold text-gray-800 tracking-wide">Uso de recursos de tu plan</h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Progreso Sucursales */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Sucursales / Bodegas creadas</span>
              <span className="text-sm font-semibold text-gray-800">{totalBodegas} de {maxBodegas === 999 ? 'Ilimitadas' : maxBodegas}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full ${bodegasPct >= 100 ? 'bg-amber-500' : 'bg-purple-600'}`} style={{ width: `${bodegasPct}%` }}></div>
            </div>
            {bodegasPct >= 100 && maxBodegas !== 999 && (
              <p className="text-[11px] text-amber-600 mt-2 font-medium">Estás en el límite de sucursales para el Plan {currentTier.toUpperCase()}. Sube al siguiente plan para abrir más.</p>
            )}
          </div>

          {/* Progreso Usuarios */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Usuarios Activos (Técnicos/Vendedores)</span>
              <span className="text-sm font-semibold text-gray-800">{totalUsers} de {maxUsuarios === 999 ? 'Ilimitados' : maxUsuarios}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full ${usersPct >= 100 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${usersPct}%` }}></div>
            </div>
            {usersPct >= 100 && maxUsuarios !== 999 && (
              <p className="text-[11px] text-red-600 mt-2 font-medium">Has alcanzado el límite de usuarios permitidos.</p>
            )}
          </div>
        </div>
      </div>

      {/* Tarjetas de Comparativa de Planes */}
      <div>
        <div className="mb-5">
          <h4 className="text-sm font-bold text-gray-400 tracking-wider uppercase">Planes disponibles</h4>
          <p className="text-xs text-gray-500 mt-1">Escoge el plan que mejor se adapte a las necesidades de tu taller.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {planes.map(p => {
            const esPlanActual = currentTier === p.id && planEstado !== 'trial'
            return (
              <div 
                key={p.id} 
                className={`bg-white border rounded-2xl p-6 transition flex flex-col justify-between relative ${p.color} ${
                  esPlanActual ? 'border-2 border-blue-600 shadow-md' : 'border-gray-200'
                }`}
              >
                {/* Indicador de Plan Actual */}
                {esPlanActual && (
                  <span className="absolute -top-3.5 left-6 px-3 py-1 bg-green-600 text-white text-[10px] font-extrabold tracking-widest uppercase rounded-full shadow-sm">
                    Plan Activo
                  </span>
                )}
                {p.destacado && !esPlanActual && (
                  <span className="absolute -top-3.5 left-6 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-extrabold tracking-widest uppercase rounded-full shadow-sm">
                    Recomendado
                  </span>
                )}

                <div>
                  <div className="flex justify-between items-start">
                    <h5 className="text-lg font-bold text-gray-900">{p.nombre}</h5>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded ${p.badgeColor}`}>
                      {p.id}
                    </span>
                  </div>
                  
                  <div className="mt-4 flex items-baseline">
                    <span className="text-3xl font-extrabold text-gray-900">{p.precio}</span>
                    <span className="text-xs text-gray-500 font-medium ml-1.5">+ IVA / mes</span>
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-2 min-h-[32px]">{p.descripcion}</p>

                  <div className="border-t border-gray-100 my-4"></div>

                  <ul className="space-y-3">
                    {p.caracteristicas.map((c, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-600">
                        <svg className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8">
                  {esPlanActual ? (
                    <button 
                      disabled 
                      className="w-full py-2.5 bg-slate-50 text-slate-400 font-bold text-xs rounded-xl border border-slate-200 cursor-default"
                    >
                      Plan Actual Activo
                    </button>
                  ) : (
                    <a 
                      href={`https://wa.me/56900000000?text=Hola,%20me%20gustaria%20activar%20el%20plan%20${p.nombre.toUpperCase()}%20en%20Pixit`}
                      target="_blank" 
                      rel="noreferrer"
                      className={`w-full block text-center py-2.5 font-bold text-xs rounded-xl transition ${
                        p.destacado 
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200' 
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {currentTier === 'starter' && p.id !== 'starter' ? 'Mejorar mi Plan' : 'Cambiar a este Plan'}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
