import { useState } from 'react'
import { useChecklist, useGuardarChecklistIngreso, useCatEquipo } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

function ChecklistEditor({ titulo, items, onSave, saving }: {
  titulo: string
  items: string[]
  onSave: (items: string[]) => Promise<void>
  saving: boolean
}) {
  const [lista, setLista] = useState<string[]>(items)
  const [nuevo, setNuevo] = useState('')
  const [guardado, setGuardado] = useState(false)

  // Ajuste de estado durante el render en vez de useEffect (evita el
  // setState síncrono dentro de un efecto) — patrón oficial de React para
  // resetear estado local cuando cambia un prop.
  const [itemsSynced, setItemsSynced] = useState(items)
  if (items !== itemsSynced) {
    setItemsSynced(items)
    setLista(items)
  }

  function agregar() {
    const v = nuevo.trim()
    if (!v || lista.includes(v)) return
    setLista(prev => [...prev, v])
    setNuevo('')
  }

  function editar(i: number, valor: string) {
    setLista(prev => prev.map((it, j) => j === i ? valor : it))
  }
  function eliminar(i: number) { setLista(prev => prev.filter((_, j) => j !== i)) }
  function mover(i: number, dir: -1 | 1) {
    const arr = [...lista]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setLista(arr)
  }

  async function handleSave() {
    await onSave(lista)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-bold text-gray-700 mb-4">{titulo}</h3>

      <ul className="space-y-1.5 mb-4">
        {lista.map((item, i) => (
          <li key={i} className="flex items-center gap-2 group">
            <span className="text-gray-300 cursor-default select-none text-sm w-4 text-center">{i + 1}</span>
            <input value={item} onChange={e => editar(i, e.target.value)}
              className="flex-1 text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100 focus:outline-none focus:border-blue-400" />
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => mover(i, -1)} disabled={i === 0}
                className="w-6 h-6 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button onClick={() => mover(i, 1)} disabled={i === lista.length - 1}
                className="w-6 h-6 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button onClick={() => eliminar(i)}
                className="w-6 h-6 rounded text-gray-300 hover:text-red-500 flex items-center justify-center transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 mb-4">
        <input
          value={nuevo} onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && agregar()}
          placeholder="Nuevo ítem de checklist..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
        />
        <button onClick={agregar}
          className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
          Agregar
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-60 transition">
          {saving ? 'Guardando…' : 'Guardar checklist'}
        </button>
        {guardado && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
      </div>
    </div>
  )
}

export function ChecklistConfigTab() {
  const { data: clIngreso, isLoading: loadI } = useChecklist()
  const { data: categorias = [] } = useCatEquipo()
  const guardarIngreso = useGuardarChecklistIngreso()

  const [catActiva, setCatActiva] = useState(categorias[0] ?? 'Teléfono')

  if (loadI) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  const itemsCatActiva = clIngreso?.[catActiva] ?? []

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-1">Checklist de ingreso y salida</h3>
        <p className="text-xs text-gray-400 mb-3">
          Un iPhone y un notebook no comparten componentes — cada categoría de equipo tiene su propia lista.
          Lo que agregues acá se revisa al ingreso y se vuelve a revisar al entregar el equipo, con los mismos ítems.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCatActiva(cat)}
              className="px-3 py-1 rounded-full text-xs font-medium transition"
              style={cat === catActiva
                ? { background: '#3656e6', color: '#fff' }
                : { background: '#f2f2f7', color: '#6b7280' }}>
              {cat}
              <span className="ml-1 opacity-70">({(clIngreso?.[cat] ?? []).length})</span>
            </button>
          ))}
        </div>
        <ChecklistEditor
          key={catActiva}
          titulo={`Componentes — ${catActiva}`}
          items={itemsCatActiva}
          onSave={items => guardarIngreso.mutateAsync({ ...clIngreso, [catActiva]: items })}
          saving={guardarIngreso.isPending}
        />
      </div>
    </div>
  )
}
