import { Composition } from 'remotion'
import { RecibirEquipo, DURACION } from './RecibirEquipo'
import { Personajes } from './Personajes'

// 1080 × 1920 a 30 cuadros: el formato de Reels, TikTok y Shorts.
export const Root = () => (
  <>
  <Composition
    id="RecibirEquipo"
    component={RecibirEquipo}
    durationInFrames={DURACION}
    fps={30}
    width={1080}
    height={1920}
  />
  {/* Lámina de personajes para revisar el diseño (se exporta como imagen). */}
  <Composition id="Personajes" component={Personajes} durationInFrames={1} fps={30} width={1920} height={1500} />
  </>
)
