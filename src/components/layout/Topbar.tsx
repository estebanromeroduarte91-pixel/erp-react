import { useAuth } from '@/context/AuthContext'

export function Topbar() {
  const { empresaNombre, nombre, rol, logout } = useAuth()

  return (
    <header className="fixed top-0 left-64 right-0 z-20 h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
      <h1 className="flex-1 text-sm font-semibold text-gray-700 truncate">{empresaNombre}</h1>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium text-gray-800 leading-none">{nombre}</p>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{rol}</p>
        </div>

        <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold select-none">
          {nombre.charAt(0).toUpperCase() || '?'}
        </div>

        <button
          onClick={logout}
          title="Cerrar sesión"
          className="ml-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>
    </header>
  )
}
