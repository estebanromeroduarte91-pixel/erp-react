import { useEffect, useState } from 'react'
import { EMAIL_SEND_RESULT_EVENT, type EmailSendResultEventDetail } from '@/lib/email'

export function EmailSendToast() {
  const [failure, setFailure] = useState<EmailSendResultEventDetail | null>(null)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<EmailSendResultEventDetail>).detail
      if (!detail || detail.ok) return
      setFailure(detail)
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => setFailure(null), 10_000)
    }
    window.addEventListener(EMAIL_SEND_RESULT_EVENT, onResult)
    return () => {
      window.removeEventListener(EMAIL_SEND_RESULT_EVENT, onResult)
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  if (!failure) return null

  return (
    <div className="fixed bottom-5 left-1/2 z-[200] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-red-200 bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-red-100 font-bold text-red-700">!</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">La acción se guardó, pero el correo no salió</p>
          <p className="mt-1 text-xs text-gray-600">Destino: {failure.to}</p>
          <p className="mt-1 break-words text-xs text-red-700">{failure.error || 'No se pudo enviar el correo.'}</p>
        </div>
        <button type="button" onClick={() => setFailure(null)} className="text-lg leading-none text-gray-400 hover:text-gray-700" aria-label="Cerrar">×</button>
      </div>
    </div>
  )
}
