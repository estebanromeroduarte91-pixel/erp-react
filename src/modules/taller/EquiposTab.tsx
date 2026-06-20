import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useEquipos, useGuardarEquipos } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Equipo } from '@/types'

const CATEGORIAS = ['Teléfono', 'Tablet', 'Notebook', 'Smartwatch', 'PC escritorio', 'Consola', 'Audífonos', 'Otro']

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

export function EquiposTab() {
  const { data: equipos, isLoading } = useEquipos()
  const guardar = useGuardarEquipos()

  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat] = useState('')

  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<EquipoForm>(EMPTY_FORM)

  const [importModal, setImportModal] = useState(false)
  const [importPreview, setImportPreview] = useState<Equipo[]>([])
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const lista = useMemo(() => {
    let r = equipos ?? []
    if (filtroCat) r = r.filter(e => e.categoria === filtroCat)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(e =>
        (e.marca ?? '').toLowerCase().includes(q) ||
        (e.modelo ?? '').toLowerCase().includes(q) ||
        (e.descripcion ?? '').toLowerCase().includes(q),
      )
    }
    return r
  }, [equipos, busqueda, filtroCat])

  function abrirNuevo() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setModal(true)
  }

  function abrirEditar(e: Equipo) {
    setEditId(e.id)
    setForm({ marca: e.marca ?? '', modelo: e.modelo ?? '', categoria: e.categoria ?? 'Teléfono', descripcion: e.descripcion ?? '' })
    setModal(true)
  }

  async function guardarEquipo() {
    if (!form.modelo.trim()) return
    const all = equipos ?? []
    const datos: Equipo = {
      id: editId ?? Date.now().toString(),
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      categoria: form.categoria,
      descripcion: form.descripcion.trim() || undefined,
    }
    const nueva = editId ? all.map(e => e.id === editId ? datos : e) : [...all, datos]
    await guardar.mutateAsync(nueva)
    setModal(false)
  }

  async function eliminar(id: string) {
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
            marca: get(row, cols.marca),
            modelo: get(row, cols.modelo),
            categoria: get(row, cols.categoria) || 'Teléfono',
            descripcion: get(row, cols.descripcion) || undefined,
          }))
          .filter(e => e.marca && e.modelo)
        if (!parsed.length) { setImportError('No se encontraron equipos válidos (requiere columnas Marca y Modelo)'); return }
        setImportPreview(parsed)
      } catch (err) {
        setImportError(`Error al leer el archivo: ${(err as Error).message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function confirmarImport() {
    const nuevos = importPreview.map(e => ({ ...e, id: `eq-${Date.now()}-${Math.random().toString(36).slice(2)}` }))
    await guardar.mutateAsync([...(equipos ?? []), ...nuevos])
    setImportModal(false)
    setImportPreview([])
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

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar marca, modelo…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        </div>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:border-blue-400">
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => { setImportModal(true); setImportPreview([]); setImportError('') }}
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

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {lista.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            <p className="text-sm text-gray-400">
              {busqueda || filtroCat ? 'Sin resultados para ese filtro' : 'Sin equipos registrados. Agrega el primero.'}
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
                      <button onClick={() => abrirEditar(e)}
                        className="text-xs text-blue-600 hover:underline font-medium">Editar</button>
                      <button onClick={() => eliminar(e.id)}
                        className="text-xs text-red-500 hover:underline font-medium">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo/editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{editId ? 'Editar equipo' : 'Nuevo equipo'}</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Marca *</label>
                  <input value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))}
                    placeholder="Apple, Samsung…"
                    list="eq-marca-list"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                  <datalist id="eq-marca-list">
                    {['Apple','Samsung','Lenovo','HP','Dell','Huawei','Xiaomi','Sony','LG','Asus'].map(m => <option key={m} value={m}/>)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Categoría *</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Modelo *</label>
                <input value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))}
                  placeholder="iPhone 15 Pro, Galaxy S24…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
                <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Notas adicionales…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={guardarEquipo} disabled={!form.modelo.trim() || guardar.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                {guardar.isPending ? 'Guardando…' : 'Guardar equipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar Excel */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Importar desde Excel</h3>
                <p className="text-xs text-gray-400 mt-0.5">Columnas requeridas: Marca, Modelo</p>
              </div>
              <button onClick={() => setImportModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!importPreview.length ? (
                <>
                  <div
                    className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 transition"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) procesarExcel(f) }}
                  >
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <p className="text-sm font-medium text-gray-600">Arrastra tu archivo aquí</p>
                    <p className="text-xs text-gray-400 mt-1">o haz clic para seleccionar (.xlsx, .csv)</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) procesarExcel(e.target.files[0]); e.target.value = '' }} />
                  </div>
                  {importError && <p className="text-xs text-red-600">{importError}</p>}
                  <button onClick={descargarPlantilla}
                    className="text-xs text-blue-600 hover:underline">⬇ Descargar plantilla de ejemplo</button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">{importPreview.length} equipos encontrados</p>
                  <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-lg text-xs">
                    <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-gray-50 font-medium text-gray-400 uppercase text-[10px] tracking-wider">
                      <span>Marca</span><span>Modelo</span><span>Categoría</span>
                    </div>
                    {importPreview.slice(0, 25).map((e, i) => (
                      <div key={i} className="grid grid-cols-3 gap-2 px-3 py-2 border-t border-gray-50 text-gray-700">
                        <span>{e.marca}</span><span>{e.modelo}</span><span className="text-gray-400">{e.categoria}</span>
                      </div>
                    ))}
                    {importPreview.length > 25 && (
                      <div className="px-3 py-2 text-gray-400 border-t border-gray-50">…y {importPreview.length - 25} más</div>
                    )}
                  </div>
                  <button onClick={() => setImportPreview([])} className="text-xs text-gray-400 hover:underline">← Cambiar archivo</button>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setImportModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
              {importPreview.length > 0 && (
                <button onClick={confirmarImport} disabled={guardar.isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                  {guardar.isPending ? 'Importando…' : `Importar ${importPreview.length} equipos`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
