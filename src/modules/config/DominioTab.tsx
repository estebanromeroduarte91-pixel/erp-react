import { useState, useEffect } from 'react'
import { useEmailDomain, useGuardarEmailDomain } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/shared/Spinner'
import type { EmailDomain, DominioRecord } from '@/types'

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  verified:          { label: 'Verificado',               color: '#0c9b66', bg: '#e7f7ef', border: '#c8ecdb' },
  pending:           { label: 'Pendiente de DNS',         color: '#b7791f', bg: '#fdf6e7', border: '#f1e2bd' },
  not_started:       { label: 'Sin verificar',            color: '#b7791f', bg: '#fdf6e7', border: '#f1e2bd' },
  failed:            { label: 'Falló — revisa registros', color: '#d8413a', bg: '#fdecec', border: '#f6cfcd' },
  temporary_failure: { label: 'Reintentando…',            color: '#b7791f', bg: '#fdf6e7', border: '#f1e2bd' },
}

const REC_STATUS: Record<string, { color: string; label: string }> = {
  verified:          { color: '#0c9b66', label: 'Verificado' },
  pending:           { color: '#b7791f', label: 'Esperando propagación DNS' },
  not_started:       { color: '#9ca3af', label: 'Aún no detectado' },
  failed:            { color: '#d8413a', label: 'Error: el valor no coincide' },
  temporary_failure: { color: '#b7791f', label: 'Reintentando…' },
}

