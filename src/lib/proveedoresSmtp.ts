// Presets de proveedores de correo para la configuración SMTP.
//
// El motivo: el taller no tiene por qué saber qué puerto usa su correo ni si
// lleva SSL directo o STARTTLS. Esos dos datos son la fuente del error más caro
// de esta pantalla — un puerto 465 con el cifrado apagado no da error, se cuelga
// diez segundos y responde "el servidor no respondió", apuntando al lugar
// equivocado. Si el proveedor los decide, esa combinación no puede existir.

export type ProveedorId = 'brevo' | 'gmail' | 'outlook' | 'hosting' | 'manual'

export interface Proveedor {
  id: ProveedorId
  nombre: string
  icono: string
  /** Qué se le pide al taller para deducir el servidor. */
  pide: 'correo' | 'dominio' | 'nada'
  etiquetaPide: string
  ejemploPide: string
  /** Cómo se llama la contraseña EN ESE proveedor. */
  etiquetaPassword: string
  /** Pasos previos fuera de la app, si los hay. */
  instrucciones?: { titulo: string; pasos: string[]; enlace: string; textoEnlace: string }
  /** Advertencia sobre el remitente, cuando el proveedor lo impone. */
  notaRemitente?: string
  /** Riesgo conocido de esta opción, para poder elegir informado. */
  advertencia?: string
  /** Se destaca como la opción recomendada. */
  recomendado?: boolean
}

export const PROVEEDORES: Proveedor[] = [
  {
    // Servicio de correo transaccional. Se pone primero y recomendado porque
    // resuelve el problema que tienen todos los demás: los servidores pensados
    // para correo personal o de hosting compartido cortan el envío al superar
    // un límite diario, y lo hacen sin avisar. Un taller con movimiento manda
    // decenas de correos al día y los va a chocar.
    id: 'brevo',
    nombre: 'Brevo',
    icono: 'send',
    pide: 'correo',
    etiquetaPide: 'Tu correo de la cuenta Brevo',
    ejemploPide: 'taller@mitaller.cl',
    etiquetaPassword: 'Clave SMTP',
    recomendado: true,
    instrucciones: {
      titulo: 'Servicio hecho para correo automático',
      pasos: [
        'Crea una cuenta gratuita en Brevo (300 correos por día).',
        'Valida la dirección desde la que vas a enviar: te llega un correo y confirmas con un clic.',
        'En Configuración → SMTP y API, genera una "clave SMTP" y pégala abajo.',
      ],
      enlace: 'https://app.brevo.com/settings/keys/smtp',
      textoEnlace: 'Abrir las claves SMTP de Brevo',
    },
  },
  {
    id: 'gmail',
    nombre: 'Gmail',
    icono: 'brand-google',
    pide: 'correo',
    etiquetaPide: 'Tu correo de Gmail',
    ejemploPide: 'taller@gmail.com',
    etiquetaPassword: 'Contraseña de aplicación',
    instrucciones: {
      titulo: 'Gmail no acepta la contraseña de tu correo',
      pasos: [
        'Activa la verificación en dos pasos en tu cuenta de Google.',
        'Genera una contraseña de aplicación para "Correo".',
        'Pega abajo los 16 caracteres que te da Google.',
      ],
      enlace: 'https://myaccount.google.com/apppasswords',
      textoEnlace: 'Abrir generador de contraseñas de Google',
    },
    notaRemitente: 'Gmail no permite enviar con otra dirección: tus correos saldrán desde esta cuenta.',
  },
  {
    id: 'outlook',
    nombre: 'Outlook',
    icono: 'brand-windows',
    pide: 'correo',
    etiquetaPide: 'Tu correo de Outlook',
    ejemploPide: 'taller@outlook.com',
    etiquetaPassword: 'Contraseña de aplicación',
    instrucciones: {
      titulo: 'Outlook pide una contraseña aparte',
      pasos: [
        'Activa la verificación en dos pasos en tu cuenta Microsoft.',
        'Crea una contraseña de aplicación.',
        'Pégala abajo en vez de la contraseña de tu correo.',
      ],
      enlace: 'https://account.microsoft.com/security',
      textoEnlace: 'Abrir seguridad de la cuenta Microsoft',
    },
    notaRemitente: 'Outlook no permite enviar con otra dirección: tus correos saldrán desde esta cuenta.',
  },
  {
    id: 'hosting',
    nombre: 'Mi hosting',
    icono: 'server',
    pide: 'dominio',
    etiquetaPide: 'Tu dominio',
    ejemploPide: 'mitaller.cl',
    etiquetaPassword: 'Contraseña del correo',
    advertencia: 'Los hostings limitan cuántos correos podés enviar por día y bloquean la cuenta al pasarte, sin avisar. Si mandás muchas órdenes, conviene un servicio de correo transaccional.',
  },
  {
    id: 'manual',
    nombre: 'Manual',
    icono: 'adjustments',
    pide: 'nada',
    etiquetaPide: '',
    ejemploPide: '',
    etiquetaPassword: 'Contraseña / App password',
  },
]

