import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useEquipos, useGuardarEquipos, useCatEquipo, useMarcasEquipo, useGuardarMarcasEquipo } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { Equipo } from '@/types'

const EMPTY_FORM = { marca: '', modelo: '', categoria: 'Teléfono', descripcion: '' }

const CAT_COLORS: Record<string, string> = {
  'Teléfono':      'bg-blue-50 text-blue-700',
  'Tablet':        'bg-purple-50 text-purple-700',
  'Notebook':      'bg-amber-50 text-amber-700',
  'Smartwatch':    'bg-teal-50 text-teal-700',
  'PC escritorio': 'bg-gray-100 text-gray-600',
  'Consola':       'bg-green-50 text-green-700',
  'Audífonos':     'bg-pink-50 text-pink-700',
  'Otro':          'bg-gray-100 text-gray-500',
}

interface EquipoForm { marca: string; modelo: string; categoria: string; descripcion: string }

interface MarcaInfo {
  raw: string
  normalizada: string
  enCatalogo: boolean
  count: number
}

interface DupMatch {
  equipo: Equipo
  reason: 'codigo' | 'tokens'
  codigo?: string
  similitud?: number
}

interface ImportDup {
  idx: number
  match: DupMatch
  resolucion: 'catalogo' | 'importar' | null
}

// ── Dedup helpers ──────────────────────────────────────────────────────────────

function extractCodigos(texto: string): string[] {
  const t = texto.toUpperCase()
  const found: string[] = []
  const patterns = [
    /\b[A-Z]\d{4,5}\b/g,          // Apple: A2141, A2442
    /\bSM-[A-Z0-9]{4,}\b/g,       // Samsung: SM-G998B
    /\b[A-Z]{2}\d{3,5}[A-Z]?\b/g, // Lenovo, HP, etc.
  ]
  for (const p of patterns) {
    const m = t.match(p)
    if (m) found.push(...m)
  }
  return [...new Set(found)]
}

function tokenSim(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean))
  const ta = tok(a), tb = tok(b)
  const inter = [...ta].filter(t => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : inter / union
}

function buscarDups(modelo: string, marca: string, catalogo: Equipo[], ignorarId?: string): DupMatch[] {
  if (modelo.trim().length < 3) return []
  const codsNuevo = extractCodigos(modelo)
  const results: DupMatch[] = []
  for (const eq of catalogo) {
    if (!eq.modelo || eq.id === ignorarId) continue
    if (marca && eq.marca && eq.marca.toLowerCase() !== marca.toLowerCase()) continue
    const codsExist = extractCodigos(eq.modelo)
    const shared = codsNuevo.filter(c => codsExist.includes(c))
    if (shared.length) { results.push({ equipo: eq, reason: 'codigo', codigo: shared[0] }); continue }
    const sim = tokenSim(modelo, eq.modelo)
    if (sim >= 0.6) results.push({ equipo: eq, reason: 'tokens', similitud: sim })
  }
  return results
}

// ── Normalización de marca ─────────────────────────────────────────────────────

