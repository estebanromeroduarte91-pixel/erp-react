import { createContext, useContext } from 'react'
import { type TourStep, type TourId } from './steps'

export interface TourContextType {
  activeTourId: TourId | null;
  currentStepIdx: number;
  activeStep: TourStep | null;
  targetRect: DOMRect | null;
  iniciarTour: (tourId: TourId) => void;
  siguientePaso: () => void;
  pasoAnterior: () => void;
  finalizarTour: () => void;
  recalcularSpotlight: () => void;
  isHelpMenuOpen: boolean;
  setHelpMenuOpen: (open: boolean) => void;
}

export const TourContext = createContext<TourContextType | undefined>(undefined)

export function useTour() {
  const context = useContext(TourContext)
  if (context === undefined) {
    throw new Error('useTour debe ser usado dentro de un TourProvider')
  }
  return context
}
