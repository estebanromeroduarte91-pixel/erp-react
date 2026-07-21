import { useState, useMemo } from 'react'
import { usePlatformEmpresas, useActualizarEmpresaAdmin, type EmpresaAdmin } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'

function fmtFecha(f: string | null) {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function diasRestantes(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function EstadoPill({ e }: { e: EmpresaAdmin }) {
  if (e.plan_estado === 'suspendida') {
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Suspendida</span>
  }
  if (e.plan_estado === 'activo') {
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Activa</span>
  }
  if (e.plan_estado === 'trial') {
    const dias = diasRestantes(e.trial_termina)
    const vencido = dias !== null && dias < 0
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${vencido ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
        {vencido ? 'Trial vencido' : `Trial · ${dias}d`}
      </span>
    )
  }
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sin plan</span>
}

export function PixitAdminPage() {
  const { data: empresas, isLoading } = usePlatformEmpresas()
  const actualizar = useActualizarEmpresaAdmin()
  const { startImpersonation } = useAuth()
  const [busqueda, setBusqueda] = useState('')

  const lista = useMemo(() => {
    if (!busqueda.trim()) return empresas ?? []
    const q = busqueda.toLowerCase()
    return (empresas ?? []).filter(e => e.nombre.toLowerCase().includes(q))
  }, [empresas, busqueda])

  const totales = useMemo(() => {
    const emp = empresas ?? []
    return {
      total: emp.length,
      activas: emp.filter(e => e.plan_estado === 'activo').length,
      trial: emp.filter(e => e.plan_estado === 'trial').length,
      suspendidas: emp.filter(e => e.plan_estado === 'suspendida').length,
      usuarios: emp.reduce((s, e) => s + e.usuarios, 0),
    }
  }, [empresas])

  async function toggleSuspension(e: EmpresaAdmin) {
    const suspender = e.plan_estado !== 'suspendida'
    const msg = suspender
      ? `¿Suspender el acceso de "${e.nombre}"? Los usuarios de esa empresa quedarán bloqueados hasta que la reactives.`
      : `¿Reactivar el acceso de "${e.nombre}"?`
    if (!confirm(msg)) return
    await actualizar.mutateAsync({ id: e.id, plan_estado: suspender ? 'suspendida' : 'activo' })
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Panel Pixit</h1>
        <p className="text-sm text-gray-500 mt-0.5">Todas las empresas que usan el sistema.</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Empresas', value: totales.total },
          { label: 'Activas', value: totales.activas },
          { label: 'En trial', value: totales.trial },
          { label: 'Suspendidas', value: totales.suspendidas },
          { label: 'Usuarios totales', value: totales.usuarios },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-3.5">
            <div className="text-xl font-bold text-gray-900">{m.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Buscador */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar empresa..."
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-semibold">Empresa</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Usuarios</th>
              <th className="px-4 py-3 font-semibold">Creada</th>
              <th className="px-4 py-3 font-semibold text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Sin resultados</td></tr>
            )}
            {lista.map(e => (
              <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 group">
                <td className="px-4 py-3 font-medium text-gray-800">{e.nombre}</td>
                <td className="px-4 py-3"><EstadoPill e={e} /></td>
                <td className="px-4 py-3 text-gray-600">{e.usuarios}</td>
                <td className="px-4 py-3 text-gray-500">{fmtFecha(e.creado_en)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => startImpersonation(e.id, e.nombre)}
                      className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition flex items-center gap-1 opacity-0 group-hover:opacity-100"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg> Entrar
                    </button>
                    <button
                      onClick={() => toggleSuspension(e)}
                      disabled={actualizar.isPending}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition disabled:opacity-50 ${
                        e.plan_estado === 'suspendida'
                          ? 'border-green-200 text-green-700 hover:bg-green-50'
                          : 'border-red-200 text-red-600 hover:bg-red-50'
                      }`}
                    >
                      {e.plan_estado === 'suspendida' ? 'Reactivar' : 'Suspender'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
