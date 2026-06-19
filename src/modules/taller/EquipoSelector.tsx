import { useState, useRef, useEffect, useMemo } from 'react'
import { useEquipos, useGuardarEquipos } from '@/lib/queries'
import type { Equipo } from '@/types'

interface Props {
  value: string
  onChange: (modelo: string) => void
}

const CATEGORIAS = ['Teléfono', 'Tablet', 'Notebook', 'Smartwatch', 'Consola', 'Otro']

function displayName(e: Equipo): string {
  return e.marca ? `${e.modelo} [${e.marca}]` : (e.modelo ?? '')
}

// Selector de equipo desde el catálogo tp_equipos, con buscador, texto libre
// y alta rápida al catálogo (mismo comportamiento que el modelo-AC del ERP vanilla).
export function EquipoSelector({ value, onChange }: Props) {
  const { data: equipos } = useEquipos()
  const guardarEquipos = useGuardarEquipos()

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [form, setForm] = useState({ marca: '', modelo: '', categoria: 'Teléfono' })
  const wrapRef = useRef<HTMLDivElement>(null)

  const lista = useMemo(() => {
    const all = equipos ?? []
    if (!q.trim()) return all
    const s = q.toLowerCase()
    return all.filter((e) =>
      (e.modelo ?? '').toLowerCase().includes(s) ||
      (e.marca ?? '').toLowerCase().includes(s) ||
      (e.categoria ?? '').toLowerCase().includes(s),
    )
  }, [equipos, q])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setNuevo(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function seleccionar(e: Equipo) {
    onChange(displayName(e))
    setOpen(false); setQ('')
  }

  function usarTextoLibre() {
    if (!q.trim()) return
    onChange(q.trim())
    setOpen(false); setQ('')
  }

  async function agregarAlCatalogo() {
    if (!form.modelo.trim()) return
    const nuevoEq: Equipo = {
      id: Date.now().toString(),
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      categoria: form.categoria,
    }
    await guardarEquipos.mutateAsync([...(equipos ?? []), nuevoEq])
    onChange(displayName(nuevoEq))
    setNuevo(false); setOpen(false); setQ('')
    setForm({ marca: '', modelo: '', categoria: 'Teléfono' })
  }

  return (
    <div className="relative" ref={wrapRef}>
      {/* Campo */}
      <div
        onClick={() => setOpen((o) => !o)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 cursor-pointer flex items-center justify-between gap-2 focus:border-blue-400"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>
          {value || 'Seleccionar equipo…'}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange('') }}
              className="text-gray-400 hover:text-gray-600 p-0.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {!nuevo ? (
            <>
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lista.length === 0 && usarTextoLibre()}
                    placeholder="Buscar marca o modelo…"
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto">
                {lista.length === 0 ? (
                  <div className="p-3 space-y-2">
                    {q.trim() && (
                      <button onClick={usarTextoLibre}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 rounded-lg">
                        Usar “{q.trim()}” como modelo
                      </button>
                    )}
                    <p className="text-xs text-gray-400 text-center py-2">
                      {(equipos ?? []).length === 0 ? 'Catálogo vacío' : 'Sin resultados'}
                    </p>
                  </div>
                ) : (
                  lista.map((e) => (
                    <button key={e.id} onClick={() => seleccionar(e)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between">
                      <span className="font-medium text-gray-800">
                        {e.modelo} <span className="text-gray-400 font-normal text-xs">[{e.marca}]</span>
                      </span>
                      {e.categoria && (
                        <span className="text-[11px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{e.categoria}</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              <button onClick={() => { setNuevo(true); setForm((f) => ({ ...f, modelo: q.trim() })) }}
                className="w-full text-left px-4 py-2.5 text-sm text-blue-600 font-semibold border-t border-gray-100 hover:bg-blue-50 transition flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Agregar equipo al catálogo
              </button>
            </>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Nuevo equipo</p>
              <input value={form.marca} onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
                placeholder="Marca (Ej: Apple)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              <input value={form.modelo} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
                placeholder="Modelo (Ej: iPhone 15 Pro)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setNuevo(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                  Cancelar
                </button>
                <button onClick={agregarAlCatalogo} disabled={!form.modelo.trim()}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                  Crear y seleccionar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
