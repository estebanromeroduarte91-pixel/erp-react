import { useState } from 'react'
import { useGastoCats, useGuardarGastoCats, useCatCuentaMap, useGuardarCatCuentaMap, usePlanCuentas } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { GastoCat } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

const COLORES = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#f97316', '#ec4899', '#6b7280', '#14b8a6', '#0ea5e9', '#ef4444', '#64748b', '#94a3b8']

export function CategoriasContablesTab() {
  const { data: cats, isLoading } = useGastoCats()
  const guardarCats = useGuardarGastoCats()
  const { data: catCuentaMap } = useCatCuentaMap()
  const guardarMap = useGuardarCatCuentaMap()
  const { data: planCuentas } = usePlanCuentas()

  const [editando, setEditando] = useState<GastoCat | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const cuentasGasto = (planCuentas ?? []).filter(c => c.tipo === 'gasto')

  async function setCuenta(catNombre: string, cuentaId: string) {
    await guardarMap.mutateAsync({ ...(catCuentaMap ?? {}), [catNombre]: cuentaId })
  }

  async function guardarCategoria(cat: GastoCat, nombreAnterior?: string) {
    const lista = cats ?? []
    const existe = lista.some(c => c.id === cat.id)
    await guardarCats.mutateAsync(existe ? lista.map(c => c.id === cat.id ? cat : c) : [...lista, cat])
    // Si se renombró, migra la entrada del mapeo (se indexa por nombre)
    if (nombreAnterior && nombreAnterior !== cat.nombre) {
      const map = { ...(catCuentaMap ?? {}) }
      if (map[nombreAnterior]) { map[cat.nombre] = map[nombreAnterior]; delete map[nombreAnterior] }
      await guardarMap.mutateAsync(map)
    }
    setModalOpen(false)
    setEditando(null)
  }

  async function eliminarCategoria(cat: GastoCat) {
    if (!confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return
    await guardarCats.mutateAsync((cats ?? []).filter(c => c.id !== cat.id))
    if (catCuentaMap?.[cat.nombre]) {
      const map = { ...catCuentaMap }; delete map[cat.nombre]
      await guardarMap.mutateAsync(map)
    }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Categoría de gasto → Cuenta contable</h3>
          <p className="text-xs text-gray-400 mt-0.5">A qué cuenta se carga (Debe) cada categoría al registrar un gasto</p>
        </div>
        <button onClick={() => { setEditando(null); setModalOpen(true) }}
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Nueva categoría
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {(cats ?? []).map(cat => (
          <div key={cat.id} className="flex items-center gap-3 px-4 py-3 group">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
            <span className="min-w-[130px] text-sm font-medium text-gray-800 truncate">{cat.nombre}</span>
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            <select
              value={catCuentaMap?.[cat.nombre] ?? 'pc-595'}
              onChange={e => setCuenta(cat.nombre, e.target.value)}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              {cuentasGasto.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
            </select>
            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
              <button onClick={() => { setEditando(cat); setModalOpen(true) }} className="text-xs font-medium text-blue-600 hover:underline">Editar</button>
              <button onClick={() => eliminarCategoria(cat)} className="text-xs font-medium text-red-500 hover:underline">Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 bg-gray-50 text-xs text-gray-500 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 8h.01M11 12h1v4h1" /></svg>
        El select muestra solo las cuentas de tipo gasto del plan. Los cambios se guardan al instante.
      </div>

      {modalOpen && (
        <CategoriaModal
          cat={editando}
          onClose={() => { setModalOpen(false); setEditando(null) }}
          onGuardar={guardarCategoria}
        />
      )}
    </div>
  )
}

function CategoriaModal({ cat, onClose, onGuardar }: {
  cat: GastoCat | null
  onClose: () => void
  onGuardar: (c: GastoCat, nombreAnterior?: string) => Promise<void>
}) {
  const [nombre, setNombre] = useState(cat?.nombre ?? '')
  const [color, setColor] = useState(cat?.color ?? COLORES[0])
  const [guardando, setGuardando] = useState(false)

  async function submit() {
    if (!nombre.trim()) return
    setGuardando(true)
    await onGuardar(
      { id: cat?.id ?? `cat-${uid()}`, nombre: nombre.trim(), color, icono: cat?.icono ?? 'grid' },
      cat?.nombre,
    )
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{cat ? 'Editar categoría' : 'Nueva categoría'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus placeholder="Ej: Servicios"
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORES.map(c => (
                <button key={c} onClick={() => setColor(c)} type="button"
                  className={`w-7 h-7 rounded-full transition ${color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={submit} disabled={!nombre.trim() || guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : cat ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
