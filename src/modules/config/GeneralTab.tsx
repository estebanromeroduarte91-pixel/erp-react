import { useState, useRef } from 'react'
import { useActualizarNombreEmpresa, useSeguimientoConfig, useGuardarSeguimientoConfig } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/shared/Spinner'
import type { SeguimientoConfig } from '@/types'

export function GeneralTab() {
  const { empresaId, empresaNombre } = useAuth()
  const actualizarNombreEmpresa = useActualizarNombreEmpresa()
  const { data: cfg, isLoading } = useSeguimientoConfig()
  const guardarCfg = useGuardarSeguimientoConfig()

  const [nombreEmpresa, setNombreEmpresa] = useState(empresaNombre)
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const [form, setForm] = useState<SeguimientoConfig>({})
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [errorLogo, setErrorLogo] = useState('')
  const [guardandoLogo, setGuardandoLogo] = useState(false)
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
    const { data: urlData } = supabase.storage.from('erp-assets').getPublicUrl(path)
    await guardarLogoUrl(urlData.publicUrl + '?t=' + Date.now())
    setSubiendoLogo(false)
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
    </div>
  )
}
