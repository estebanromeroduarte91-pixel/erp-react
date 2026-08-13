import { useState, useRef } from 'react'
import { useActualizarNombreEmpresa, useSeguimientoConfig, useGuardarSeguimientoConfig, useDatosTributarios } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/shared/Spinner'
import type { SeguimientoConfig } from '@/types'

export function GeneralTab() {
  const { empresaId, empresaNombre } = useAuth()
  const actualizarNombreEmpresa = useActualizarNombreEmpresa()
  const { data: cfg, isLoading } = useSeguimientoConfig()
  // La vista previa mostraba un RUT y una dirección escritos a mano — los del
  // taller de quien desarrolló esto. Cada cliente de Pixit los veía en SU
  // pantalla de configuración. Ahora salen los datos de cada empresa.
  const { data: tributario } = useDatosTributarios()
  const guardarCfg = useGuardarSeguimientoConfig()

  const [nombreEmpresa, setNombreEmpresa] = useState(empresaNombre)
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const [form, setForm] = useState<SeguimientoConfig>({})
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [errorLogo, setErrorLogo] = useState('')
  const [guardandoLogo, setGuardandoLogo] = useState(false)
  const [guardandoBoleta, setGuardandoBoleta] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Ajuste de estado durante el render en vez de useEffect (evita el setState
  // síncrono dentro de un efecto) — se sincroniza una vez cuando llegan los datos.
  const [cfgSynced, setCfgSynced] = useState(false)
  if (!cfgSynced && cfg) {
    setCfgSynced(true)
    setForm(cfg)
  }

  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleGuardarNombreEmpresa() {
    if (!nombreEmpresa.trim() || nombreEmpresa.trim() === empresaNombre) return
    setGuardandoNombre(true)
    try {
      await actualizarNombreEmpresa.mutateAsync(nombreEmpresa.trim())
      // El nombre vive en el AuthContext (no en React Query) — se recarga para
      // que el sidebar/topbar lo reflejen de inmediato.
      window.location.reload()
    } catch (e) {
      showToast('No se pudo guardar: ' + (e as Error).message, 'err')
      setGuardandoNombre(false)
    }
  }

  async function guardarLogoUrl(logoUrl: string) {
    const updated = { ...form, logoUrl }
    setForm(updated)
    setGuardandoLogo(true)
    try {
      await guardarCfg.mutateAsync(updated)
      showToast('Logo guardado ✓')
    } finally {
      setGuardandoLogo(false)
    }
  }

  async function handleSubirLogo(file: File) {
    if (!empresaId) return
    setSubiendoLogo(true)
    setErrorLogo('')
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${empresaId}/logo/logo_taller.${ext}`
    const { error } = await supabase.storage.from('erp-assets').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { setErrorLogo('Error al subir: ' + error.message); setSubiendoLogo(false); return }
    const logoUrl = `${import.meta.env.VITE_SUPABASE_URL || 'https://nfcdqdbhrsjhbnbtqewl.supabase.co'}/functions/v1/public-logo?p=${encodeURIComponent(path)}&t=${Date.now()}`
    await guardarLogoUrl(logoUrl)
    setSubiendoLogo(false)
  }

  async function handleGuardarBoleta() {
    setGuardandoBoleta(true)
    try {
      await guardarCfg.mutateAsync({
        ...form,
        boletaEstilo: form.boletaEstilo ?? 'moderna',
        boletaMostrarLogo: form.boletaMostrarLogo !== false,
        boletaColor: form.boletaColor || '#2563eb',
        boletaContacto: form.boletaContacto?.trim(),
        boletaPie: form.boletaPie?.trim(),
      })
      showToast('Diseño de boleta guardado ✓')
    } catch (e) {
      showToast('No se pudo guardar: ' + (e as Error).message, 'err')
    } finally {
      setGuardandoBoleta(false)
    }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-2xl space-y-4">
      {toast && (
        <div className={[
          'px-4 py-3 rounded-xl text-sm font-medium border',
          toast.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200',
        ].join(' ')}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-1">Datos de la empresa</h3>
        <p className="text-xs text-gray-400 mb-4">Este nombre aparece en el menú lateral y en el encabezado del sistema.</p>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-gray-600 block mb-1">Nombre de la empresa</label>
            <input
              value={nombreEmpresa}
              onChange={e => setNombreEmpresa(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGuardarNombreEmpresa()}
              placeholder="Nombre de tu empresa"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
            />
          </div>
          <button
            onClick={handleGuardarNombreEmpresa}
            disabled={guardandoNombre || !nombreEmpresa.trim() || nombreEmpresa.trim() === empresaNombre}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition whitespace-nowrap">
            {guardandoNombre ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div id="tour-logo-upload" className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-1">Logo del taller</h3>
        <p className="text-xs text-gray-400 mb-4">Se usa en las cabeceras de cotizaciones y en las notificaciones por correo de ingreso, listo y entrega.</p>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="url" value={form.logoUrl ?? ''}
            onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
            placeholder="https://... o sube una imagen"
            className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
          />
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={subiendoLogo || guardandoLogo}
            className="px-3 py-2 text-sm font-semibold bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition whitespace-nowrap disabled:opacity-60"
          >
            {subiendoLogo ? 'Subiendo…' : '📁 Subir imagen'}
          </button>
          <input
            ref={logoInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleSubirLogo(f) }}
          />
          <button
            type="button"
            onClick={() => guardarLogoUrl(form.logoUrl ?? '')}
            disabled={guardandoLogo || subiendoLogo || (form.logoUrl ?? '') === (cfg?.logoUrl ?? '')}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition whitespace-nowrap">
            {guardandoLogo ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        {errorLogo && <p className="text-xs text-red-500 mt-1">{errorLogo}</p>}
        {form.logoUrl && (
          <img src={form.logoUrl} alt="logo preview"
            className="mt-2 max-h-14 object-contain rounded border border-gray-100"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-1">Diseño de boleta</h3>
        <p className="text-xs text-gray-400 mb-4">
          Personaliza la representación impresa de 80 mm. Los datos tributarios obligatorios no se pueden ocultar.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-5">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Plantilla</label>
              <select
                value={form.boletaEstilo ?? 'moderna'}
                onChange={e => setForm(f => ({ ...f, boletaEstilo: e.target.value as 'moderna' | 'clasica' }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
              >
                <option value="moderna">Moderna</option>
                <option value="clasica">Clásica</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.boletaMostrarLogo !== false}
                onChange={e => setForm(f => ({ ...f, boletaMostrarLogo: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600"
              />
              Mostrar el logo del taller
            </label>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Color de acento</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.boletaColor || '#2563eb'}
                  onChange={e => setForm(f => ({ ...f, boletaColor: e.target.value }))}
                  className="h-9 w-12 rounded border border-gray-200 bg-white p-1"
                />
                <input
                  value={form.boletaColor || '#2563eb'}
                  onChange={e => setForm(f => ({ ...f, boletaColor: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Contacto o sitio web</label>
              <input
                value={form.boletaContacto ?? ''}
                onChange={e => setForm(f => ({ ...f, boletaContacto: e.target.value }))}
                placeholder="tutaller.cl · +56 9 ..."
                maxLength={100}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Mensaje final</label>
              <input
                value={form.boletaPie ?? ''}
                onChange={e => setForm(f => ({ ...f, boletaPie: e.target.value }))}
                placeholder="Gracias por preferirnos"
                maxLength={120}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
              />
            </div>

            <button
              onClick={handleGuardarBoleta}
              disabled={guardandoBoleta || guardarCfg.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {guardandoBoleta ? 'Guardando…' : 'Guardar diseño'}
            </button>
          </div>

          <div className="bg-gray-100 rounded-xl p-3 flex justify-center items-start">
            <div className="w-[178px] min-h-[310px] bg-white shadow-sm px-3 py-4 text-center text-[7px] text-gray-700">
              {form.boletaMostrarLogo !== false && form.logoUrl
                ? <img src={form.logoUrl} alt="Logo" className="h-8 max-w-[110px] object-contain mx-auto mb-2" />
                : <p className="font-black text-[13px] tracking-tight mb-2">{empresaNombre}</p>}
              <div className="h-0.5 rounded mb-3" style={{ background: form.boletaColor || '#2563eb' }} />
              <p className="font-bold tracking-widest">BOLETA ELECTRÓNICA</p>
              <p className="font-black text-[18px] mt-0.5">N° 000155</p>
              <p className="mt-2">{tributario?.rut ? `RUT ${tributario.rut}` : 'RUT de tu empresa'}</p>
              <p>{[tributario?.direccion_origen, tributario?.comuna_origen].filter(Boolean).join(', ') || 'Dirección de tu taller'}</p>
              <div className="border-t border-dashed border-gray-300 my-3" />
              <div className="flex justify-between text-left"><span>Producto o servicio</span><b>$89.990</b></div>
              <div className="border-t border-gray-900 my-3" />
              <div className="flex justify-between font-black text-[11px]"><span>TOTAL</span><span>$89.990</span></div>
              <div className="border-t border-dashed border-gray-300 my-3" />
              <p className="font-semibold">{form.boletaPie || 'Gracias por preferirnos'}</p>
              <p className="mt-1 text-gray-400">{form.boletaContacto || 'Verifique en www.sii.cl'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
