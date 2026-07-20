import { useState } from 'react'
import { useMsgTemplates, useGuardarMsgTemplates } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { MsgTemplates } from '@/types'

const MSG_DEFAULTS: MsgTemplates = {
  ingreso_wa:    `📥 *Orden recibida*\n\nHola *{{nombre}}*, hemos recibido tu *{{modelo}}* en nuestro taller.\n\n🔢 *Orden N°:* #{{orden}}\n📍 *Sucursal:* {{sucursal}}\n\nTe avisaremos cuando esté listo. ¡Gracias por confiar en nosotros!`,
  ingreso_email: `Hola {{nombre}},\n\nhemos recibido tu {{modelo}} en nuestro taller.\n\nOrden N°: #{{orden}}\nSucursal: {{sucursal}}\n\nTe notificaremos cuando esté listo.\n\n¡Gracias por confiar en nosotros!`,
  listo_wa:      `✅ *Tu equipo está listo*\n\nHola *{{nombre}}*, te informamos que tu *{{modelo}}* ya se encuentra listo para ser retirado.\n\n📍 *Sucursal:* {{sucursal}}\n🕐 *Horario:* {{horario}}\n🔢 *Orden N°:* #{{orden}}\n\n¡Gracias por confiar en nosotros!`,
  listo_email:   `Hola {{nombre}},\n\nte informamos que tu {{modelo}} (Orden #{{orden}}) ya se encuentra listo para ser retirado.\n\nSucursal: {{sucursal}}\nHorario: {{horario}}\n\n¡Gracias por confiar en nosotros!`,
  aprobacion_wa: `🔧 *Presupuesto para aprobación*\n\nHola *{{nombre}}*, hemos revisado tu *{{modelo}}* y necesitamos tu autorización.\n\n💰 *Presupuesto:* {{presupuesto}}\n🔢 *Orden N°:* #{{orden}}\n\n{{link}}`,
  aprobacion_email: `Hola {{nombre}},\n\nhemos revisado tu {{modelo}} y necesitamos tu autorización.\n\nTrabajo: {{trabajo}}\nPresupuesto: {{presupuesto}}\nOrden N°: #{{orden}}\n\n¡Gracias!`,
}

const VARS = ['{{nombre}}','{{modelo}}','{{orden}}','{{sucursal}}','{{horario}}','{{presupuesto}}','{{link}}','{{fecha_estimada}}']

const SECCIONES = [
  { key: 'ingreso',    label: 'Ingreso de equipo' },
  { key: 'listo',      label: 'Equipo listo' },
  { key: 'aprobacion', label: 'Aprobación de presupuesto' },
]

export function MensajesTab() {
  const { data: saved, isLoading } = useMsgTemplates()
  const guardar = useGuardarMsgTemplates()

  const [tpls, setTpls] = useState<MsgTemplates>({})
  const [guardado, setGuardado] = useState('')

  // Ajuste de estado durante el render en vez de useEffect — se sincroniza
  // una sola vez cuando llegan los datos guardados.
  const [savedSynced, setSavedSynced] = useState(false)
  if (!savedSynced && saved !== undefined) {
    setSavedSynced(true)
    setTpls({ ...MSG_DEFAULTS, ...saved })
  }

  function set(key: string, val: string) { setTpls(t => ({ ...t, [key]: val })) }

  function insertVar(textareaId: string, v: string) {
    const ta = document.getElementById(textareaId) as HTMLTextAreaElement | null
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const val = ta.value.substring(0, s) + v + ta.value.substring(e)
    set(textareaId.replace('tpl-', ''), val)
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + v.length }, 0)
  }

  async function saveSection(prefix: string) {
    await guardar.mutateAsync(tpls)
    setGuardado(prefix)
    setTimeout(() => setGuardado(''), 2000)
  }

  function reset(key: string) {
    if (!confirm('¿Restaurar el mensaje por defecto?')) return
    set(key, MSG_DEFAULTS[key] ?? '')
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
        <span className="font-semibold">Variables disponibles:</span>{' '}
        {VARS.map(v => <code key={v} className="bg-blue-100 rounded px-1 mx-0.5">{v}</code>)}
      </div>

      {SECCIONES.map(sec => (
        <div key={sec.key} className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">{sec.label}</h3>
          <div className="space-y-4">
            {[
              { k: `${sec.key}_wa`,    label: 'WhatsApp' },
              { k: `${sec.key}_email`, label: 'Email' },
            ].map(({ k, label }) => (
              <div key={k}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600">{label}</label>
                  <button onClick={() => reset(k)} className="text-xs text-gray-400 hover:text-gray-600 transition">Restaurar</button>
                </div>
                <textarea
                  id={`tpl-${k}`}
                  value={tpls[k] ?? ''}
                  onChange={e => set(k, e.target.value)}
                  rows={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-xs font-mono bg-gray-50 focus:outline-none focus:border-blue-400 resize-y"
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {VARS.slice(0, 5).map(v => (
                    <button key={v} onClick={() => insertVar(`tpl-${k}`, v)}
                      className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded hover:bg-blue-100 hover:text-blue-700 transition font-mono">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={() => saveSection(sec.key)} disabled={guardar.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
              Guardar mensajes
            </button>
            {guardado === sec.key && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