function normalizarMarca(raw: string, catalogo: string[]): string {
  const t = raw.trim()
  const match = catalogo.find(m => m.toLowerCase() === t.toLowerCase())
  if (match) return match
  return t.replace(/\b\w/g, c => c.toUpperCase())
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function EquiposTab() {
  const { data: equipos, isLoading } = useEquipos()
  const { data: categorias = [] } = useCatEquipo()
  const { data: marcas = [] } = useMarcasEquipo()
  const guardar = useGuardarEquipos()
  const guardarMarcas = useGuardarMarcasEquipo()
  const { esAdmin } = useAuth()

  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroMarca, setFiltroMarca] = useState('')

  // Modal nuevo/editar
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<EquipoForm>(EMPTY_FORM)
  const [ignoredDups, setIgnoredDups] = useState<Set<string>>(new Set())

  // Modal importar
  const [importModal, setImportModal] = useState(false)
  const [importPreview, setImportPreview] = useState<Equipo[]>([])
  const [importMarcas, setImportMarcas] = useState<MarcaInfo[]>([])
  const [importDups, setImportDups] = useState<ImportDup[]>([])
  const [agregarNuevas, setAgregarNuevas] = useState(true)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Detectar duplicados al escribir modelo en el modal manual — valor derivado
  // (useMemo), no hace falta estado + efecto para esto: todo lo que necesita
  // ya está disponible durante el render.
  const dupWarnings = useMemo(() => {
    if (!modal || form.modelo.trim().length < 3) return []
    const dups = buscarDups(form.modelo, form.marca, equipos ?? [], editId ?? undefined)
    return dups.filter(d => !ignoredDups.has(d.equipo.id))
  }, [modal, form.modelo, form.marca, equipos, editId, ignoredDups])

  // Pills de marcas
  const marcasPills = useMemo(() => {
    const all = equipos ?? []
    const conteo: Record<string, number> = {}
    all.forEach(e => { if (e.marca) conteo[e.marca] = (conteo[e.marca] ?? 0) + 1 })
    return Object.entries(conteo).sort((a, b) => b[1] - a[1])
  }, [equipos])

  const lista = useMemo(() => {
    let r = equipos ?? []
    if (filtroMarca) r = r.filter(e => e.marca === filtroMarca)
    if (filtroCat)   r = r.filter(e => e.categoria === filtroCat)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(e =>
        (e.marca ?? '').toLowerCase().includes(q) ||
        (e.modelo ?? '').toLowerCase().includes(q) ||
        (e.descripcion ?? '').toLowerCase().includes(q),
      )
    }
    return r
  }, [equipos, filtroMarca, filtroCat, busqueda])

  function abrirNuevo() { setEditId(null); setForm(EMPTY_FORM); setIgnoredDups(new Set()); setModal(true) }

  function abrirEditar(e: Equipo) {
    setEditId(e.id)
    setForm({ marca: e.marca ?? '', modelo: e.modelo ?? '', categoria: e.categoria ?? 'Teléfono', descripcion: e.descripcion ?? '' })
    setIgnoredDups(new Set())
    setModal(true)
  }

  async function guardarEquipo() {
    if (!form.modelo.trim()) return
    const datos: Equipo = {
      id: editId ?? Date.now().toString(),
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      categoria: form.categoria,
      descripcion: form.descripcion.trim() || undefined,
    }
    const nueva = editId ? (equipos ?? []).map(e => e.id === editId ? datos : e) : [...(equipos ?? []), datos]
    await guardar.mutateAsync(nueva)
    setModal(false)
  }

  function usarExistente(eq: Equipo) {
    setForm(f => ({ ...f, marca: eq.marca ?? f.marca, modelo: eq.modelo ?? '', categoria: eq.categoria ?? f.categoria }))
    setEditId(eq.id)
  }

  function ignorarDup(id: string) {
    setIgnoredDups(prev => new Set([...prev, id]))
  }

  async function eliminar(id: string) {
    if (!esAdmin) return
    if (!confirm('¿Eliminar este equipo del catálogo?')) return
    await guardar.mutateAsync((equipos ?? []).filter(e => e.id !== id))
  }

  function procesarExcel(file: File) {
    setImportError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target!.result as ArrayBuffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        if (!rows.length) { setImportError('Archivo vacío'); return }
        const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim())
        const find = (keys: string[]) => keys.find(k => headers.includes(k))
        const cols = {
          marca:       find(['marca', 'brand', 'fabricante']),
          modelo:      find(['modelo', 'model', 'nombre']),
          categoria:   find(['categoria', 'categoría', 'category', 'tipo']),
          descripcion: find(['descripcion', 'descripción', 'description', 'notas']),
        }
        const get = (row: Record<string, unknown>, col: string | undefined) =>
          col ? String(Object.entries(row).find(([k]) => k.toLowerCase().trim() === col)?.[1] ?? '').trim() : ''

        const parsed: Equipo[] = rows
          .map(row => ({
            id: '',
            marca: normalizarMarca(get(row, cols.marca), marcas),
            modelo: get(row, cols.modelo),
            categoria: get(row, cols.categoria) || 'Teléfono',
            descripcion: get(row, cols.descripcion) || undefined,
          }))
          .filter(e => e.marca && e.modelo)

        if (!parsed.length) { setImportError('No se encontraron equipos válidos (requiere columnas Marca y Modelo)'); return }

        // Marcas
        const rawPorMarca: Record<string, string> = {}
        rows.forEach(row => { const raw = get(row, cols.marca); if (raw) rawPorMarca[normalizarMarca(raw, marcas)] = raw })
        const conteoMarcas: Record<string, number> = {}
        parsed.forEach(e => { if (e.marca) conteoMarcas[e.marca] = (conteoMarcas[e.marca] ?? 0) + 1 })
        const marcasInfo: MarcaInfo[] = Object.entries(conteoMarcas).map(([norm, count]) => ({
          raw: rawPorMarca[norm] ?? norm,
          normalizada: norm,
          enCatalogo: marcas.some(m => m.toLowerCase() === norm.toLowerCase()),
          count,
        }))

        // Detectar duplicados contra catálogo existente
        const dups: ImportDup[] = []
        parsed.forEach((e, idx) => {
          const matches = buscarDups(e.modelo ?? '', e.marca ?? '', equipos ?? [])
          if (matches.length) dups.push({ idx, match: matches[0], resolucion: null })
        })

        setImportPreview(parsed)
        setImportMarcas(marcasInfo)
        setImportDups(dups)
      } catch (err) {
        setImportError(`Error al leer el archivo: ${(err as Error).message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function resolverDup(idx: number, res: 'catalogo' | 'importar') {
    setImportDups(prev => prev.map(d => d.idx === idx ? { ...d, resolucion: res } : d))
    if (res === 'catalogo') {
      const dup = importDups.find(d => d.idx === idx)
      if (dup) {
        setImportPreview(prev => prev.map((e, i) =>
          i === idx ? { ...e, modelo: dup.match.equipo.modelo ?? e.modelo, marca: dup.match.equipo.marca ?? e.marca } : e
        ))
      }
    }
  }

  async function confirmarImport() {
    const nuevos = importPreview
      .map((e, idx) => {
        const dup = importDups.find(d => d.idx === idx && d.resolucion === 'catalogo')
        if (dup) return null  // ya existe en catálogo, no duplicar
        return { ...e, id: `eq-${Date.now()}-${Math.random().toString(36).slice(2)}` }
      })
      .filter(Boolean) as Equipo[]
    await guardar.mutateAsync([...(equipos ?? []), ...nuevos])
    if (agregarNuevas) {
      const nuevasMarcas = importMarcas.filter(m => !m.enCatalogo).map(m => m.normalizada)
      if (nuevasMarcas.length) await guardarMarcas.mutateAsync([...marcas, ...nuevasMarcas])
    }
    setImportModal(false)
    setImportPreview([])
    setImportMarcas([])
    setImportDups([])
  }

  function descargarPlantilla() {
    const wb = XLSX.utils.book_new()
    const data = [
      ['marca', 'modelo', 'categoria', 'descripcion'],
      ['Apple', 'iPhone 15 Pro', 'Teléfono', ''],
      ['Apple', 'MacBook Air M3', 'Notebook', ''],
      ['Samsung', 'Galaxy S24', 'Teléfono', ''],
      ['Lenovo', 'ThinkPad X1', 'Notebook', ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Equipos')
    XLSX.writeFile(wb, 'plantilla_equipos_taller.xlsx')
  }

  const marcasNuevas = importMarcas.filter(m => !m.enCatalogo)
  const marcasConCambio = importMarcas.filter(m => m.raw !== m.normalizada)
  const dupsPendientes = importDups.filter(d => d.resolucion === null)

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar marca, modelo…"
            className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        </div>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          className="text-base md:text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:border-blue-400">
          <option value="">Todas las categorías</option>
          {categorias.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => { setImportModal(true); setImportPreview([]); setImportMarcas([]); setImportDups([]); setImportError('') }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Subir Excel
        </button>
        <button onClick={abrirNuevo}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo equipo
        </button>
      </div>

      {/* Pills de marcas */}
      {marcasPills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 pb-4 border-b border-gray-100">
          <span className="text-[11px] font-medium text-gray-400 mr-1">Marca:</span>
          <button onClick={() => setFiltroMarca('')}
            className={['inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition',
              !filtroMarca ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-700',
            ].join(' ')}>
            Todas
            <span className={`text-[10px] px-1.5 py-0 rounded-full font-semibold ${!filtroMarca ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {(equipos ?? []).length}
            </span>
          </button>
          {marcasPills.map(([marca, count]) => (
            <button key={marca} onClick={() => setFiltroMarca(filtroMarca === marca ? '' : marca)}
              className={['inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition',
                filtroMarca === marca ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-700',
              ].join(' ')}>
              {marca}
              <span className={`text-[10px] px-1.5 py-0 rounded-full font-semibold ${filtroMarca === marca ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {lista.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            <p className="text-sm text-gray-400">
              {busqueda || filtroCat || filtroMarca ? 'Sin resultados para ese filtro' : 'Sin equipos registrados. Agrega el primero.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Marca</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Modelo</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Categoría</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Descripción</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lista.map(e => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{e.marca || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{e.modelo || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md ${CAT_COLORS[e.categoria ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                      {e.categoria || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-400">{e.descripcion || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => abrirEditar(e)} className="text-xs text-blue-600 hover:underline font-medium">Editar</button>
                      {esAdmin && <button onClick={() => eliminar(e.id)} className="text-xs text-red-500 hover:underline font-medium">Eliminar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal nuevo/editar ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{editId ? 'Editar equipo' : 'Nuevo equipo'}</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Marca *</label>
                  <input value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))}
                    placeholder="Apple, Samsung…" list="eq-marca-list"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                  <datalist id="eq-marca-list">{marcas.map(m => <option key={m} value={m}/>)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Categoría *</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Modelo *</label>
                <input value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))}
                  placeholder="iPhone 15 Pro, Galaxy S24…"
                  className={`w-full border rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none transition ${dupWarnings.length ? 'border-amber-400 focus:border-amber-500' : 'border-gray-200 focus:border-blue-400'}`} />
                {/* Aviso de duplicados inline */}
                {dupWarnings.length > 0 && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      </svg>
                      Posibles duplicados en el catálogo
                    </div>
                    {dupWarnings.map(d => (
                      <div key={d.equipo.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-amber-900 truncate block">{d.equipo.modelo}</span>
                          <span className="text-[10px] text-amber-600">
                            {d.reason === 'codigo' ? `código ${d.codigo}` : `${Math.round((d.similitud ?? 0) * 100)}% similitud`}
                          </span>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => usarExistente(d.equipo)}
                            className="text-[11px] font-medium px-2 py-1 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition">
                            Usar este
                          </button>
                          <button onClick={() => ignorarDup(d.equipo.id)}
                            className="text-[11px] px-2 py-1 rounded-md text-gray-400 hover:bg-gray-100 transition">
                            Ignorar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
                <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Notas adicionales…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={guardarEquipo} disabled={!form.modelo.trim() || guardar.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                {guardar.isPending ? 'Guardando…' : 'Guardar equipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal importar Excel ── */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">Importar desde Excel</h3>
                <p className="text-xs text-gray-400 mt-0.5">Columnas requeridas: Marca, Modelo</p>
              </div>
              <button onClick={() => setImportModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {!importPreview.length ? (
                <>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 transition"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) procesarExcel(f) }}>
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <p className="text-sm font-medium text-gray-600">Arrastra tu archivo aquí</p>
                    <p className="text-xs text-gray-400 mt-1">o haz clic para seleccionar (.xlsx, .csv)</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) procesarExcel(e.target.files[0]); e.target.value = '' }} />
                  </div>
                  {importError && <p className="text-xs text-red-600">{importError}</p>}
                  <button onClick={descargarPlantilla} className="text-xs text-blue-600 hover:underline">⬇ Descargar plantilla de ejemplo</button>
                </>
              ) : (
                <>
                  {/* Resumen */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { num: importPreview.length, label: 'Equipos encontrados', warn: false },
                      { num: importMarcas.length,  label: 'Marcas detectadas',   warn: false },
                      { num: importDups.length,    label: 'Posibles duplicados', warn: importDups.length > 0 },
                    ].map((s, i) => (
                      <div key={i} className={`rounded-lg border p-3 ${s.warn ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                        <div className={`text-xl font-semibold ${s.warn ? 'text-amber-700' : 'text-gray-900'}`}>{s.num}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Duplicados detectados */}
                  {importDups.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Posibles duplicados</p>
                        {dupsPendientes.length > 0 && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                            {dupsPendientes.length} sin resolver
                          </span>
                        )}
                      </div>
                      <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-100">
                        {importDups.map(dup => {
                          const eq = importPreview[dup.idx]
                          return (
                            <div key={dup.idx} className={`p-3 transition ${dup.resolucion ? 'opacity-60' : ''}`}>
                              <div className="text-[10px] font-medium text-gray-400 mb-2 flex items-center gap-1">
                                <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                </svg>
                                {dup.match.reason === 'codigo' ? `Código compartido: ${dup.match.codigo}` : `Texto similar (${Math.round((dup.match.similitud ?? 0) * 100)}%)`}
                              </div>
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                <div className="bg-blue-50 rounded-md px-3 py-2">
                                  <div className="text-[10px] text-blue-500 font-medium mb-0.5">Del Excel</div>
                                  <div className="text-xs font-medium text-gray-800">{eq.modelo}</div>
                                  <div className="text-[10px] text-gray-400">{eq.marca}</div>
                                </div>
                                <div className="bg-gray-50 rounded-md px-3 py-2">
                                  <div className="text-[10px] text-gray-400 font-medium mb-0.5">En catálogo</div>
                                  <div className="text-xs font-medium text-gray-800">{dup.match.equipo.modelo}</div>
                                  <div className="text-[10px] text-gray-400">{dup.match.equipo.marca}</div>
                                </div>
                              </div>
                              {dup.resolucion ? (
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                  </svg>
                                  {dup.resolucion === 'catalogo' ? 'Se usará el del catálogo' : 'Se importará como nuevo'}
                                  <button onClick={() => setImportDups(prev => prev.map(d => d.idx === dup.idx ? { ...d, resolucion: null } : d))}
                                    className="ml-1 text-blue-500 hover:underline">Cambiar</button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <button onClick={() => resolverDup(dup.idx, 'catalogo')}
                                    className="flex-1 text-xs font-medium py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition border border-blue-100">
                                    Usar el del catálogo
                                  </button>
                                  <button onClick={() => resolverDup(dup.idx, 'importar')}
                                    className="flex-1 text-xs font-medium py-1.5 rounded-md bg-gray-50 text-gray-600 hover:bg-gray-100 transition border border-gray-200">
                                    Importar igual
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Marcas detectadas */}
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">Marcas detectadas</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {importMarcas.map(m => (
                        <div key={m.normalizada}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${m.enCatalogo ? 'border-gray-100 bg-gray-50' : 'border-amber-200 bg-amber-50'}`}>
                          <div>
                            <span className="font-medium text-gray-800">{m.normalizada}</span>
                            <span className="text-gray-400 ml-1.5">{m.count} equipos</span>
                          </div>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${m.enCatalogo ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {m.enCatalogo ? 'en catálogo' : 'nueva'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Normalización */}
                  {marcasConCambio.length > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                      <p className="text-[11px] font-medium text-blue-700 mb-2">Normalización automática</p>
                      <div className="space-y-1">
                        {marcasConCambio.map(m => (
                          <div key={m.normalizada} className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400 line-through">{m.raw}</span>
                            <span className="text-gray-400">→</span>
                            <span className="text-green-700 font-medium">{m.normalizada}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {marcasNuevas.length > 0 && (
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                      <input type="checkbox" checked={agregarNuevas} onChange={e => setAgregarNuevas(e.target.checked)}
                        className="w-4 h-4 rounded accent-blue-600" />
                      Agregar marcas nuevas al catálogo automáticamente
                    </label>
                  )}

                  <button onClick={() => { setImportPreview([]); setImportMarcas([]); setImportDups([]) }}
                    className="text-xs text-gray-400 hover:underline">← Cambiar archivo</button>
                </>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <div>
                {dupsPendientes.length > 0 && (
                  <span className="text-xs text-amber-600 font-medium">
                    {dupsPendientes.length} duplicado{dupsPendientes.length !== 1 ? 's' : ''} sin resolver
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setImportModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
                {importPreview.length > 0 && (
                  <button onClick={confirmarImport} disabled={guardar.isPending || guardarMarcas.isPending}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                    {guardar.isPending ? 'Importando…' : `Importar ${importPreview.length} equipos`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
