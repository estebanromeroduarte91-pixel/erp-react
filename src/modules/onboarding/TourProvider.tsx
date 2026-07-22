import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { onboardingTours, type TourId } from './steps'
import { TourContext } from './TourContext'

export function TourProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [activeTourId, setActiveTourId] = useState<TourId | null>(null)
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isHelpMenuOpen, setHelpMenuOpen] = useState<boolean>(false)

  const activeStep = activeTourId ? onboardingTours[activeTourId][currentStepIdx] || null : null

  // Recalcular la posición del Spotlight para el elemento DOM seleccionado
  const recalcularSpotlight = useCallback(() => {
    if (!activeStep) {
      setTargetRect(prev => prev ? null : null)
      return
    }

    const el = document.getElementById(activeStep.targetId)
    if (el) {
      const newRect = el.getBoundingClientRect()
      setTargetRect(prev => {
        if (
          prev &&
          prev.top === newRect.top &&
          prev.left === newRect.left &&
          prev.width === newRect.width &&
          prev.height === newRect.height
        ) {
          return prev // Evita re-renders si la posición no ha cambiado realmente
        }
        return newRect
      })
    } else {
      setTargetRect(prev => prev ? null : null)
    }
  }, [activeStep])

  // Finalizar el tour activo y limpiar estados (declarada antes para evitar hoisting)
  const finalizarTour = useCallback(() => {
    setActiveTourId(null)
    setCurrentStepIdx(0)
    setTargetRect(null)
  }, [])

  // Iniciar un tour específico y navegar a la ruta del primer paso si es necesario
  const iniciarTour = useCallback((tourId: TourId) => {
    setActiveTourId(tourId)
    setCurrentStepIdx(0)
    
    const primerPaso = onboardingTours[tourId][0]
    if (primerPaso && primerPaso.route && location.pathname !== primerPaso.route) {
      navigate(primerPaso.route)
    }
  }, [navigate, location.pathname])

  // Avanzar al siguiente paso del tour
  const siguientePaso = useCallback(() => {
    if (!activeTourId) return
    const tour = onboardingTours[activeTourId]
    const nextIdx = currentStepIdx + 1

    if (nextIdx >= tour.length) {
      finalizarTour()
      return
    }

    setCurrentStepIdx(nextIdx)
    const nextStep = tour[nextIdx]
    if (nextStep && nextStep.route && location.pathname !== nextStep.route) {
      navigate(nextStep.route)
    }
  }, [activeTourId, currentStepIdx, navigate, location.pathname, finalizarTour])

  // Volver al paso anterior del tour
  const pasoAnterior = useCallback(() => {
    if (!activeTourId || currentStepIdx === 0) return
    const prevIdx = currentStepIdx - 1
    
    setCurrentStepIdx(prevIdx)
    const prevStep = onboardingTours[activeTourId][prevIdx]
    if (prevStep && prevStep.route && location.pathname !== prevStep.route) {
      navigate(prevStep.route)
    }
  }, [activeTourId, currentStepIdx, navigate, location.pathname])

  // Escuchar cambios de ruta, de paso o resize de ventana para recolocar el spotlight
  // Usamos setTimeout para diferir la ejecución y evitar llamadas síncronas a setState en efectos.
  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      recalcularSpotlight()
    }, 0)
    return () => clearTimeout(timer)
  }, [recalcularSpotlight, location.pathname, currentStepIdx])

  useEffect(() => {
    window.addEventListener('resize', recalcularSpotlight)
    window.addEventListener('scroll', recalcularSpotlight, true)
    return () => {
      window.removeEventListener('resize', recalcularSpotlight)
      window.removeEventListener('scroll', recalcularSpotlight, true)
    }
  }, [recalcularSpotlight])

  // Escucha cambios en el DOM de forma reactiva por si el elemento objetivo tarda en renderizarse (ej: tablas o modales)
  useEffect(() => {
    if (!activeStep) return
    
    let frameId: number | null = null
    const observer = new MutationObserver(() => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        recalcularSpotlight()
      })
    })
    
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [activeStep, recalcularSpotlight])

  return (
    <TourContext.Provider
      value={{
        activeTourId,
        currentStepIdx,
        activeStep,
        targetRect,
        iniciarTour,
        siguientePaso,
        pasoAnterior,
        finalizarTour,
        recalcularSpotlight,
        isHelpMenuOpen,
        setHelpMenuOpen,
      }}
    >
      {children}
    </TourContext.Provider>
  )
}
