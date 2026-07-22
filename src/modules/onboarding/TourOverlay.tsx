import { useTour } from './TourContext'
import { onboardingTours } from './steps'

export function TourOverlay() {
  const {
    activeTourId,
    currentStepIdx,
    activeStep,
    targetRect,
    siguientePaso,
    pasoAnterior,
    finalizarTour,
    iniciarTour,
    isHelpMenuOpen,
    setHelpMenuOpen,
  } = useTour()

  const tourLength = activeTourId ? onboardingTours[activeTourId].length : 0
  const esUltimoPaso = currentStepIdx === tourLength - 1
  const overlayClass = "fixed bg-slate-900/40 backdrop-blur-[1px] z-[99] pointer-events-auto transition-all duration-300"

  // Calcular las coordenadas de posicionamiento del Popover directamente durante el render
  let popoverTop = 0
  let popoverLeft = 0

  if (activeStep) {
    const popoverWidth = 320
    const popoverHeight = 180

    if (targetRect) {
      const pos = activeStep.position || 'bottom'
      
      if (pos === 'right') {
        popoverTop = targetRect.top + (targetRect.height / 2) - (popoverHeight / 2)
        popoverLeft = targetRect.right + 20
      } else if (pos === 'left') {
        popoverTop = targetRect.top + (targetRect.height / 2) - (popoverHeight / 2)
        popoverLeft = targetRect.left - popoverWidth - 20
      } else if (pos === 'top') {
        popoverTop = targetRect.top - popoverHeight - 20
        popoverLeft = targetRect.left + (targetRect.width / 2) - (popoverWidth / 2)
      } else { // bottom
        popoverTop = targetRect.bottom + 20
        popoverLeft = targetRect.left + (targetRect.width / 2) - (popoverWidth / 2)
      }
    } else {
      popoverTop = window.innerHeight / 2 - (popoverHeight / 2)
      popoverLeft = window.innerWidth / 2 - (popoverWidth / 2)
    }

    // Asegurar límites del viewport
    popoverLeft = Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, popoverLeft))
    popoverTop = Math.max(16, Math.min(window.innerHeight - popoverHeight - 16, popoverTop))
  }

  return (
    <>
      {/* 1. MÁSCARA Y POPULAR CARD DEL TOUR (Solo cuando el tour está activo) */}
      {activeStep && (
        <>
          {targetRect ? (
            <>
              {/* Panel Superior */}
              <div 
                className={overlayClass}
                style={{ top: 0, left: 0, right: 0, height: Math.max(0, targetRect.top - 6) }}
              />
              {/* Panel Inferior */}
              <div 
                className={overlayClass}
                style={{ top: targetRect.bottom + 6, left: 0, right: 0, bottom: 0 }}
              />
              {/* Panel Izquierdo */}
              <div 
                className={overlayClass}
                style={{ 
                  top: Math.max(0, targetRect.top - 6), 
                  left: 0, 
                  width: Math.max(0, targetRect.left - 6), 
                  height: targetRect.height + 12 
                }}
              />
              {/* Panel Derecho */}
              <div 
                className={overlayClass}
                style={{ 
                  top: Math.max(0, targetRect.top - 6), 
                  left: targetRect.right + 6, 
                  right: 0, 
                  height: targetRect.height + 12 
                }}
              />
              
              <div 
                className="fixed rounded-xl border border-blue-400/50 shadow-[0_0_12px_rgba(37,99,235,0.25)] pointer-events-none transition-all duration-300 z-[100]"
                style={{
                  top: targetRect.top - 6,
                  left: targetRect.left - 6,
                  width: targetRect.width + 12,
                  height: targetRect.height + 12
                }}
              >
                <span className="absolute -inset-1 rounded-xl border border-blue-400/30 animate-ping opacity-75"></span>
              </div>
            </>
          ) : (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-[99]" />
          )}

          <div
            className="fixed bg-white/95 backdrop-blur-md border border-slate-200/50 shadow-2xl rounded-2xl p-5 w-80 flex flex-col gap-4 transition-all duration-300 ease-out z-[101]"
            style={{ top: popoverTop, left: popoverLeft }}
          >
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                Paso {currentStepIdx + 1} de {tourLength}
              </span>
              <button 
                onClick={finalizarTour}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none font-semibold transition"
              >
                ×
              </button>
            </div>

            <div>
              <h4 className="font-bold text-slate-800 text-sm">
                {activeStep.title}
              </h4>
              <p 
                className="text-xs text-slate-600 mt-2 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: activeStep.content }}
              />
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button 
                onClick={finalizarTour}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition"
              >
                Omitir
              </button>
              <div className="flex gap-1.5">
                {currentStepIdx > 0 && (
                  <button 
                    onClick={pasoAnterior}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition"
                  >
                    Atrás
                  </button>
                )}
                <button 
                  onClick={siguientePaso}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  {esUltimoPaso ? 'Finalizar' : 'Siguiente'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 2. DROPDOWN DE CENTRO DE AYUDA (Se posiciona al lado del Sidebar, reactivo a state) */}
      <div 
        className={`fixed left-[245px] bottom-14 z-[90] transition-all duration-300 transform ${
          isHelpMenuOpen 
            ? 'opacity-100 scale-100 translate-x-0 pointer-events-auto' 
            : 'opacity-0 scale-95 -translate-x-2 pointer-events-none'
        }`}
      >
        <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl p-5 w-80 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">Centro de Ayuda</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Guías interactivas del sistema</p>
            </div>
            <button 
              onClick={() => setHelpMenuOpen(false)}
              className="text-[11px] text-slate-400 hover:text-slate-600 font-semibold"
            >
              Cerrar
            </button>
          </div>

          <div className="space-y-2">
            <button 
              onClick={() => { iniciarTour('config'); setHelpMenuOpen(false) }}
              className="w-full text-left p-3 hover:bg-blue-50 border border-slate-100 rounded-xl transition flex justify-between items-center group"
            >
              <div>
                <p className="font-bold text-xs text-slate-800">1. Ajustes e Inicialización</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Sucursales, logotipos y SMTP</p>
              </div>
              <svg className="w-3.5 h-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-4px] group-hover:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button 
              onClick={() => { iniciarTour('inventory'); setHelpMenuOpen(false) }}
              className="w-full text-left p-3 hover:bg-blue-50 border border-slate-100 rounded-xl transition flex justify-between items-center group"
            >
              <div>
                <p className="font-bold text-xs text-slate-800">2. Cargar Inventario</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Productos y carga masiva Excel</p>
              </div>
              <svg className="w-3.5 h-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-4px] group-hover:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button 
              onClick={() => { iniciarTour('operation'); setHelpMenuOpen(false) }}
              className="w-full text-left p-3 hover:bg-blue-50 border border-slate-100 rounded-xl transition flex justify-between items-center group"
            >
              <div>
                <p className="font-bold text-xs text-slate-800">3. Ventas y Órdenes</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Flujo diario taller y POS</p>
              </div>
              <svg className="w-3.5 h-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-4px] group-hover:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button 
              onClick={() => { iniciarTour('finance'); setHelpMenuOpen(false) }}
              className="w-full text-left p-3 hover:bg-blue-50 border border-slate-100 rounded-xl transition flex justify-between items-center group"
            >
              <div>
                <p className="font-bold text-xs text-slate-800">4. Flujo Financiero</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Órdenes de Compra y Gastos</p>
              </div>
              <svg className="w-3.5 h-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-4px] group-hover:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <p className="text-[9px] text-center text-slate-400">Pixit Onboarding v1.0 • Reduce el soporte técnico</p>
        </div>
      </div>
    </>
  )
}
