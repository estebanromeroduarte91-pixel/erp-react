import { Composition } from 'remotion'
import { RecibirEquipo, DURACION } from './RecibirEquipo'
import { OrdenesCompra, DURACION_OC } from './OrdenesCompra'
import { KitsEquipos, DURACION_KITS } from './KitsEquipos'
import { Estadisticas, DURACION_STATS } from './Estadisticas'
import { PresentacionPixit, DURACION_PRESENTACION } from './PresentacionPixit'
import { Personajes } from './Personajes'
import { RecibirEquipoPremium } from './RecibirEquipoPremium'
import { DestacadoOrdenIngreso, DestacadoOrdenCompra, DestacadoKits } from './Destacados'
import { FeedOrdenIngreso } from './FeedOrdenIngreso'

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
  <Composition
    id="Estadisticas"
    component={Estadisticas}
    durationInFrames={DURACION_STATS}
    fps={30}
    width={1080}
    height={1920}
  />
  <Composition
    id="PresentacionPixit"
    component={PresentacionPixit}
    durationInFrames={DURACION_PRESENTACION}
    fps={30}
    width={1080}
    height={1920}
  />
  {/* Lámina de personajes para revisar el diseño (se exporta como imagen). */}
  <Composition id="Personajes" component={Personajes} durationInFrames={1} fps={30} width={1920} height={1500} />
  {/* Íconos para los destacados de Instagram (1080×1080, se exportan como imagen). */}
  <Composition id="DestacadoOrdenIngreso" component={DestacadoOrdenIngreso} durationInFrames={1} fps={30} width={1080} height={1080} />
  <Composition id="DestacadoOrdenCompra" component={DestacadoOrdenCompra} durationInFrames={1} fps={30} width={1080} height={1080} />
  <Composition id="DestacadoKits" component={DestacadoKits} durationInFrames={1} fps={30} width={1080} height={1080} />
  {/* Foto para el feed de Instagram (1080×1350, formato 4:5, se exporta como imagen). */}
  <Composition id="FeedOrdenIngreso" component={FeedOrdenIngreso} durationInFrames={1} fps={30} width={1080} height={1350} />
  </>
)
