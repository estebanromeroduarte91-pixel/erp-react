// Pantalla que reemplaza un módulo completo cuando el plan de la empresa no lo
// incluye — cubre tanto el ítem oculto en el menú como a alguien que fuerza la
// URL directa. Mismo botón de contacto que ya usa SuscripcionTab.tsx.
export function ModuloBloqueado({ nombre }: { nombre: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{nombre} no está disponible en tu plan</h2>
        <p className="text-sm text-gray-500 mt-2">
          Este módulo requiere un plan superior. Mejora tu plan para desbloquearlo.
        </p>
        <a
          href="https://wa.me/56900000000?text=Hola,%20necesito%20hacer%20un%20upgrade%20de%20mi%20plan%20en%20Pixit"
          target="_blank"
          rel="noreferrer"
          className="inline-flex mt-5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-sm"
        >
          Mejorar mi Plan
        </a>
      </div>
    </div>
  )
}
