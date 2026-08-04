// Diagnóstico de la configuración de correo saliente.
//
// El motivo: la causa más frecuente de "configuré todo y los correos no llegan"
// no es que el SMTP esté mal, sino que el remitente no está ALINEADO con la
// cuenta que autentica el envío. Gmail y Outlook reescriben o rechazan un
// correo que dice venir de un dominio distinto al de la cuenta que lo envió, y
// DMARC lo marca como falla de alineación. La app no puede arreglarlo por el
// cliente, pero sí puede avisarle antes de que se le pierdan los correos.

export type Severidad = 'error' | 'aviso'

export interface Diagnostico {
  severidad: Severidad
  titulo: string
  detalle: string
}

/** Dominio de un correo, en minúsculas. `null` si no parece un correo. */
export function dominioDe(email: string | undefined | null): string | null {
  const valor = (email ?? '').trim().toLowerCase()
  const partes = valor.split('@')
  if (partes.length !== 2 || !partes[0] || !partes[1] || !partes[1].includes('.')) return null
  return partes[1]
}

/**
 * Proveedores que NO permiten enviar con un remitente de otro dominio: la
 * cuenta autenticada manda. Con estos, un `from_email` distinto no es un
 * riesgo de spam sino un fallo seguro, por eso se marca como error y no aviso.
 */
const PROVEEDORES_ESTRICTOS = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com']

/** Remitente de respaldo compartido: llega, pero casi siempre a spam. */
export const REMITENTE_RESPALDO = 'onboarding@resend.dev'

/**
 * Revisa la coherencia entre la cuenta SMTP y el remitente configurado.
 * Devuelve la lista de problemas encontrados, en orden de gravedad.
 */
export function diagnosticarRemitente(cfg: {
  host?: string
  user?: string
  from_email?: string
}): Diagnostico[] {
  const problemas: Diagnostico[] = []
  const haySmtp = !!(cfg.host?.trim() && cfg.user?.trim())
  if (!haySmtp) return problemas

  const fromEmail = cfg.from_email?.trim()

  // Sin remitente propio, el envío sale del buzón compartido de respaldo.
  if (!fromEmail) {
    problemas.push({
      severidad: 'aviso',
      titulo: 'Sin remitente propio',
      detalle: `Los correos saldrán desde ${REMITENTE_RESPALDO}, un buzón compartido que los filtros suelen mandar a spam. Escribe abajo el correo desde el que quieres que salgan.`,
    })
    return problemas
  }

  const dominioCuenta = dominioDe(cfg.user)
  const dominioRemitente = dominioDe(fromEmail)

  if (!dominioRemitente) {
    problemas.push({
      severidad: 'error',
      titulo: 'El correo remitente no es válido',
      detalle: `"${fromEmail}" no tiene forma de dirección de correo.`,
    })
    return problemas
  }

  if (!dominioCuenta || dominioCuenta === dominioRemitente) return problemas

  if (PROVEEDORES_ESTRICTOS.includes(dominioCuenta)) {
    problemas.push({
      severidad: 'error',
      titulo: 'El remitente no coincide con la cuenta y este proveedor no lo permite',
      detalle: `Estás autenticando con una cuenta de ${dominioCuenta}, pero enviando como "${fromEmail}". ${dominioCuenta} reescribe o rechaza esos envíos. Usa la misma dirección de la cuenta, o configura tu dominio propio en la pestaña Dominio.`,
    })
    return problemas
  }

  problemas.push({
    severidad: 'aviso',
    titulo: 'El remitente no coincide con la cuenta SMTP',
    detalle: `Autenticas con @${dominioCuenta} pero envías como @${dominioRemitente}. Si el SPF y el DKIM de ${dominioRemitente} no autorizan a ese servidor, los correos van a caer en spam. Si no controlas ese DNS, conviene enviar desde @${dominioCuenta}.`,
  })
  return problemas
}
