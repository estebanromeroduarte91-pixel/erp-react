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

/**
 * Revisa que el puerto y el modo de cifrado sean compatibles.
 *
 * Verificado contra un servidor real (Exim en el puerto 465): conectarse sin
 * TLS a 465 no da error, se queda esperando el handshake y muere por timeout a
 * los 10s. Desde la app eso se veía como "el servidor SMTP no respondió",
 * apuntando al servidor cuando el problema era la casilla de SSL/TLS.
 */
export function diagnosticarConexion(cfg: { port?: number; secure?: boolean }): Diagnostico[] {
  const puerto = Number(cfg.port)
  if (!puerto) return []

  // 465 = SMTPS: el cifrado arranca antes de cualquier diálogo. Sin TLS no hay
  // conversación posible, solo espera hasta que corta.
  if (puerto === 465 && cfg.secure === false) {
    return [{
      severidad: 'error',
      titulo: 'El puerto 465 necesita SSL/TLS',
      detalle: 'Con esta combinación el envío no falla: se queda esperando y corta por tiempo agotado ("el servidor no respondió"). Marca la casilla SSL/TLS, o usa el puerto 587 sin marcarla.',
    }]
  }

  // 587 = STARTTLS: se abre en texto plano y se cifra después. Forzar TLS
  // desde el inicio deja al cliente esperando algo que el servidor no manda.
  if (puerto === 587 && cfg.secure === true) {
    return [{
      severidad: 'error',
      titulo: 'El puerto 587 no usa SSL/TLS directo',
      detalle: 'El 587 cifra con STARTTLS después de conectar, así que la casilla debe ir desmarcada. Si quieres cifrado directo, usa el puerto 465 con la casilla marcada.',
    }]
  }

  return []
}

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
  // En servidores de hosting, el usuario casi siempre es la misma casilla que
  // figura como remitente. Se admite dejarlo vacío para replicar el flujo
  // simple de Gestioo.
  const usuario = cfg.user?.trim() || cfg.from_email?.trim()
  const haySmtp = !!(cfg.host?.trim() && usuario)
  if (!haySmtp) return problemas

  const fromEmail = cfg.from_email?.trim()

  // Si no se indicó un remitente separado, el servidor usa la propia cuenta
  // SMTP. Esto replica el formulario simple de Gestioo y mantiene alineados
  // autenticación y remitente.
  if (!fromEmail) {
    return problemas
  }

  const dominioCuenta = dominioDe(usuario)
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
