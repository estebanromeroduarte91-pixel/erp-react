import { useState } from 'react'
import { useCargos, useGuardarCargos } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Cargo, ModuloKey } from '@/types'

const MODULOS: ModuloKey[] = ['dashboard', 'ventas', 'taller', 'clientes', 'inventario', 'compras', 'estadisticas', 'configuracion']
const MODULO_LABEL: Record<ModuloKey, string> = {
  dashboard: 'Dashboard',
  ventas: 'Ventas / POS',
  taller: 'Taller (órdenes)',
  clientes: 'Clientes',
  inventario: 'Inventario',
  compras: 'Compras / OCs',
  estadisticas: 'Estadísticas',
  configuracion: 'Configuración & Accesos',
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export function CargosTab() {
  const { data: cargos, isLoading } = useCargos()
  const guardar = useGuardarCargos()

  const [selected, setSelected] = useState<string | null>(null)
  const [local, setLocal] = useState<Cargo[] | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [showModal, setShowModal] = useState(false)

  const lista = local ?? cargos ?? []
  const selId = selected ?? lista[0]?.id ?? null
  const sel = lista.find(c => c.id === selId) ?? lista[0] ?? null

  function toggle(mod: ModuloKey) {
    if (!sel) return
    const updated = lista.map(c =>
      c.id === sel.id ? { ...c, permisos: { ...c.permisos, [mod]: !c.permisos[mod] } } : c
    )
    setLocal(updated)
  }

  async function handleGuardar() {
    await guardar.mutateAsync(lista)
    setLocal(null)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  function handleCrear() {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    const nuevo: Cargo = {
      id: 'cargo_' + uid(),
      nombre,
      sistema: false,
      permisos: { dashboard: false, ventas: false, taller: false, clientes: false, inventario: false, compras: false, estadisticas: false, configuracion: false },
    }
    const updated = [...lista, nuevo]
    setLocal(updated)
    setSelected(nuevo.id)
    setNuevoNombre('')
    setShowModal(false)
    void guardar.mutateAsync(updated)
  }

  function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este cargo?')) return
    const updated = lista.filter(c => c.id !== id)
    setLocal(updated)
    setSelected(updated[0]?.id ?? null)
    void guardar.mutateAsync(updated)
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-700">Cargos y permisos</h3>
          <p className="text-xs text-gray-400 mt-0.5">Define qué módulos puede ver y usar cada cargo</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition">
          + Nuevo cargo
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden grid grid-cols-[200px_1fr]">
        {/* Lista lateral */}
        <div className="border-r border-gray-200">
          {lista.map(c => {
            const isSel = c.id === selId
            return (
              <button key={c.id} onClick={() => setSelected(c.id)}
                className={[
                  'w-full text-left px-4 py-3 flex items-center justify-between border-b border-gray-100 last:border-b-0 transition',
                  isSel ? 'bg-gray-50' : 'hover:bg-gray-50',
                ].join(' ')}>
                <span className={['text-sm', isSel ? 'font-semibold text-gray-900' : 'text-gray-600'].join(' ')}>{c.nombre}</span>
                {isSel
                  ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Activo</span>
                  : !c.sistema && <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-400">custom</span>}
              </button>
            )
          })}
        </div>

        {/* Panel de permisos */}
        <div>
          {sel ? (
            <>
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Permisos del cargo: {sel.nombre}</span>
                {!sel.sistema && (
                  <button onClick={() => handleEliminar(sel.id)}
                    className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition">
                    Eliminar
                  </button>
                )}
              </div>
              {MODULOS.map(mod => (
                <div key={mod} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 last:border-b-0">
                  <span className="text-sm text-gray-700">{MODULO_LABEL[mod]}</span>
                  <button onClick={() => toggle(mod)}
                    className={[
                      'relative inline-flex items-center w-11 h-6 rounded-full transition-colors flex-shrink-0',
                      sel.permisos[mod] ? 'bg-green-600' : 'bg-gray-300',
                    ].join(' ')}>
                    <span className={[
                      'inline-block w-4.5 h-4.5 bg-white rounded-full shadow-sm transition-transform',
                      sel.permisos[mod] ? 'translate-x-5.5' : 'translate-x-0.5',
                    ].join(' ')} />
                  </button>
                </div>
              ))}
              <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-3 justify-end">
                <button onClick={handleGuardar} disabled={guardar.isPending}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition">
                  {guardar.isPending ? 'Guardando…' : 'Guardar permisos'}
                </button>
                {guardado && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Selecciona un cargo</div>
          )}
        </div>
      </div>

      {/* Modal nuevo cargo */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="bg-white rounded-2xl p-6 w-80 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 mb-4">Nuevo cargo</h3>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del cargo</label>
            <input
              autoFocus
              value={nuevoNombre}
              onChange={e => setNuevoNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCrear()}
              placeholder="Ej: Recepcionista"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 mb-5"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={handleCrear}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
