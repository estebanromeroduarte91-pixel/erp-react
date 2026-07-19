import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useOrdenes, useImportarOrdenes, useBodegas, useClientes, useImportarClientes, useActualizarCliente } from '@/lib/queries'
import type { Cliente, Orden } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function parseFecha(v: unknown): string | undefined {
  if (!v) return undefined
  if (v instanceof Date) return v.toISOString()
  const s = String(v).trim()
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`).toISOString()
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

function parsePrecio(v: unknown): number {
  if (!v) return 0
  const s = String(v).replace(/[^\d]/g, '')
  return s ? parseInt(s, 10) : 0
}

function cleanTrabajo(v: unknown): string {
  if (!v) return ''
  return String(v).replace(/\s*\d+$/, '').trim()
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' && isNaN(v)) return ''
  return String(v).trim()
}

function splitNombre(full: string): [string, string] {
  const parts = full.trim().split(/\s+/)
  return [parts[0] ?? '', parts.slice(1).join(' ')]
}

const APPLE_FIXES: [RegExp, string][] = [
  [/\bIphone\b/g, 'iPhone'],
  [/\bIpad\b/g, 'iPad'],
  [/\bIpod\b/g, 'iPod'],
  [/\bImac\b/g, 'iMac'],
  [/\bMacbook\b/g, 'MacBook'],
  [/\bAirpods\b/g, 'AirPods'],
  [/\bAirpod\b/g, 'AirPod'],
  [/\bHomepod\b/g, 'HomePod'],
  [/\bApple Tv\b/g, 'Apple TV'],
  [/\bApplewatch\b/g, 'Apple Watch'],
  [/\bMacos\b/g, 'macOS'],
  [/\bIos\b/g, 'iOS'],
]

function toAppleCase(s: string): string {
  let r = s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  for (const [pattern, replacement] of APPLE_FIXES) r = r.replace(pattern, replacement)
  return r
}

function getBranchId(bodegas: { id: string; nombre?: string; name?: string }[], sucursal: string): string | undefined {
  const q = sucursal.toLowerCase().trim()
  const b = bodegas.find(x => {
    const n = ((x.nombre ?? x.name) ?? '').toLowerCase()
    return n === q || n.includes(q) || q.includes(n)
  })
  return b?.id
}

type PreviewRow = {
  num: string
  nombre: string
  modelo: string
  trabajo: string
  fecha: string
  total: number
}

export function HistorialImportTab() {
  const { data: ordenes } = useOrdenes()
  const { data: bodegas = [] } = useBodegas()
  const { data: clientes } = useClientes()
  const importarOrdenes = useImportarOrdenes()
  const importarClientes = useImportarClientes()
  const actualizarCliente = useActualizarCliente()

  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [nuevasOrdenes, setNuevasOrdenes] = useState<Orden[]>([])
  const [nuevosClientes, setNuevosClientes] = useState<Cliente[]>([])
  const [clientesModificados, setClientesModificados] = useState<Cliente[]>([])
  const clientesActualizados = clientesModificados.length
  const [omitidas, setOmitidas] = useState(0)
  const [fileName, setFileName] = useState('')
  const [estado, setEstado] = useState<'idle' | 'preview' | 'subiendo' | 'listo' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setEstado('idle')

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        const numsExistentes = new Set((ordenes ?? []).map(o => String(o.num ?? '')))
        const clientesMerged: Cliente[] = [...(clientes ?? [])]
        const modificados: Cliente[] = []

        const toImport: Orden[] = []
        let skipped = 0

        for (const row of rows) {
          const rawNum = row['Orden N°'] ?? row['Orden N'] ?? row['Orden'] ?? ''
          let num: string
          try { num = String(parseInt(String(rawNum), 10)) } catch { num = String(rawNum).trim() }
          if (!num || num === 'NaN') continue
          if (numsExistentes.has(num)) { skipped++; continue }

          const clienteStr = safeStr(row['Cliente'])
          const [nombre, apellido] = splitNombre(clienteStr)
          const rut = safeStr(row['CI'])
          const tel = safeStr(row['Teléfono'])
          const email = safeStr(row['Correo'])
          const sucursal = safeStr(row['Sucursal'])
          const marca = toAppleCase(safeStr(row['Marca']))
          const modelo = toAppleCase(safeStr(row['Modelo']))
          const modeloCompleto = marca ? `${modelo} [${marca}]` : modelo

          const branchId = getBranchId(bodegas, sucursal)

          const orden: Orden = {
            id: uid(),
            num,
            fecha: parseFecha(row['Ingreso']),
            deliveredAt: parseFecha(row['Entrega']),
            status: 'Entregado',
            nombre,
            apellido,
            rut,
            tel,
            email,
            modelo: modeloCompleto,
            trabajo: cleanTrabajo(row['Trabajo']),
            presup: parsePrecio(row['Total']),
            branchId,
            _importado: 'gestioo',
          } as unknown as Orden

          toImport.push(orden)
          numsExistentes.add(num)

          // Procesar cliente
          const rutClean = rut.replace(/\D/g, '')
          const nomLow = nombre.toLowerCase()
          const apeLow = apellido.toLowerCase()
          const existing = clientesMerged.find(c =>
            (rutClean && c.rut && c.rut.replace(/\D/g,'') === rutClean) ||
            (c.nombre.toLowerCase() === nomLow && (c.apellido ?? '').toLowerCase() === apeLow)
          )
          if (existing) {
            let changed = false
            if (email && !existing.email) { existing.email = email; changed = true }
            if (tel && !existing.tel) { existing.tel = tel; changed = true }
            if (rut && !existing.rut) { existing.rut = rut; changed = true }
            if (changed && !modificados.some(m => m.id === existing.id)) modificados.push(existing)
          } else {
            clientesMerged.push({
              id: `cli-gestioo-${uid()}`,
              nombre, apellido, rut, tel, email,
              fecha_creacion: orden.fecha ?? new Date().toISOString(),
            })
          }
        }

        const clientesNuevos = clientesMerged.slice((clientes ?? []).length)

        setNuevasOrdenes(toImport)
        setNuevosClientes(clientesNuevos)
        setClientesModificados(modificados)
        setOmitidas(skipped)
        setPreview(toImport.slice(0, 8).map(o => ({
          num: o.num ?? '',
          nombre: `${o.nombre} ${o.apellido ?? ''}`.trim(),
          modelo: o.modelo ?? '',
          trabajo: o.trabajo ?? '',
          fecha: o.fecha ? new Date(o.fecha).toLocaleDateString('es-CL') : '',
          total: +(o.presup ?? 0),
        })))
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
      await importarOrdenes.mutateAsync(nuevasOrdenes)
      if (nuevosClientes.length > 0) await importarClientes.mutateAsync(nuevosClientes)
      for (const c of clientesModificados) await actualizarCliente.mutateAsync(c)
      setEstado('listo')
    } catch (err) {
      setErrorMsg(String(err))
      setEstado('error')
    }
  }

  function reiniciar() {
    setEstado('idle')
    setPreview([])
    setNuevasOrdenes([])
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Subir historial</h2>
      <p className="text-sm text-gray-500 mb-6">
        Importa órdenes históricas desde un Excel exportado de Gestioo.
        Las órdenes ya existentes (mismo N°) se omiten automáticamente.
      </p>

      {/* Zona de carga */}
      {estado === 'idle' && (
        <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
          <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-sm font-medium text-gray-600">Seleccionar archivo Excel</span>
          <span className="text-xs text-gray-400 mt-1">.xlsx — formato Gestioo consolidado</span>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
        </label>
      )}

      {/* Preview */}
      {estado === 'preview' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 truncate">
              {fileName}
            </div>
            <button onClick={reiniciar} className="text-sm text-gray-400 hover:text-gray-600">Cambiar</button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{nuevasOrdenes.length}</div>
              <div className="text-xs text-blue-500 mt-0.5">Órdenes a importar</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-gray-500">{omitidas}</div>
              <div className="text-xs text-gray-400 mt-0.5">Ya existentes</div>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{nuevosClientes.length}</div>
              <div className="text-xs text-green-500 mt-0.5">Clientes nuevos</div>
            </div>
          </div>

          {/* Tabla preview */}
          <p className="text-xs text-gray-400 mb-2">Muestra (primeras {preview.length} órdenes)</p>
          <div className="border border-gray-200 rounded-xl overflow-hidden mb-5">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">N°</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Modelo</th>
                  <th className="text-left px-3 py-2 font-medium">Fecha</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map(r => (
                  <tr key={r.num} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">#{r.num}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{r.nombre}</td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[150px]">{r.modelo}</td>
                    <td className="px-3 py-2 text-gray-500">{r.fecha}</td>
                    <td className="px-3 py-2 text-right text-gray-700">${r.total.toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {clientesActualizados > 0 && (
            <p className="text-xs text-amber-600 mb-4">
              {clientesActualizados} cliente(s) existentes tendrán campos completados (email/tel/rut).
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={confirmar}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              Confirmar importación
            </button>
            <button onClick={reiniciar} className="px-5 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {estado === 'subiendo' && (
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <svg className="w-5 h-5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Subiendo {nuevasOrdenes.length} órdenes...
        </div>
      )}

      {estado === 'listo' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-semibold text-green-800">Importación completada</span>
          </div>
          <p className="text-sm text-green-700">
            {nuevasOrdenes.length} órdenes y {nuevosClientes.length} clientes nuevos importados correctamente.
          </p>
          <button onClick={reiniciar} className="mt-3 text-sm text-green-600 hover:underline">
            Importar otro archivo
          </button>
        </div>
      )}

      {estado === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Error:</strong> {errorMsg}
          <button onClick={reiniciar} className="block mt-2 text-red-500 hover:underline text-xs">Reintentar</button>
        </div>
      )}
    </div>
  )
}