export function DominioTab() {
  const { data: saved, isLoading } = useEmailDomain()
  const guardarDomain = useGuardarEmailDomain()

  const [domain, setDomain] = useState<EmailDomain>({})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    if (saved !== undefined) {
      setDomain(saved)
      if (!saved.domainId) setInput(saved.domain ?? '')
    }
  }, [saved])

  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleCrear() {
    const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
    if (!d || !d.includes('.')) { showToast('Ingresa un dominio válido (ej: empresa.cl)', 'err'); return }
    setLoading('crear')
    try {
      const { data: res, error } = await supabase.functions.invoke('manage-domain', { body: { action: 'create', domain: d } })
      if (error || !res?.ok) { showToast('Error: ' + (res?.error ?? error?.message ?? 'No se pudo crear el dominio'), 'err'); return }
      const updated: EmailDomain = {
        domain: res.name,
        domainId: res.id,
        status: res.status,
        records: res.records ?? [],
        from_email: domain.from_email ?? `contacto@${res.name}`,
        from_name: domain.from_name ?? '',
      }
      await guardarDomain.mutateAsync(updated)
      setDomain(updated)
      showToast('Dominio creado. Agrega los registros DNS y pulsa Comprobar.')
    } finally {
      setLoading(null)
    }
  }

  async function handleComprobar() {
    if (!domain.domainId) return
    setLoading('check')
    try {
      const { data: res, error } = await supabase.functions.invoke('manage-domain', { body: { action: 'verify', domainId: domain.domainId } })
      if (error || !res?.ok) { showToast('Error: ' + (res?.error ?? error?.message ?? 'No se pudo comprobar'), 'err'); return }
      const updated = { ...domain, status: res.status, records: res.records ?? domain.records }
      await guardarDomain.mutateAsync(updated)
      setDomain(updated)
      if (res.status === 'verified') { showToast('✓ Dominio verificado correctamente'); return }
      const recs: DominioRecord[] = res.records ?? []
      const fallidos = recs.filter(r => r.status === 'failed')
      const pendientes = recs.filter(r => ['pending', 'not_started', 'temporary_failure'].includes(r.status))
      if (fallidos.length) showToast(`${fallidos.length} registro(s) con error: ${fallidos.map(r => r.type).join(', ')}. Revisa el valor en tu DNS.`, 'err')
      else if (pendientes.length) showToast(`Esperando ${pendientes.length} registro(s): ${pendientes.map(r => r.type).join(', ')}. El DNS puede tardar minutos.`, 'err')
      else showToast('Aún no verificado. Espera unos minutos a que propague el DNS.', 'err')
    } finally {
      setLoading(null)
    }
  }

  async function handleGuardarRemitente() {
    const updated = { ...domain }
    await guardarDomain.mutateAsync(updated)
    showToast('Remitente guardado ✓')
  }

  async function handleQuitar() {
    if (!confirm('¿Quitar la configuración de dominio? Tendrás que verificarlo de nuevo.')) return
    await guardarDomain.mutateAsync(null)
    setDomain({})
    setInput('')
  }

  function copiarRecord(value: string) {
    navigator.clipboard.writeText(value).then(() => showToast('Copiado al portapapeles'))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  const statusMeta = STATUS_META[domain.status ?? 'not_started'] ?? STATUS_META.not_started
  const verified = domain.status === 'verified'

  return (
    <div className="max-w-2xl space-y-4">
      {/* Toast */}
      {toast && (
        <div className={[
          'px-4 py-3 rounded-xl text-sm font-medium border',
          toast.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200',
        ].join(' ')}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-1">Dominio de correo (Resend)</h3>
        <p className="text-xs text-gray-400 mb-5">Verifica tu dominio para enviar correos desde tu propio email en lugar de uno genérico.</p>

        {/* Sin dominio */}
        {!domain.domainId ? (
          <>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-48">
                <label className="text-xs font-medium text-gray-600 block mb-1">Tu dominio</label>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCrear()}
                  placeholder="empresa.cl"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm font-mono bg-gray-50 focus:outline-none focus:border-blue-400"
                />
              </div>
              <button onClick={handleCrear} disabled={loading === 'crear'}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition whitespace-nowrap">
                {loading === 'crear' ? 'Creando…' : 'Verificar dominio'}
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400 leading-relaxed">
              Escribe solo el dominio, sin <code className="bg-gray-100 px-1 rounded font-mono">www</code> ni <code className="bg-gray-100 px-1 rounded font-mono">https://</code>. Ej: <strong>empresa.cl</strong>
            </p>
          </>
        ) : (
          <>
            {/* Header con estado */}
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <span className="text-sm font-bold font-mono text-gray-800">{domain.domain}</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                style={{ background: statusMeta.bg, color: statusMeta.color, borderColor: statusMeta.border }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusMeta.color }} />
                {statusMeta.label}
              </span>
            </div>

            {verified ? (
              /* Dominio verificado */
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 space-y-3">
                <p className="text-sm text-green-700 font-semibold">✓ Dominio verificado. Tus correos saldrán desde aquí.</p>
                <div>
                  <label className="text-xs font-semibold text-green-700 block mb-1">Correo remitente</label>
                  <input
                    value={domain.from_email ?? ''}
                    onChange={e => setDomain(d => ({ ...d, from_email: e.target.value }))}
                    placeholder={`contacto@${domain.domain}`}
                    className="w-full border border-green-200 bg-white rounded-lg px-3 py-2 text-base md:text-sm font-mono focus:outline-none focus:border-green-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-green-700 block mb-1">Nombre remitente</label>
                  <input
                    value={domain.from_name ?? ''}
                    onChange={e => setDomain(d => ({ ...d, from_name: e.target.value }))}
                    placeholder="Mi Empresa"
                    className="w-full border border-green-200 bg-white rounded-lg px-3 py-2 text-base md:text-sm focus:outline-none focus:border-green-400"
                  />
                </div>
              </div>
            ) : (
              /* Registros DNS pendientes */
              <>
                <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                  Agrega estos registros en el panel <strong>DNS</strong> de tu proveedor. Cuando estén propagados (minutos a horas), pulsa <strong>Comprobar</strong>.
                </p>
                <div className="flex gap-3 text-xs text-gray-500 mb-2 flex-wrap">
                  {Object.entries(REC_STATUS).slice(0, 3).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
                      {v.label.split(' ')[0]}
                    </span>
                  ))}
                </div>
                <div className="border border-gray-200 rounded-xl overflow-auto mb-4">
                  <table className="w-full border-collapse text-xs min-w-[480px]">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Tipo', 'Nombre / Host', 'Valor', ''].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-bold text-gray-400 uppercase text-[10px] tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(domain.records ?? []).map((r, i) => {
                        const rs = REC_STATUS[r.status] ?? REC_STATUS.not_started
                        return (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap align-top">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: rs.color }} title={rs.label} />
                                {r.type}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-700 break-all align-top">{r.name}</td>
                            <td className="px-3 py-2 font-mono text-gray-700 break-all align-top">
                              {r.value}{r.priority ? <span className="text-gray-400"> (prioridad {r.priority})</span> : null}
                            </td>
                            <td className="px-2 py-2 align-top">
                              <button onClick={() => copiarRecord(r.value)}
                                className="border border-gray-200 rounded-md px-2 py-1 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition">
                                Copiar
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex gap-2 flex-wrap">
              {verified ? (
                <button onClick={handleGuardarRemitente} disabled={guardarDomain.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition">
                  Guardar remitente
                </button>
              ) : (
                <button onClick={handleComprobar} disabled={loading === 'check'}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition">
                  {loading === 'check' ? 'Comprobando…' : 'Comprobar verificación'}
                </button>
              )}
              <button onClick={handleQuitar}
                className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                {verified ? 'Cambiar dominio' : 'Empezar de nuevo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
