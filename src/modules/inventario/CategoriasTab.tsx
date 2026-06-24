import { useState } from 'react'
import { useCategorias, useGuardarCategorias } from '@/lib/queries'
import type { Categoria } from '@/types'

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

function ModalCategoria({
  cat, onSave, onClose,
}: {
  cat?: Categoria
  onSave: (c: Categoria) => void
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(cat?.nombre ?? '')
  const [subInput, setSubInput] = useState('')
  const [subs, setSubs] = useState<string[]>(cat?.subcategorias ?? [])

  function addSub() {
    const s = subInput.trim()
    if (!s || subs.includes(s)) return
    setSubs(prev => [...prev, s])
    setSubInput('')
  }

  function removeSub(s: string) {
    setSubs(prev => prev.filter(x => x !== s))
  }

  function handleSave() {
    if (!nombre.trim()) return alert('Ingresa un nombre para la categoría')
    onSave({ id: cat?.id ?? uid(), nombre: nombre.trim(), subcategorias: subs })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{cat ? 'Editar' : 'Nueva'} categoría</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nombre</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Accesorios" autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Subcategorías</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="text" value={subInput} onChange={e => setSubInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSub()}
                placeholder="Agregar subcategoría..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              <button onClick={addSub}
                className="px-3 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">
                + Add
              </button>
            </div>
            {subs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {subs.map(s => (
                  <span key={s} style={{ background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s}
                    <button onClick={() => removeSub(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 700, fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            {cat ? 'Guardar' : 'Crear'} categoría
          </button>
        </div>
      </div>
    </div>
  )
}

export function CategoriasTab() {
  const { data: categorias = [], isLoading } = useCategorias()
  const guardar = useGuardarCategorias()
  const [modal, setModal] = useState<{ open: false } | { open: true; cat?: Categoria }>({ open: false })

  async function handleSave(cat: Categoria) {
    const existe = categorias.find(c => c.id === cat.id)
    const updated = existe ? categorias.map(c => c.id === cat.id ? cat : c) : [...categorias, cat]
    await guardar.mutateAsync(updated)
    setModal({ open: false })
  }

  async function handleDelete(id: string) {
    const cat = categorias.find(c => c.id === id)
    if (!cat || !confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return
    await guardar.mutateAsync(categorias.filter(c => c.id !== id))
  }

  if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Cargando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{categorias.length} categoría{categorias.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModal({ open: true })}
          className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          + Nueva categoría
        </button>
      </div>

      {categorias.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 11V6a3 3 0 013-3z" />
          </svg>
          <p className="text-gray-600 font-semibold mb-1">Sin categorías</p>
          <p className="text-gray-400 text-sm">Las categorías ayudan a organizar tu inventario</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {categorias.map(cat => (
            <div key={cat.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg style={{ width: 18, height: 18, color: 'var(--primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 11V6a3 3 0 013-3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{cat.nombre}</p>
                {(cat.subcategorias ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cat.subcategorias!.map(s => (
                      <span key={s} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium">{s}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setModal({ open: true, cat })}
                  className="text-xs text-blue-600 hover:underline font-medium">
                  Editar
                </button>
                <button onClick={() => handleDelete(cat.id)}
                  className="text-xs text-red-500 hover:underline font-medium">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <ModalCategoria
          cat={modal.cat}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}
