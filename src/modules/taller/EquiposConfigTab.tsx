import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useCatEquipo, useGuardarCatEquipo, useMarcasEquipo, useGuardarMarcasEquipo, useEquipos, useGuardarEquipos } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Equipo } from '@/types'

function ListaEditable({
  titulo, descripcion, items, onGuardar, isPending,
}: {
  titulo: string
  descripcion: string
  items: string[]
  onGuardar: (lista: string[]) => Promise<void>
  isPending: boolean
}) {
  const [lista, setLista] = useState<string[]>(items)
  const [nuevo, setNuevo] = useState('')

  useEffect(() => { setLista(items) }, [items])
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [guardado, setGuardado] = useState(false)

  function agregar() {
    const v = nuevo.trim()
    if (!v || lista.includes(v)) return
    setLista(prev => [...prev, v])
    setNuevo('')
  }

  function eliminar(i: number) {
    setLista(prev => prev.filter((_, idx) => idx !== i))
  }

  function iniciarEditar(i: number) {
    setEditIdx(i)
    setEditVal(lista[i])
  }

  function confirmarEditar() {
    const v = editVal.trim()
    if (!v || editIdx === null) { setEditIdx(null); return }
    setLista(prev => prev.map((x, i) => i === editIdx ? v : x))
    setEditIdx(null)
  }

  async function guardar() {
    await onGuardar(lista)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{descripcion}</p>
      </div>

      {/* Lista */}
      <div className="space-y-1 mb-4 max-h-72 overflow-y-auto">
        {lista.map((item, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 group">
            {editIdx === i ? (
              <>
                <input
                  autoFocus
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarEditar(); if (e.key === 'Escape') setEditIdx(null) }}
                  className="flex-1 text-base md:text-sm border border-blue-300 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 bg-white"
                />
                <button onClick={confirmarEditar} className="text-xs text-blue-600 font-medium hover:underline">OK</button>
                <button onClick={() => setEditIdx(null)} className="text-xs text-gray-400 hover:underline">✕</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-700">{item}</span>
                <button onClick={() => iniciarEditar(i)}
                  className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition hover:underline">
                  Editar
                </button>
                <button onClick={() => eliminar(i)}
                  className="text-xs text-red-400 opacity-0 group-hover:opacity-100 transition hover:underline">
                  Eliminar
                </button>
              </>
            )}
          </div>
        ))}
        {lista.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Sin elementos. Agrega el primero.</p>
        )}
      </div>

      {/* Agregar */}
      <div className="flex gap-2 mb-4">
        <input
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && agregar()}
          placeholder={`Nuevo ${titulo.toLowerCase().slice(0, -1)}…`}
          className="flex-1 text-base md:text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-blue-400"
        />
        <button onClick={agregar} disabled={!nuevo.trim()}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition">
          Agregar
        </button>
      </div>

      {/* Guardar */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
        {guardado && <span className="text-xs text-green-600 font-medium">Guardado</span>}
        <button onClick={guardar} disabled={isPending}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
          {isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

function ExcelImportSection() {
  const { data: equipos } = useEquipos()
  const { data: marcasConfig = [] } = useMarcasEquipo()
  const guardarEquipos = useGuardarEquipos()
  const guardarMar = useGuardarMarcasEquipo()

  const fileRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<'idle' | 'preview' | 'subiendo' | 'listo' | 'error'>('idle')
  const [fileName, setFileName] = useState('')
  const [nuevos, setNuevos] = useState<Equipo[]>([])
  const [marcasNuevas, setMarcasNuevas] = useState<string[]>([])
  const [omitidos, setOmitidos] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setEstado('idle')

    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const resultados: Equipo[] = []
        let skipped = 0

        const existingSet = new Set(
          (equipos ?? []).map(e => `${(e.marca ?? '').toLowerCase()}|${(e.modelo ?? '').toLowerCase()}`)
        )

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName]
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
          for (const row of rows) {
            const marca = String(row['Marca'] ?? row['marca'] ?? '').trim()
            const modelo = String(row['Modelo'] ?? row['modelo'] ?? '').trim()
            if (!marca || !modelo) continue
            const key = `${marca.toLowerCase()}|${modelo.toLowerCase()}`
            if (existingSet.has(key)) { skipped++; continue }
            existingSet.add(key)
            resultados.push({ id: Date.now().toString() + Math.random().toString(36).slice(2), marca, modelo, categoria: 'Teléfono' })
          }
        }

        const marcasEnExcel = [...new Set(resultados.map(e => e.marca ?? '').filter(Boolean))]
        const marcasParaAgregar = marcasEnExcel.filter(m => !marcasConfig.includes(m))

        setNuevos(resultados)
        setMarcasNuevas(marcasParaAgregar)
        setOmitidos(skipped)
        setEstado('preview')
      } catch (err) {
        setErrorMsg(String(err))
        setEstado('error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function confirmar() {
    setEstado('subiendo')
    try {
      const allEquipos = [...(equipos ?? []), ...nuevos]
      await guardarEquipos.mutateAsync(allEquipos)
      // Sincronizar: todas las marcas presentes en el catálogo completo → tp_marcas_equipo
      const todasLasMarcas = [
        ...new Set([
          ...marcasConfig,
          ...allEquipos.map(e => e.marca ?? '').filter(Boolean),
        ]),
      ].sort()
      await guardarMar.mutateAsync(todasLasMarcas)
      setEstado('listo')
    } catch (err) {
      setErrorMsg(String(err))
      setEstado('error')
    }
  }

  function reiniciar() {
    setEstado('idle'); setNuevos([]); setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Importar modelos desde Excel</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Sube un archivo con columnas <strong>Marca</strong> y <strong>Modelo</strong>. Los duplicados se omiten automáticamente.
        </p>
      </div>

      {estado === 'idle' && (
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
          <svg className="w-7 h-7 text-gray-400 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-sm font-medium text-gray-600">Seleccionar Excel</span>
          <span className="text-xs text-gray-400 mt-0.5">.xlsx — columnas Marca y Modelo</span>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
        </label>
      )}

      {estado === 'preview' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="flex-1 text-xs text-gray-500 truncate">{fileName}</span>
            <button onClick={reiniciar} className="text-xs text-gray-400 hover:text-gray-600">Cambiar</button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-blue-700">{nuevos.length}</div>
              <div className="text-xs text-blue-500 mt-0.5">Modelos nuevos</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-gray-500">{omitidos}</div>
              <div className="text-xs text-gray-400 mt-0.5">Ya existentes</div>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-purple-700">{marcasNuevas.length}</div>
              <div className="text-xs text-purple-500 mt-0.5">Marcas nuevas</div>
            </div>
          </div>
          {nuevos.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Marca</th>
                    <th className="text-left px-3 py-2 font-medium">Modelo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {nuevos.slice(0, 6).map(e => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 text-gray-500">{e.marca}</td>
                      <td className="px-3 py-2 text-gray-800 font-medium">{e.modelo}</td>
                    </tr>
                  ))}
                  {nuevos.length > 6 && (
                    <tr><td colSpan={2} className="px-3 py-2 text-center text-gray-400">…y {nuevos.length - 6} más</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={confirmar}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
              Importar {nuevos.length} modelos
            </button>
            <button onClick={reiniciar} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          </div>
        </div>
      )}

      {estado === 'subiendo' && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Guardando {nuevos.length} modelos…
        </div>
      )}

      {estado === 'listo' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-semibold text-green-800">Importación completada</span>
          </div>
          <p className="text-xs text-green-700">{nuevos.length} modelos y {marcasNuevas.length} marcas nuevas agregados al catálogo.</p>
          <button onClick={reiniciar} className="mt-2 text-xs text-green-600 hover:underline">Importar otro archivo</button>
        </div>
      )}

      {estado === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700">
          <strong>Error:</strong> {errorMsg}
          <button onClick={reiniciar} className="block mt-1 text-red-500 hover:underline">Reintentar</button>
        </div>
      )}
    </div>
  )
}

