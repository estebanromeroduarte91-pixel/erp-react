import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { PLAN_MODULES, MODULO_LABELS, TIER_LIMITS, TIER_ORDER, type PlanTier } from '@/lib/queries/usePlanLimits'

const TIER_NOMBRE: Record<PlanTier, string> = { starter: 'Starter', pro: 'Pro', scale: 'Scale' }

const WHATSAPP_NUM = '56900000000'

function moduloLimits(tier: PlanTier) {
  return TIER_LIMITS[tier]
}

function moduleLossVsScale(tier: PlanTier): string[] {
  return PLAN_MODULES.scale
    .filter(m => !PLAN_MODULES[tier].includes(m))
    .map(m => MODULO_LABELS[m] ?? m)
}

export function TrialExpirado({ motivo = 'trial' }: { motivo?: 'trial' | 'suspendida' }) {
  const { empresaNombre, esAdmin, logout } = useAuth()
  const [tierElegido, setTierElegido] = useState<PlanTier | null>(null)

  if (motivo === 'suspendida' || !esAdmin) {
    return (
      <div className="flex items-center justify-center bg-gradient-to-br from-[#1a2f6e] to-[#3656e6] p-4" style={{ minHeight: '100dvh' }}>
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">
              {motivo === 'suspendida' ? 'Cuenta suspendida' : 'Tu prueba gratuita terminó'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {motivo === 'suspendida'
                ? <>El acceso de <span className="font-semibold text-gray-700">{empresaNombre}</span> está suspendido.</>
                : <>Los 30 días de prueba de <span className="font-semibold text-gray-700">{empresaNombre}</span> ya vencieron.</>}
            </p>
          </div>
          <p className="text-sm text-gray-500">
            {esAdmin
              ? 'Contáctanos para activar tu plan y seguir usando el sistema.'
              : 'Pide al administrador de tu empresa que active el plan para poder seguir usando el sistema.'}
          </p>
          <button onClick={logout} className="w-full text-sm font-medium text-gray-500 hover:text-gray-700">
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  const mensajeWhatsapp = tierElegido
    ? `Hola, mi prueba gratuita de Pixit terminó y quiero activar el plan ${TIER_NOMBRE[tierElegido]} para "${empresaNombre}".`
    : `Hola, mi prueba gratuita de Pixit terminó y quiero activar un plan para "${empresaNombre}".`
  const waHref = `https://wa.me/${WHATSAPP_NUM}?text=${encodeURIComponent(mensajeWhatsapp)}`

  return (
    <div className="bg-gradient-to-br from-[#1a2f6e] to-[#3656e6] p-4 py-10" style={{ minHeight: '100dvh' }}>
      <div className="w-full max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Tu prueba gratuita terminó</h1>
          <p className="text-sm text-blue-100">
            Los 30 días de prueba de <span className="font-semibold text-white">{empresaNombre}</span> ya vencieron.
            Durante la prueba tuviste acceso al plan <span className="font-semibold text-white">Scale completo</span> — elige con qué plan quieres seguir.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {TIER_ORDER.map(tier => {
            const limits = moduloLimits(tier)
            const perdido = moduleLossVsScale(tier)
            const seleccionado = tierElegido === tier
            return (
              <button
                key={tier}
                onClick={() => setTierElegido(tier)}
                className={`text-left rounded-2xl p-5 bg-white shadow-xl transition border-2 ${
                  seleccionado ? 'border-amber-400 ring-2 ring-amber-300' : 'border-transparent hover:border-blue-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-extrabold text-gray-900">{TIER_NOMBRE[tier]}</h3>
                  {tier === 'scale' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Tu prueba</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Hasta {limits.max_usuarios >= 999 ? 'usuarios ilimitados' : `${limits.max_usuarios} usuarios`}
                  {' · '}
                  {limits.max_sucursales >= 999 ? 'sucursales ilimitadas' : `${limits.max_sucursales} sucursal${limits.max_sucursales > 1 ? 'es' : ''}`}
                </p>
                {perdido.length === 0 ? (
                  <p className="text-xs font-medium text-green-700">Incluye todos los módulos, igual que tu prueba.</p>
                ) : (
                  <div className="text-xs text-red-600">
                    <p className="font-semibold mb-1">Perderías acceso a:</p>
                    <ul className="space-y-0.5">
                      {perdido.map(m => (
                        <li key={m} className="flex items-start gap-1">
                          <span>·</span><span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-600">
            {tierElegido
              ? <>Elegiste el plan <span className="font-semibold text-gray-900">{TIER_NOMBRE[tierElegido]}</span>. Escríbenos para coordinar el pago y activarlo.</>
              : 'Elige un plan arriba y luego contáctanos para activarlo.'}
          </p>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-xl transition shadow-sm"
          >
            Continuar por WhatsApp
          </a>
        </div>

        <div className="text-center">
          <button onClick={logout} className="text-sm font-medium text-blue-100 hover:text-white">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
