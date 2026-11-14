import { loadFont } from '@remotion/google-fonts/Manrope'

// Los mismos tokens de src/index.css de Pixit, para que el video se vea como
// la app y no como una pieza aparte.
export const C = {
  azul: '#3656e6',
  azulOscuro: '#2f4dd6',
  azulClaro: '#ecefff',
  azulMedio: '#c7d0f8',
  verde: '#0c9b66',
  verdeClaro: '#e7f7ef',
  ambar: '#b7791f',
  ambarClaro: '#fdf6e7',
  fondo: '#eef0f5',
  g100: '#eceef2',
  g200: '#dfe2e8',
  g400: '#a2a8b4',
  g500: '#646c7a',
  g700: '#2a3040',
  g800: '#15181f',
  piel: '#f6d7bf',
}

export const { fontFamily } = loadFont('normal', { weights: ['500', '600', '700', '800'], subsets: ['latin'] })