export function proveedorPorId(id: ProveedorId): Proveedor {
  return PROVEEDORES.find(p => p.id === id) ?? PROVEEDORES[PROVEEDORES.length - 1]
}

export interface ConfigDerivada {
  host: string
  port: number
  secure: boolean
}

/** Quita espacios, protocolo y el `www.` de lo que haya escrito el taller. */
export function limpiarDominio(valor: string): string {
  return valor.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^.*@/, '')   // si pegó un correo entero, se queda con el dominio
}

/**
 * Servidor, puerto y cifrado a partir del proveedor y lo que escribió el taller.
 * Devuelve `null` para 'manual' (ahí los escribe a mano) o si falta el dato.
 */
export function derivarConfig(id: ProveedorId, valor: string): ConfigDerivada | null {
  // 465 con SSL directo para Gmail: es el que menos problemas da detrás de
  // firewalls corporativos, comparado con el 587 + STARTTLS.
  // Brevo solo ofrece STARTTLS en el 587.
  if (id === 'brevo') return { host: 'smtp-relay.brevo.com', port: 587, secure: false }
  if (id === 'gmail') return { host: 'smtp.gmail.com', port: 465, secure: true }
  // Outlook solo habla STARTTLS en el 587; no ofrece SSL directo.
  if (id === 'outlook') return { host: 'smtp-mail.outlook.com', port: 587, secure: false }
  if (id === 'hosting') {
    const dominio = limpiarDominio(valor)
    if (!dominio || !dominio.includes('.')) return null
    // `mail.<dominio>` es la convención de cPanel, Plesk y la mayoría de los
    // hostings. No acierta siempre — por eso el botón de prueba manda, y los
    // datos quedan editables.
    return { host: `mail.${dominio}`, port: 465, secure: true }
  }
  return null
}

/**
 * Deduce el proveedor de una configuración ya guardada, para que quien abra la
 * pantalla vea seleccionado lo que realmente tiene en vez de arrancar en blanco.
 */
export function detectarProveedor(cfg: { host?: string }): ProveedorId {
  const host = (cfg.host ?? '').trim().toLowerCase()
  if (!host) return 'manual'
  if (host.includes('brevo') || host.includes('sendinblue')) return 'brevo'
  if (host.includes('gmail')) return 'gmail'
  if (host.includes('outlook') || host.includes('office365') || host.includes('hotmail')) return 'outlook'
  if (host.startsWith('mail.')) return 'hosting'
  return 'manual'
}

/** El dominio que hay que mostrar en el campo de 'Mi hosting'. */
export function dominioDesdeHost(host: string | undefined): string {
  const valor = (host ?? '').trim().toLowerCase()
  return valor.startsWith('mail.') ? valor.slice(5) : ''
}
