import { useAuth } from '@/context/AuthContext'

export function TrialExpirado({ motivo = 'trial' }: { motivo?: 'trial' | 'suspendida' }) {
  const { empresaNombre, esAdmin, logout } = useAuth()

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
