import { useState } from 'react'
import { createPortal } from 'react-dom'

function fechaLocalHoy() {
  const ahora = new Date()
  const desfase = ahora.getTimezoneOffset() * 60_000
  return new Date(ahora.getTime() - desfase).toISOString().slice(0, 10)
}

/**
 * Registrar el pago de una comisión. Vive en su propio archivo porque se usa
 * desde dos lados: la ficha de la orden y el listado de Comisiones, que es
 * donde uno revisa qué falta pagar.
 */
export function PagoComisionModal({ tecnico, monto, onClose, onConfirm }: {
  tecnico: string
  monto: number
  onClose: () => void
  onConfirm: (data: { fecha: string; metodo: string }) => Promise<void>
}) {
  const [fecha, setFecha] = useState(fechaLocalHoy)
  const [metodo, setMetodo] = useState('Transferencia')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    setGuardando(true)
    setError('')
    try {
      await onConfirm({ fecha, metodo })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.')
      setGuardando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div><p className="text-base font-bold text-gray-900">Registrar pago de comisión</p><p className="text-xs text-gray-500 mt-1">{tecnico}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 flex justify-between items-center"><span className="text-xs font-semibold text-green-800">Monto a pagar</span><strong className="text-lg text-green-700">${Math.round(monto).toLocaleString('es-CL')}</strong></div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1.5">Método de pago</label><select value={metodo} onChange={e => setMetodo(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Cheque</option></select></div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1.5">Fecha de pago</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
          <p className="text-[11px] leading-relaxed text-gray-500">Al confirmar, Pixit marcará la comisión como pagada y creará el gasto en la categoría Comisiones.</p>
          {error && <p className="text-xs text-red-600 rounded-lg bg-red-50 p-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 bg-gray-50 border-t border-gray-100 px-5 py-4"><button onClick={onClose} disabled={guardando} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">Cancelar</button><button onClick={() => void confirmar()} disabled={guardando} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">{guardando ? 'Registrando…' : 'Confirmar pago'}</button></div>
      </div>
    </div>,
    document.body,
  )
}
