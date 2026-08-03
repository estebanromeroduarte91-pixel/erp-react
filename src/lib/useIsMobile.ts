import { useState, useEffect } from 'react'

export function useIsMobile() {
  // Coincide con el breakpoint `md` de Tailwind. Antes el JS cambiaba a
  // escritorio en 640 px mientras el CSS seguía en móvil hasta 768 px.
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}
