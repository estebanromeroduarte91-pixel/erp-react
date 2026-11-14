import { Composition } from 'remotion'
import { RecibirEquipo, DURACION } from './RecibirEquipo'
import { OrdenesCompra, DURACION_OC } from './OrdenesCompra'
import { KitsEquipos, DURACION_KITS } from './KitsEquipos'
import { Personajes } from './Personajes'
import { RecibirEquipoPremium } from './RecibirEquipoPremium'

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
  <Composition
    id="OrdenesCompra"
    component={OrdenesCompra}
    durationInFrames={DURACION_OC}
    fps={30}
    width={1080}
    height={1920}
  />
  <Composition
    id="KitsEquipos"
    component={KitsEquipos}
    durationInFrames={DURACION_KITS}
    fps={30}
    width={1080}
    height={1920}
  />
  <Composition id="RecibirEquipoPremium" component={RecibirEquipoPremium} durationInFrames={DURACION} fps={30} width={1080} height={1920} />
  {/* Lámina de personajes para revisar el diseño (se exporta como imagen). */}
  <Composition id="Personajes" component={Personajes} durationInFrames={1} fps={30} width={1920} height={1500} />
  </>
)
