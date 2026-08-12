import { useRef, useState } from 'react'
import {
  useDatosTributarios, useGuardarDatosTributarios, type DatosTributarios,
  useCertificadoDte, useSubirCertificadoDte,
  useCafDte, useSubirCafDte,
} from '@/lib/queries'
import { formatRut, validarRut } from '@/lib/rut'
import { Spinner } from '@/components/shared/Spinner'

// Estos son los datos que el SII exige en cada documento electrónico. Se
// llenan una sola vez, al configurar la empresa. Existe como pantalla y no como
// SQL porque cada taller que contrate Pixit tiene que poder hacerlo solo.

const CAMPOS: { key: keyof DatosTributarios; label: string; ayuda: string; ancho?: 'medio' }[] = [
  { key: 'rut',              label: 'RUT de la empresa', ayuda: 'El del contribuyente que emite. Debe coincidir con el del certificado digital.', ancho: 'medio' },
  { key: 'razon_social',     label: 'Razón social',      ayuda: 'El nombre legal, tal como está en el SII. No el nombre de fantasía.' },
  { key: 'giro',             label: 'Giro',              ayuda: 'La glosa de tu actividad. Aparece impresa en la factura.' },
  { key: 'direccion_origen', label: 'Dirección',         ayuda: 'Dirección desde donde se emite el documento.' },
  { key: 'comuna_origen',    label: 'Comuna',            ayuda: 'Comuna de esa dirección.', ancho: 'medio' },
  { key: 'acteco',           label: 'Código de actividad económica', ayuda: 'Los dígitos de tu actividad en el SII (ej. 952100). Sin esto la factura se rechaza.', ancho: 'medio' },
]

