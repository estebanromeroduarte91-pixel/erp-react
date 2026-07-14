import { useState, useEffect } from 'react'
import { useTerminos, useGuardarTerminos } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

export function TerminosTab() {
  const { data: terminos, isLoading } = useTerminos()
  const guardar = useGuardarTerminos()
  const [texto, setTexto] = useState('')
  const [guardado, setGuardado] = useState(false)

  useEffect(() => { if (terminos !== undefined) setTexto(terminos) }, [terminos])

  async function handleGuardar() {
    await guardar.mutateAsync(texto)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-1">Términos y condiciones</h3>
        <p className="text-xs text-gray-400 mb-4">Este texto se incluye en los correos y reportes de ingreso enviados al cliente.</p>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={14}
          placeholder="Ej: El taller no se responsabiliza por daños previos no declarados al momento del ingreso..."
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none"
        />
        <div className="flex items-center gap-3 mt-4">
          <button onClick={handleGuardar} disabled={guardar.isPending}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition">
            {guardar.isPending ? 'Guardando…' : 'Guardar términos'}
          </button>
          {guardado && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
        </div>
      </div>
    </div>
  )
}
