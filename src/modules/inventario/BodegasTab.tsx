import { useState } from 'react'
import { useBodegas, useGuardarBodegas } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Bodega } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export function BodegasTab() {
  const { data: bodegas, isLoading } = useBodegas()
  const guardar = useGuardarBodegas()
  const [nombre, setNombre] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function agregar() {
    if (!nombre.trim()) return
    setGuardando(true)
    const nueva: Bodega = { id: uid(), nombre: nombre.trim() }
    await guardar.mutateAsync([...(bodegas ?? []), nueva])
    setNombre('')
    setGuardando(false)
  }

  async function guardarEdicion(id: string) {
    if (!editNombre.trim()) return
    setGuardando(true)
    await guardar.mutateAsync(
      (bodegas ?? []).map((b) => b.id === id ? { ...b, nombre: editNombre.trim(), name: editNombre.trim() } : b)
    )
    setEditId(null)
    setGuardando(false)
  }

  async function eliminar(id: string) {
    const b = (bodegas ?? []).find((x) => x.id === id)
    if (!confirm(`¿Eliminar "${b?.nombre ?? b?.name}"?`)) return
    await guardar.mutateAsync((bodegas ?? []).filter((x) => x.id !== id))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-4">
        Las bodegas o sucursales permiten llevar stock separado por ubicación.
      </p>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        {(bodegas ?? []).length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">No hay bodegas todavía</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {(bodegas ?? []).map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                {editId === b.id ? (
                  <>
                    <input autoFocus value={editNombre} onChange={(e) => setEditNombre(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && guardarEdicion(b.id)}
                      className="flex-1 text-sm border border-blue-300 rounded-lg px-3 py-1.5 focus:outline-none" />
                    <button onClick={() => guardarEdicion(b.id)} disabled={guardando}
                      className="text-xs font-semibold text-white bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                      Guardar
                    </button>
                    <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-800">{b.nombre ?? b.name}</span>
                    <button onClick={() => { setEditId(b.id); setEditNombre(b.nombre ?? b.name ?? '') }}
                      className="text-xs text-blue-600 hover:underline">Editar</button>
                    <button onClick={() => eliminar(b.id)}
                      className="text-xs text-red-500 hover:underline">Eliminar</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Agregar nueva */}
      <div className="flex gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && agregar()}
          placeholder="Nombre de la bodega o sucursal..."
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-blue-400" />
        <button onClick={agregar} disabled={guardando || !nombre.trim()}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
          Agregar
        </button>
      </div>
    </div>
  )
}
