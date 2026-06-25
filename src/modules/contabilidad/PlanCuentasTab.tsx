import { useState, useMemo } from 'react'
import { usePlanCuentas, useGuardarPlanCuentas } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { CuentaContable } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

const TIPOS: { value: CuentaContable['tipo']; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'pasivo', label: 'Pasivo' },
  { value: 'patrimonio', label: 'Patrimonio' },
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'gasto', label: 'Gasto' },
]

const TIPO_META: Record<string, { label: string; cls: string }> = {
  activo:     { label: 'Activo',     cls: 'bg-blue-100 text-blue-700' },
  pasivo:     { label: 'Pasivo',     cls: 'bg-amber-100 text-amber-700' },
  patrimonio: { label: 'Patrimonio', cls: 'bg-purple-100 text-purple-700' },
  ingreso:    { label: 'Ingreso',    cls: 'bg-green-100 text-green-700' },
  gasto:      { label: 'Gasto',      cls: 'bg-red-100 text-red-600' },
}

const ORDEN_TIPO = ['activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto']

export function PlanCuentasTab() {
  const { data: plan, isLoading } = usePlanCuentas()
  const guardar = useGuardarPlanCuentas()
  const [editando, setEditando] = useState<CuentaContable | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const grupos = useMemo(() => {
    const ordenadas = [...(plan ?? [])].sort((a, b) =>
      (ORDEN_TIPO.indexOf(a.tipo) - ORDEN_TIPO.indexOf(b.tipo)) || a.codigo.localeCompare(b.codigo))
    const m: Record<string, CuentaContable[]> = {}
    ordenadas.forEach(c => { (m[c.tipo] ||= []).push(c) })
    return ORDEN_TIPO.filter(t => m[t]).map(t => [t, m[t]] as const)
  }, [plan])

  async function guardarCuenta(cuenta: CuentaContable) {
    const lista = plan ?? []
    const existe = lista.some(c => c.id === cuenta.id)
    await guardar.mutateAsync(existe ? lista.map(c => c.id === cuenta.id ? cuenta : c) : [...lista, cuenta])
    setModalOpen(false); setEditando(null)
  }

  async function eliminarCuenta(c: CuentaContable) {
    if (!confirm(`¿Eliminar la cuenta ${c.codigo} — ${c.nombre}?`)) return
    await guardar.mutateAsync((plan ?? []).filter(x => x.id !== c.id))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Plan de cuentas</h3>
          <p className="text-xs text-gray-400 mt-0.5">Catálogo de cuentas contables usadas en los asientos</p>
        </div>
        <button onClick={() => { setEditando(null); setModalOpen(true) }}
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Agregar cuenta
        </button>
      </div>

      {grupos.map(([tipo, cuentas]) => (
        <div key={tipo}>
          <div className="px-4 py-1.5 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{TIPO_META[tipo]?.label ?? tipo}</div>
          <div className="divide-y divide-gray-50">
            {cuentas.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 group">
                <span className="font-mono text-sm font-semibold text-gray-700 min-w-[44px]">{c.codigo}</span>
                <span className="flex-1 text-sm text-gray-800 truncate">{c.nombre}</span>
                <span className="text-[11px] text-gray-400 hidden sm:block truncate max-w-[160px]">{c.grupo}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TIPO_META[c.tipo]?.cls ?? 'bg-gray-100 text-gray-600'}`}>{TIPO_META[c.tipo]?.label ?? c.tipo}</span>
                <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                  <button onClick={() => { setEditando(c); setModalOpen(true) }} className="text-xs font-medium text-blue-600 hover:underline">Editar</button>
                  <button onClick={() => eliminarCuenta(c)} className="text-xs font-medium text-red-500 hover:underline">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {modalOpen && <CuentaModal cuenta={editando} onClose={() => { setModalOpen(false); setEditando(null) }} onGuardar={guardarCuenta} />}
    </div>
  )
}

function CuentaModal({ cuenta, onClose, onGuardar }: {
  cuenta: CuentaContable | null
  onClose: () => void
  onGuardar: (c: CuentaContable) => Promise<void>
}) {
  const [codigo, setCodigo] = useState(cuenta?.codigo ?? '')
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '')
  const [tipo, setTipo] = useState<CuentaContable['tipo']>(cuenta?.tipo ?? 'gasto')
  const [grupo, setGrupo] = useState(cuenta?.grupo ?? '')
  const [guardando, setGuardando] = useState(false)

  async function submit() {
    if (!codigo.trim() || !nombre.trim()) return
    setGuardando(true)
    await onGuardar({
      id: cuenta?.id ?? `pc-${uid()}`,
      codigo: codigo.trim(), nombre: nombre.trim(), tipo, grupo: grupo.trim() || 'Otros',
    })
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{cuenta ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Código</label>
              <input value={codigo} onChange={e => setCodigo(e.target.value)} autoFocus placeholder="600"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Publicidad y Marketing"
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as CuentaContable['tipo'])}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Grupo</label>
            <input value={grupo} onChange={e => setGrupo(e.target.value)} placeholder="Gastos Operacionales"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={submit} disabled={!codigo.trim() || !nombre.trim() || guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : cuenta ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
