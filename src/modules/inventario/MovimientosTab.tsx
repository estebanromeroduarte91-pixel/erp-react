import { useState, useMemo, useEffect } from 'react'
import { useMovimientos, useGuardarMovimientos } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', traslado: 'Traslado',
}

const TIPO_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  entrada: {
    bg: 'bg-[#EAF3DE]', text: 'text-[#27500A]',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-4-4m4 4l4-4" /></svg>,
  },
  salida: {
    bg: 'bg-[#FCEBEB]', text: 'text-[#791F1F]',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-4 4m4-4l4 4" /></svg>,
  },
  ajuste: {
    bg: 'bg-[#FAEEDA]', text: 'text-[#633806]',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
  },
  traslado: {
    bg: 'bg-[#E6F1FB]', text: 'text-[#0C447C]',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  },
}

const PILLS_MAX = 3

function ProductoPills({ productos }: { productos: { producto_nombre?: string; cantidad: number }[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? productos : productos.slice(0, PILLS_MAX)
  const resto = productos.length - PILLS_MAX

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((p, i) => (
        <span key={i} className="inline-flex items-center text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5 whitespace-nowrap">
          {p.producto_nombre}
          <span className="text-gray-400 ml-1.5">×{p.cantidad}</span>
        </span>
      ))}
      {!expanded && resto > 0 && (
        <button onClick={() => setExpanded(true)}
          className="text-[11px] text-blue-600 border border-blue-200 bg-blue-50 rounded-md px-2 py-0.5 hover:bg-blue-100 transition">
          +{resto} más
        </button>
      )}
      {expanded && productos.length > PILLS_MAX && (
        <button onClick={() => setExpanded(false)}
          className="text-[11px] text-gray-400 border border-gray-200 rounded-md px-2 py-0.5 hover:bg-gray-100 transition">
          Ver menos
        </button>
      )}
    </div>
  )
}

export function MovimientosTab() {
  const { data: movimientos, isLoading } = useMovimientos()
  const guardarMovimientos = useGuardarMovimientos()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')

  // Corrige automáticamente referencias históricas con prefijo duplicado (OC-OC- → OC-)
  useEffect(() => {
    if (!movimientos?.length) return
    const necesitaFix = movimientos.some(m => m.referencia?.startsWith('OC-OC-'))
    if (!necesitaFix) return
    const corregidos = movimientos.map(m => ({
      ...m,
      referencia: m.referencia?.startsWith('OC-OC-')
        ? m.referencia.replace('OC-OC-', 'OC-')
        : m.referencia,
    }))
    void guardarMovimientos.mutateAsync(corregidos)
  }, [movimientos]) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    let r = movimientos ?? []
    if (filtroTipo) r = r.filter((m) => m.tipo === filtroTipo)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter((m) =>
        m.referencia?.toLowerCase().includes(q) ||
        m.notas?.toLowerCase().includes(q) ||
        m.productos.some((p) => p.producto_nombre?.toLowerCase().includes(q))
      )
    }
    return r
  }, [movimientos, filtroTipo, busqueda])

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, referencia..."
            className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
          className="text-base md:text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400 text-gray-600">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {lista.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">Sin movimientos registrados</p>
        ) : (
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '130px' }} />
              <col style={{ width: '90px' }} />
              <col />
              <col style={{ width: '120px' }} />
              <col style={{ width: '150px' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Productos</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Referencia</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const estilo = TIPO_STYLE[m.tipo]
                return (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <div className="text-[13px] text-gray-700">{m.fecha}</div>
                      {m.hora && <div className="text-[11px] text-gray-400 mt-0.5">{m.hora}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md ${estilo?.bg ?? 'bg-gray-100'} ${estilo?.text ?? 'text-gray-600'}`}>
                        {estilo?.icon}
                        {TIPO_LABEL[m.tipo] ?? m.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ProductoPills productos={m.productos} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-[12px] text-gray-500 font-mono">{m.referencia || '—'}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-[12px] text-gray-500">{m.usuario || '—'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
