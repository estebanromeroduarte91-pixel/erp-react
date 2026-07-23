import { useState, useMemo } from 'react'
import { usePlatformEmpresas, useActualizarEmpresaAdmin, useLeads, useActualizarLead, type EmpresaAdmin, type Lead } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import { useUpdatePlanLimits, TIER_LIMITS, TIER_ORDER, type PlanTier } from '@/lib/queries/usePlanLimits'

const TIER_NOMBRE: Record<PlanTier, string> = { starter: 'Starter', pro: 'Pro', scale: 'Scale' }

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
  const actualizarLimits = useUpdatePlanLimits()
  const { startImpersonation } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [tierPorActivar, setTierPorActivar] = useState<Record<string, PlanTier>>({})
  const [tab, setTab] = useState<'empresas' | 'leads'>('empresas')

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

  async function activarPlan(e: EmpresaAdmin) {
    const tier = tierPorActivar[e.id] ?? e.tier
    if (!confirm(`¿Activar el plan ${TIER_NOMBRE[tier]} para "${e.nombre}"? Debes haber confirmado el pago antes de hacer esto.`)) return
    await actualizarLimits.mutateAsync({ empresaId: e.id, limits: { tier, ...TIER_LIMITS[tier] } })
    await actualizar.mutateAsync({ id: e.id, plan_estado: 'activo' })
    // El selector queda igual al tier recién activado — antes se resetía a "Starter"
    // en el próximo refetch porque no tenía de dónde leer el tier real guardado.
    setTierPorActivar(t => ({ ...t, [e.id]: tier }))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Panel Pixit</h1>
        <p className="text-sm text-gray-500 mt-0.5">Empresas del sistema y prospectos de registro.</p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {([['empresas', 'Empresas'], ['leads', 'Leads']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'leads' && <LeadsPanel />}

      {tab === 'empresas' && <>
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
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Usuarios</th>
              <th className="px-4 py-3 font-semibold">Creada</th>
              <th className="px-4 py-3 font-semibold text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Sin resultados</td></tr>
            )}
            {lista.map(e => (
              <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 group">
                <td className="px-4 py-3 font-medium text-gray-800">{e.nombre}</td>
                <td className="px-4 py-3"><EstadoPill e={e} /></td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    {TIER_NOMBRE[e.tier]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{e.usuarios}</td>
                <td className="px-4 py-3 text-gray-500">{fmtFecha(e.creado_en)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <select
                      value={tierPorActivar[e.id] ?? e.tier}
                      onChange={ev => setTierPorActivar(t => ({ ...t, [e.id]: ev.target.value as PlanTier }))}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 opacity-0 group-hover:opacity-100"
                    >
                      {TIER_ORDER.map(tier => <option key={tier} value={tier}>{TIER_NOMBRE[tier]}</option>)}
                    </select>
                    <button
                      onClick={() => activarPlan(e)}
                      disabled={actualizarLimits.isPending || actualizar.isPending}
                      className="px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition disabled:opacity-50 opacity-0 group-hover:opacity-100"
                    >
                      Activar plan
                    </button>
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
      </>}
    </div>
  )
}

function fmtFechaHora(f: string | null) {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function LeadEstadoPill({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    registrado: 'bg-amber-100 text-amber-700',
    confirmado: 'bg-blue-100 text-blue-700',
    cliente: 'bg-green-100 text-green-700',
  }
  const label: Record<string, string> = { registrado: 'Sin confirmar', confirmado: 'Confirmado', cliente: 'Cliente' }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[estado] ?? 'bg-gray-100 text-gray-500'}`}>{label[estado] ?? estado}</span>
}

function soloDigitos(tel: string) {
  const d = tel.replace(/[^\d]/g, '')
  return d.startsWith('56') ? d : `56${d.replace(/^0+/, '')}`
}

function LeadsPanel() {
  const { data: leads, isLoading } = useLeads()
  const actualizar = useActualizarLead()
  const [busqueda, setBusqueda] = useState('')

  const lista = useMemo(() => {
    const arr = leads ?? []
    if (!busqueda.trim()) return arr
    const q = busqueda.toLowerCase()
    return arr.filter(l =>
      (l.nombre ?? '').toLowerCase().includes(q) ||
      (l.email ?? '').toLowerCase().includes(q) ||
      (l.empresa_nombre ?? '').toLowerCase().includes(q) ||
      (l.celular ?? '').includes(q),
    )
  }, [leads, busqueda])

  const totales = useMemo(() => {
    const arr = leads ?? []
    return {
      total: arr.length,
      sinConfirmar: arr.filter(l => l.estado === 'registrado').length,
      confirmados: arr.filter(l => l.estado === 'confirmado').length,
      clientes: arr.filter(l => l.estado === 'cliente').length,
    }
  }, [leads])

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Registros', value: totales.total },
          { label: 'Sin confirmar', value: totales.sinConfirmar },
          { label: 'Confirmados', value: totales.confirmados },
          { label: 'Clientes', value: totales.clientes },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-3.5">
            <div className="text-xl font-bold text-gray-900">{m.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, email, empresa o celular..."
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-semibold">Persona</th>
              <th className="px-4 py-3 font-semibold">Empresa</th>
              <th className="px-4 py-3 font-semibold">Contacto</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Registrado</th>
              <th className="px-4 py-3 font-semibold text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Sin registros todavía</td></tr>
            )}
            {lista.map((l: Lead) => (
              <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3 font-medium text-gray-800">{l.nombre || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{l.empresa_nombre || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    {l.email && <span className="text-gray-500 text-xs">{l.email}</span>}
                    {l.celular && (
                      <a href={`https://wa.me/${soloDigitos(l.celular)}`} target="_blank" rel="noreferrer"
                        className="text-green-600 text-xs font-medium hover:underline inline-flex items-center gap-1 w-fit">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.548 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413"/></svg>
                        {l.celular}
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3"><LeadEstadoPill estado={l.estado} /></td>
                <td className="px-4 py-3 text-gray-500">{fmtFechaHora(l.creado_en)}</td>
                <td className="px-4 py-3 text-right">
                  {l.estado !== 'cliente' && (
                    <button onClick={() => actualizar.mutate({ id: l.id, estado: 'cliente' })}
                      disabled={actualizar.isPending}
                      className="px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition disabled:opacity-50">
                      Marcar cliente
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
