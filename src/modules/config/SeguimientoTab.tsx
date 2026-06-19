import { useState, useEffect } from 'react'
import { useSeguimientoConfig, useGuardarSeguimientoConfig } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { SeguimientoConfig } from '@/types'

export function SeguimientoTab() {
  const { data: cfg, isLoading } = useSeguimientoConfig()
  const guardar = useGuardarSeguimientoConfig()

  const [form, setForm] = useState<SeguimientoConfig>({})
  const [guardado, setGuardado] = useState(false)

  useEffect(() => { if (cfg) setForm(cfg) }, [cfg])

  function set(k: keyof SeguimientoConfig, v: string | number) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleGuardar() {
    await guardar.mutateAsync(form)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-2xl space-y-6">
      {/* Info del taller */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Información del taller</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'nombreTaller', label: 'Nombre del taller *', placeholder: 'TallerPro', span2: true },
            { key: 'emailContacto', label: 'Email de contacto', placeholder: 'contacto@taller.cl' },
            { key: 'telefono', label: 'Teléfono', placeholder: '+56 9 XXXX XXXX' },
            { key: 'horario', label: 'Horario', placeholder: 'Lun–Vie 10:00–19:00' },
            { key: 'ubicacion', label: 'Dirección / Ubicación', placeholder: 'Av. Ejemplo 123, Santiago', span2: true },
            { key: 'especialidad', label: 'Especialidad', placeholder: 'Reparación de iPhone y Samsung', span2: true },
          ].map(f => (
            <div key={f.key} className={f.span2 ? 'col-span-2' : ''}>
              <label className="text-xs font-medium text-gray-600 block mb-1">{f.label}</label>
              <input
                type="text"
                value={(form[f.key as keyof SeguimientoConfig] as string) ?? ''}
                onChange={e => set(f.key as keyof SeguimientoConfig, e.target.value)}
                placeholder={f.placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Correo de seguimiento */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Correo de seguimiento automático</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Días estimados de reparación</label>
              <input
                type="number" min={0} value={form.dias ?? ''}
                onChange={e => set('dias', +e.target.value)}
                placeholder="3"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Asunto del correo</label>
              <input
                type="text" value={form.asunto ?? ''}
                onChange={e => set('asunto', e.target.value)}
                placeholder="Estado de tu reparación"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Mensaje apertura (saludo)</label>
            <textarea
              value={form.msgApertura ?? ''} onChange={e => set('msgApertura', e.target.value)}
              rows={3} placeholder="Hola {{nombre}}, te informamos que..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Mensaje cierre (despedida)</label>
            <textarea
              value={form.msgCierre ?? ''} onChange={e => set('msgCierre', e.target.value)}
              rows={2} placeholder="¡Gracias por confiar en nosotros!"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">URL del logo</label>
            <input
              type="url" value={form.logoUrl ?? ''}
              onChange={e => set('logoUrl', e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
            />
            {form.logoUrl && (
              <img src={form.logoUrl} alt="logo preview"
                className="mt-2 max-h-14 object-contain rounded border border-gray-100"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleGuardar}
          disabled={guardar.isPending}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {guardado && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
      </div>
    </div>
  )
}