export function TributarioTab() {
  const { data, isLoading } = useDatosTributarios()
  const guardar = useGuardarDatosTributarios()

  const [form, setForm] = useState<DatosTributarios>({})
  const [synced, setSynced] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  if (!synced && data) {
    setSynced(true)
    setForm(data)
  }

  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const rutInvalido = !!form.rut && !validarRut(form.rut)
  const faltantes = CAMPOS.filter(c => !String(form[c.key] ?? '').trim()).map(c => c.label)

  async function handleGuardar() {
    if (rutInvalido) {
      showToast('El RUT no es válido: revisá el dígito verificador.', 'err')
      return
    }
    try {
      await guardar.mutateAsync({
        rut: form.rut?.trim(),
        razon_social: form.razon_social?.trim(),
        giro: form.giro?.trim(),
        direccion_origen: form.direccion_origen?.trim(),
        comuna_origen: form.comuna_origen?.trim(),
        acteco: form.acteco?.trim(),
      })
      showToast('Datos tributarios guardados ✓')
    } catch (e) {
      showToast('No se pudo guardar: ' + (e as Error).message, 'err')
    }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-[15px] font-bold text-gray-900">Datos tributarios</h3>
        <p className="text-xs text-gray-500 mt-1">
          Los datos que el SII exige en cada documento electrónico. Se completan una sola vez.
        </p>

        <div className="grid grid-cols-2 gap-4 mt-5">
          {CAMPOS.map(c => {
            const esRut = c.key === 'rut'
            const malo = esRut && rutInvalido
            return (
              <div key={c.key} className={c.ancho === 'medio' ? 'col-span-1' : 'col-span-2'}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{c.label}</label>
                <input
                  value={String(form[c.key] ?? '')}
                  onChange={e => {
                    const v = esRut ? formatRut(e.target.value) : e.target.value
                    setForm(f => ({ ...f, [c.key]: v }))
                  }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    malo ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-200'
                  }`}
                />
                <p className={`text-[11px] mt-1 ${malo ? 'text-red-600' : 'text-gray-500'}`}>
                  {malo ? 'El dígito verificador no corresponde a ese número.' : c.ayuda}
                </p>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleGuardar}
            disabled={guardar.isPending || rutInvalido}
            className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          {faltantes.length > 0 && (
            <span className="text-xs text-amber-700">
              Falta completar: {faltantes.join(', ')}
            </span>
          )}
        </div>
      </div>

      <CertificadoCard rutEmpresa={form.rut} onAviso={showToast} />

      <FoliosCard ambiente={form.dte_ambiente ?? 'certificacion'} onAviso={showToast} />

      {/* El ambiente no se cambia desde acá a propósito: pasar a producción
          significa que los documentos empiezan a existir para el SII y no se
          pueden borrar. Se habilita recién cuando el circuito esté probado. */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Ambiente de emisión</h4>
            <p className="text-xs text-gray-500 mt-1">
              {form.dte_ambiente === 'produccion'
                ? 'Producción: los documentos que emitas son reales ante el SII.'
                : 'Certificación: los documentos son de prueba y no tienen validez tributaria.'}
            </p>
          </div>
          <span className={`text-xs font-semibold rounded-full px-3 py-1 ${
            form.dte_ambiente === 'produccion'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {form.dte_ambiente === 'produccion' ? 'Producción' : 'Certificación'}
          </span>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 rounded-lg px-4 py-3 text-sm shadow-lg ${
          toast.type === 'ok' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// Días de aviso antes del vencimiento. Un certificado vencido no da un error
// entendible: simplemente deja de poder emitirse, y eso se descubre con un
// cliente esperando su boleta. Un mes es tiempo suficiente para renovarlo.
const DIAS_AVISO = 30

function CertificadoCard({ rutEmpresa, onAviso }: {
  rutEmpresa?: string
  onAviso: (msg: string, type?: 'ok' | 'err') => void
}) {
  const { data: cert, isLoading } = useCertificadoDte()
  const subir = useSubirCertificadoDte()
  const inputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [clave, setClave] = useState('')

  const diasRestantes = cert?.dias_restantes ?? null
  const porVencer = diasRestantes !== null && diasRestantes <= DIAS_AVISO

  async function handleSubir() {
    if (!archivo || !clave) return
    try {
      const r = await subir.mutateAsync({ archivo, clave })
      onAviso(`Certificado cargado ✓ RUT ${r.rut_firmante}, vence el ${r.vence_el}`)
      setArchivo(null)
      setClave('')
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      onAviso((e as Error).message, 'err')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h4 className="text-sm font-semibold text-gray-900">Certificado digital</h4>
      <p className="text-xs text-gray-500 mt-1">
        El archivo <code className="bg-gray-100 px-1 rounded">.pfx</code> (o <code className="bg-gray-100 px-1 rounded">.p12</code>) que
        te entregó tu proveedor de firma electrónica. Se usa para firmar cada documento ante el SII.
      </p>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Spinner className="w-5 h-5" /></div>
      ) : cert ? (
        <div className={`mt-4 rounded-lg border p-3 text-xs ${
          porVencer ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-900'
        }`}>
          <p className="font-semibold">
            {porVencer ? `Vence en ${diasRestantes} días` : 'Certificado cargado'}
          </p>
          <p className="mt-0.5">RUT {cert.rut_firmante} · vence el {cert.vence_el}</p>
          {porVencer && (
            <p className="mt-1">
              Renovalo con tu proveedor y volvé a cargarlo acá. Un certificado vencido detiene la emisión.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Todavía no hay certificado cargado. Sin él no se puede emitir ningún documento.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {cert ? 'Reemplazar certificado' : 'Archivo del certificado'}
          </label>
          <input
            ref={inputRef}
            type="file"
            accept=".pfx,.p12"
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
            className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Clave del certificado</label>
          <input
            type="password"
            value={clave}
            autoComplete="off"
            onChange={e => setClave(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSubir}
          disabled={!archivo || !clave || subir.isPending}
          className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {subir.isPending ? 'Verificando…' : 'Cargar certificado'}
        </button>
        {!rutEmpresa && (
          <span className="text-xs text-amber-700">Completá primero el RUT de la empresa.</span>
        )}
      </div>

      <p className="text-[11px] text-gray-500 mt-3">
        El archivo se guarda cifrado y su clave se guarda por separado. No se puede descargar
        desde la aplicación: solo lo usa el servidor al momento de firmar un documento.
      </p>
    </div>
  )
}

const NOMBRE_DOC: Record<number, string> = {
  33: 'Factura electrónica',
  34: 'Factura exenta',
  39: 'Boleta electrónica',
  41: 'Boleta exenta',
  56: 'Nota de débito',
  61: 'Nota de crédito',
}

// Cuando quedan menos folios que esto, conviene ir al SII a pedir más. Quedarse
// sin folios detiene la venta: no se puede emitir y el cliente está esperando.
const FOLIOS_AVISO = 20

function FoliosCard({ ambiente, onAviso }: {
  ambiente: string
  onAviso: (msg: string, type?: 'ok' | 'err') => void
}) {
  const { data: cafs, isLoading } = useCafDte()
  const subir = useSubirCafDte()
  const inputRef = useRef<HTMLInputElement>(null)

  const delAmbiente = (cafs ?? []).filter(c => c.ambiente === ambiente)

  async function handleArchivo(archivo: File | null) {
    if (!archivo) return
    try {
      const r = await subir.mutateAsync(archivo)
      onAviso(`${r.documento}: folios ${r.folio_desde} al ${r.folio_hasta} cargados (${r.cantidad}) ✓`)
    } catch (e) {
      onAviso((e as Error).message, 'err')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h4 className="text-sm font-semibold text-gray-900">Folios autorizados (CAF)</h4>
      <p className="text-xs text-gray-500 mt-1">
        El archivo XML que descargás del SII para cada tipo de documento. Autoriza un rango de
        números y se agota a medida que emitís.
      </p>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Spinner className="w-5 h-5" /></div>
      ) : delAmbiente.length === 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          No hay folios cargados para el ambiente de {ambiente}. Sin folios no se puede emitir.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 font-medium">Documento</th>
                <th className="py-2 font-medium">Rango</th>
                <th className="py-2 font-medium text-right">Disponibles</th>
              </tr>
            </thead>
            <tbody>
              {delAmbiente.map(c => {
                // `ultimo_folio` arranca en 0 cuando el CAF todavía no se usó.
                const usado = Math.max(c.ultimo_folio, c.folio_desde - 1)
                const quedan = c.folio_hasta - usado
                const pocos = quedan <= FOLIOS_AVISO
                return (
                  <tr key={c.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-900">{NOMBRE_DOC[c.tipo_dte] ?? `Tipo ${c.tipo_dte}`}</td>
                    <td className="py-2 text-gray-500">{c.folio_desde}–{c.folio_hasta}</td>
                    <td className={`py-2 text-right font-semibold ${
                      quedan === 0 ? 'text-red-600' : pocos ? 'text-amber-600' : 'text-gray-900'
                    }`}>
                      {quedan === 0 ? 'agotado' : quedan}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Cargar un CAF nuevo</label>
        <input
          ref={inputRef}
          type="file"
          accept=".xml"
          disabled={subir.isPending}
          onChange={e => void handleArchivo(e.target.files?.[0] ?? null)}
          className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700"
        />
        <p className="text-[11px] text-gray-500 mt-2">
          Se va a cargar como folios de <strong>{ambiente}</strong>. El archivo no dice a qué ambiente
          pertenece, así que asegurate de que sea el correcto: un CAF de prueba usado en producción
          emite documentos que el SII rechaza.
        </p>
      </div>
    </div>
  )
}
