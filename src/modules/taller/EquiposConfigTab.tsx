import { useState } from 'react'
import { useCatEquipo, useGuardarCatEquipo, useMarcasEquipo, useGuardarMarcasEquipo } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

function ListaEditable({
  titulo, descripcion, items, onGuardar, isPending,
}: {
  titulo: string
  descripcion: string
  items: string[]
  onGuardar: (lista: string[]) => Promise<void>
  isPending: boolean
}) {
  const [lista, setLista] = useState<string[]>(items)
  const [nuevo, setNuevo] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [guardado, setGuardado] = useState(false)

  function agregar() {
    const v = nuevo.trim()
    if (!v || lista.includes(v)) return
    setLista(prev => [...prev, v])
    setNuevo('')
  }

  function eliminar(i: number) {
    setLista(prev => prev.filter((_, idx) => idx !== i))
  }

  function iniciarEditar(i: number) {
    setEditIdx(i)
    setEditVal(lista[i])
  }

  function confirmarEditar() {
    const v = editVal.trim()
    if (!v || editIdx === null) { setEditIdx(null); return }
    setLista(prev => prev.map((x, i) => i === editIdx ? v : x))
    setEditIdx(null)
  }

  async function guardar() {
    await onGuardar(lista)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{descripcion}</p>
      </div>

      {/* Lista */}
      <div className="space-y-1 mb-4 max-h-72 overflow-y-auto">
        {lista.map((item, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 group">
            {editIdx === i ? (
              <>
                <input
                  autoFocus
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarEditar(); if (e.key === 'Escape') setEditIdx(null) }}
                  className="flex-1 text-sm border border-blue-300 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 bg-white"
                />
                <button onClick={confirmarEditar} className="text-xs text-blue-600 font-medium hover:underline">OK</button>
                <button onClick={() => setEditIdx(null)} className="text-xs text-gray-400 hover:underline">✕</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-700">{item}</span>
                <button onClick={() => iniciarEditar(i)}
                  className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition hover:underline">
                  Editar
                </button>
                <button onClick={() => eliminar(i)}
                  className="text-xs text-red-400 opacity-0 group-hover:opacity-100 transition hover:underline">
                  Eliminar
                </button>
              </>
            )}
          </div>
        ))}
        {lista.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Sin elementos. Agrega el primero.</p>
        )}
      </div>

      {/* Agregar */}
      <div className="flex gap-2 mb-4">
        <input
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && agregar()}
          placeholder={`Nuevo ${titulo.toLowerCase().slice(0, -1)}…`}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-blue-400"
        />
        <button onClick={agregar} disabled={!nuevo.trim()}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition">
          Agregar
        </button>
      </div>

      {/* Guardar */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
        {guardado && <span className="text-xs text-green-600 font-medium">✓ Guardado</span>}
        <button onClick={guardar} disabled={isPending}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
          {isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

export function EquiposConfigTab() {
  const { data: categorias, isLoading: loadCat } = useCatEquipo()
  const { data: marcas, isLoading: loadMar } = useMarcasEquipo()
  const guardarCat = useGuardarCatEquipo()
  const guardarMar = useGuardarMarcasEquipo()

  if (loadCat || loadMar) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="space-y-5 max-w-2xl">
      <ListaEditable
        titulo="Categorías"
        descripcion="Tipos de dispositivos disponibles al registrar un equipo."
        items={categorias ?? []}
        onGuardar={cats => guardarCat.mutateAsync(cats)}
        isPending={guardarCat.isPending}
      />
      <ListaEditable
        titulo="Marcas"
        descripcion="Fabricantes disponibles como sugerencia al registrar un equipo."
        items={marcas ?? []}
        onGuardar={marcas => guardarMar.mutateAsync(marcas)}
        isPending={guardarMar.isPending}
      />
    </div>
  )
}