export function EquiposConfigTab() {
  const { data: categorias, isLoading: loadCat } = useCatEquipo()
  const { data: marcas, isLoading: loadMar } = useMarcasEquipo()
  const { data: equipos } = useEquipos()
  const guardarCat = useGuardarCatEquipo()
  const guardarMar = useGuardarMarcasEquipo()
  const syncedRef = useRef(false)

  // Auto-sync: marcas presentes en el catálogo de equipos → tp_marcas_equipo
  useEffect(() => {
    if (!equipos || !marcas || guardarMar.isPending || syncedRef.current) return
    const brandsInCatalog = [...new Set(equipos.map(e => e.marca ?? '').filter(Boolean))]
    const missing = brandsInCatalog.filter(b => !marcas.includes(b))
    if (missing.length === 0) return
    syncedRef.current = true
    guardarMar.mutateAsync([...new Set([...marcas, ...brandsInCatalog])].sort())
  }, [equipos, marcas])

  if (loadCat || loadMar) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="space-y-5 max-w-2xl">
      <ListaEditable
        titulo="Categorías"
        descripcion="Tipos de dispositivos disponibles al registrar un equipo."
        items={categorias ?? []}
        onGuardar={cats => guardarCat.mutateAsync(cats)}
        isPending={guardarCat.isPending}
      />
      <ListaEditable
        titulo="Marcas"
        descripcion="Fabricantes disponibles como sugerencia al registrar un equipo."
        items={marcas ?? []}
        onGuardar={ms => guardarMar.mutateAsync(ms)}
        isPending={guardarMar.isPending}
      />
      <ExcelImportSection />
    </div>
  )
}
