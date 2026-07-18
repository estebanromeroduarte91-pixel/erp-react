import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '@/context/AuthContext'
import { urlFotosQR } from '@/lib/email'

interface Props {
  ordenId: string
  tipo?: 'ingreso' | 'inspeccion' | 'salida' | 'traslado'
  onClose: () => void
}

// Muestra un QR que apunta a la página externa de subida de fotos desde iPhone.
// Las fotos se sincronizan solas porque OrdenModal escucha el realtime de la tabla `ordenes`.
export function QrFotosModal({ ordenId, tipo = 'ingreso', onClose }: Props) {
  const { empresaId } = useAuth()
  const [dataUrl, setDataUrl] = useState('')
  const [copiado, setCopiado] = useState(false)

  const url = empresaId ? urlFotosQR(empresaId, ordenId, tipo) : ''

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then(setDataUrl)
      .catch(() => setDataUrl(''))
  }, [url])

  function copiar() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    })
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-5">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-7 text-center">
        <h3 className="text-base font-bold text-gray-900 flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="7" y="2" width="10" height="20" rx="2" /><path strokeLinecap="round" d="M11 18h2" />
          </svg>
          Subir fotos desde iPhone
        </h3>
        <p className="text-sm text-gray-500 mt-2 mb-5 leading-relaxed">
          Escanea el QR con la cámara del iPhone. Las fotos se sincronizan automáticamente.
        </p>

        <div className="inline-flex items-center justify-center p-3 border border-gray-200 rounded-xl mb-4 bg-white min-h-[180px] min-w-[180px]">
          {dataUrl
            ? <img src={dataUrl} alt="QR para subir fotos" className="w-44 h-44" />
            : <span className="text-xs text-gray-400">Generando QR…</span>}
        </div>

        <p className="text-[11px] text-gray-400 break-all mb-4">{url}</p>

        <div className="flex gap-2 justify-center">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition">
            Cerrar
          </button>
          <button onClick={copiar}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">
            {copiado ? 'Copiada' : 'Copiar URL'}
          </button>
        </div>
      </div>
    </div>
  )
}
