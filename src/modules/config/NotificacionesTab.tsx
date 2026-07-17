import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { isPushSupported, getCurrentSubscription, registerServiceWorkerAndSubscribe, unsubscribePush } from '@/lib/push'

export function NotificacionesTab() {
  const { empresaId, session } = useAuth()
  const [activo, setActivo] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCurrentSubscription().then((sub) => {
      setActivo(!!sub)
      setCargando(false)
    })
  }, [])

  const soportado = isPushSupported()
  const permisoDenegado = soportado && Notification.permission === 'denied'

  async function toggle() {
    if (!empresaId || !session?.user.id) return
    setError('')
    setProcesando(true)
    try {
      if (activo) {
        await unsubscribePush()
        setActivo(false)
      } else {
        await registerServiceWorkerAndSubscribe(empresaId, session.user.id)
        setActivo(true)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-700">Notificaciones push</h3>
          <span className={[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
            activo ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700',
          ].join(' ')}>
            <span className={['w-1.5 h-1.5 rounded-full', activo ? 'bg-green-500' : 'bg-yellow-500'].join(' ')} />
            {activo ? 'Activas' : 'Desactivadas'}
          </span>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Recibe una notificación en tu celular apenas entra un equipo nuevo a la sucursal, aunque no tengas la app abierta.
        </p>

        {!soportado && (
          <p className="text-sm text-red-600 mb-3">Este navegador no soporta notificaciones push.</p>
        )}
        {permisoDenegado && (
          <p className="text-sm text-red-600 mb-3">
            Bloqueaste los permisos de notificación para este sitio. Actívalos desde la configuración del navegador para poder usarlas.
          </p>
        )}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button onClick={toggle} disabled={!soportado || cargando || procesando}
          className={[
            'px-5 py-2.5 text-sm font-semibold rounded-xl transition disabled:opacity-60',
            activo ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700',
          ].join(' ')}>
          {procesando ? 'Procesando…' : activo ? 'Desactivar notificaciones' : 'Activar notificaciones'}
        </button>

        <p className="text-xs text-gray-400 mt-4">
          En iPhone, primero agrega esta app a tu pantalla de inicio (Compartir → Agregar a inicio) para poder recibir notificaciones.
        </p>
      </div>
    </div>
  )
}
