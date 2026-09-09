import { IconAlertTriangle, IconMail } from '@tabler/icons-react'
import { useAuth } from '@/context/AuthContext'

const CONTACTO_PIXIT = 'esteban@pixit.cl'

function fechaLocalISO(fecha: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha)
}

function diasCalendarioRestantes(vencimiento: string) {
  const hoy = Date.parse(`${fechaLocalISO(new Date())}T00:00:00Z`)
  const fin = Date.parse(`${fechaLocalISO(new Date(vencimiento))}T00:00:00Z`)
  return Math.round((fin - hoy) / 86_400_000)
}

function fechaChile(vencimiento: string) {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(vencimiento))
}

export function SubscriptionExpiryBanner({ mobile = false }: { mobile?: boolean }) {
  const { esAdmin, esPlatformAdmin, planEstado, trialTermina, suscripcionTermina, empresaNombre } = useAuth()
  if (!esAdmin || esPlatformAdmin) return null

  const vencimiento = planEstado === 'trial'
    ? trialTermina
    : planEstado === 'activo'
      ? suscripcionTermina
      : null

  if (!vencimiento) return null
  const dias = diasCalendarioRestantes(vencimiento)
  if (dias !== 3 && dias !== 1) return null

  const ultimoDia = dias === 1
  const asunto = encodeURIComponent(`Renovar Pixit — ${empresaNombre}`)
  const mensaje = encodeURIComponent(`Hola, quiero renovar la suscripción de ${empresaNombre}.`)

  return (
    <section
      role="status"
      aria-live="polite"
      className={`${mobile ? 'mx-4 mt-4 mb-1' : 'mb-5'} flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between ${
        ultimoDia
          ? 'border-red-200 bg-red-50 text-red-950'
          : 'border-amber-200 bg-amber-50 text-amber-950'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ultimoDia ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
          <IconAlertTriangle size={20} stroke={2} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {ultimoDia ? 'Mañana vence tu acceso a Pixit' : 'Quedan 3 días para renovar Pixit'}
          </p>
          <p className={`mt-0.5 text-xs leading-5 ${ultimoDia ? 'text-red-700' : 'text-amber-700'}`}>
            Tu acceso vence el {fechaChile(vencimiento)}. {ultimoDia
              ? 'Después del vencimiento no podrás ingresar al programa.'
              : 'Contáctanos antes de esa fecha para mantener tu cuenta activa.'}
          </p>
        </div>
      </div>
      <a
        href={`mailto:${CONTACTO_PIXIT}?subject=${asunto}&body=${mensaje}`}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-xs font-semibold shadow-sm transition hover:shadow ${
          ultimoDia ? 'border-red-200 text-red-700' : 'border-amber-200 text-amber-800'
        }`}
      >
        <IconMail size={16} />
        Contactar a Pixit
      </a>
    </section>
  )
}
