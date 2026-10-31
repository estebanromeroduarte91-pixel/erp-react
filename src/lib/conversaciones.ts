/** Funciones puras de la bandeja de Conversaciones (sin React ni Supabase). */

export type Canal = 'email' | 'whatsapp' | 'instagram' | 'messenger'

export interface Conversacion {
  id: string
  canal: Canal
  contacto_externo: string
  contacto_nombre: string | null
  asunto: string | null
  ultimo_mensaje_en: string
  ultimo_extracto: string | null
  ultima_direccion: 'entrante' | 'saliente' | null
  no_leidos: number
  estado: 'abierta' | 'cerrada'
}

export interface MensajeConversacion {
  id: string
  conversacion_id: string
  direccion: 'entrante' | 'saliente'
  de_nombre: string | null
  de_direccion: string | null
  asunto: string | null
  texto: string | null
  html: string | null
  adjuntos: { filename: string | null; contentType: string | null; size: number | null }[]
  enviado_en: string
}

export type FiltroBandeja = 'todas' | 'sin_responder' | 'cerradas'

export function filtrarConversaciones(
  lista: Conversacion[],
  o: { canal: Canal | 'todos'; filtro: FiltroBandeja; busqueda: string },
): Conversacion[] {
  const q = o.busqueda.trim().toLocaleLowerCase('es')
  return lista
    .filter(c => o.canal === 'todos' || c.canal === o.canal)
    .filter(c => {
      if (o.filtro === 'cerradas') return c.estado === 'cerrada'
      if (c.estado === 'cerrada') return false
      return o.filtro === 'todas' || c.ultima_direccion === 'entrante'
    })
    .filter(c => !q || [c.contacto_nombre, c.contacto_externo, c.asunto, c.ultimo_extracto]
      .some(v => (v ?? '').toLocaleLowerCase('es').includes(q)))
}

/**
 * Corta el historial citado que arrastra cada respuesta de correo ("El lun,
 * 27 oct ... escribió:" y las líneas con ">"). Sin esto, cada burbuja del hilo
 * repite todo lo anterior y la conversación se vuelve ilegible.
 */
export function quitarCitado(texto: string): string {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n')
  const corte = lineas.findIndex((l, i) => {
    const t = l.trim()
    if (/^(El|On)\b.{4,200}(escribió|wrote):$/i.test(t)) return true
    // Gmail parte a veces "El ... <x@y.cl>" y "escribió:" en dos líneas.
    if (/^(El|On)\b/.test(t) && /(escribió|wrote):$/i.test((lineas[i + 1] ?? '').trim())) return true
    if (/^-{2,}\s*(Mensaje original|Original Message)\s*-{2,}$/i.test(t)) return true
    if (/^(De|From):\s.+/i.test(t) && /^(Enviado|Sent|Fecha|Date):\s/i.test((lineas[i + 1] ?? '').trim())) return true
    // Un bloque de citas al final (no una línea suelta con ">" en el medio).
    return t.startsWith('>') && lineas.slice(i).every(r => !r.trim() || r.trim().startsWith('>'))
  })
  const util = (corte === -1 ? lineas : lineas.slice(0, corte)).join('\n').trim()
  // Si cortar deja el mensaje vacío, mejor mostrar todo que nada.
  return util || texto.trim()
}

export function nombreContacto(c: Pick<Conversacion, 'contacto_nombre' | 'contacto_externo'>): string {
  return c.contacto_nombre?.trim() || c.contacto_externo
}

export function horaCorta(iso: string, ahora = new Date()): string {
  const d = new Date(iso)
  const mismoDia = d.toDateString() === ahora.toDateString()
  if (mismoDia) return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const ayer = new Date(ahora)
  ayer.setDate(ahora.getDate() - 1)
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

// Lo que puede cargar un correo dentro de Pixit: imágenes y estilos, nada que
// ejecute código ni mande datos. Es la segunda barrera; la primera es el
// `sandbox` del iframe, que ya bloquea scripts y formularios.
const CSP_CORREO = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:"

/**
 * Prepara el HTML de un correo para mostrarlo tal como se ve en el teléfono,
 * dentro de un iframe aislado. Quita lo que no debe correr (scripts, frames,
 * formularios, redirecciones) y el historial citado de las respuestas, que en
 * el hilo ya está como mensaje propio. Los enlaces abren en otra pestaña.
 */
export function prepararHtmlCorreo(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, iframe, frame, frameset, object, embed, form, base, meta, link:not([rel~="stylesheet"])')
    .forEach(n => n.remove())
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
      else if (/^(href|src|action|formaction)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
    }
  }

  // Historial citado: Gmail, Apple Mail, Outlook. Si cortarlo deja el correo
  // vacío (alguien que solo reenvió), se conserva entero.
  const respaldo = doc.body.innerHTML
  doc.querySelectorAll('.gmail_quote, .gmail_extra, blockquote[type="cite"], #appendonsend, #divRplyFwdMsg, .moz-cite-prefix, .yahoo_quoted')
    .forEach(n => n.remove())
  if (!doc.body.textContent?.trim() && !doc.body.querySelector('img')) doc.body.innerHTML = respaldo

  const head = doc.head
  const csp = doc.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute('content', CSP_CORREO)
  const base = doc.createElement('base')
  base.setAttribute('target', '_blank')
  const estilo = doc.createElement('style')
  // Los correos vienen pensados para ~600 px: que nunca desborden la burbuja.
  estilo.textContent = 'html{overflow-y:hidden}html,body{margin:0;padding:0;background:#fff}body{overflow-x:auto;padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}'
  head.prepend(csp, base, estilo)
  return '<!doctype html>' + doc.documentElement.outerHTML
}
