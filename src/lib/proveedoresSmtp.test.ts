import { describe, it, expect } from 'vitest'
import {
  PROVEEDORES, proveedorPorId, derivarConfig, detectarProveedor,
  limpiarDominio, dominioDesdeHost,
} from './proveedoresSmtp'
import { diagnosticarConexion } from './correoDiagnostico'

describe('limpiarDominio', () => {
  it('quita protocolo, www y rutas', () => {
    expect(limpiarDominio('https://www.mitaller.cl/contacto')).toBe('mitaller.cl')
  })

  it('acepta que peguen un correo entero y se queda con el dominio', () => {
    expect(limpiarDominio('contacto@mitaller.cl')).toBe('mitaller.cl')
  })

  it('normaliza mayúsculas y espacios', () => {
    expect(limpiarDominio('  MiTaller.CL ')).toBe('mitaller.cl')
  })
})

describe('derivarConfig', () => {
  it('arma el servidor de hosting con la convención mail.<dominio>', () => {
    expect(derivarConfig('hosting', 'mitaller.cl')).toEqual({
      host: 'mail.mitaller.cl', port: 465, secure: true,
    })
  })

  it('funciona aunque peguen el correo completo', () => {
    expect(derivarConfig('hosting', 'contacto@mitaller.cl')?.host).toBe('mail.mitaller.cl')
  })

  it('no adivina nada si el dominio está incompleto', () => {
    expect(derivarConfig('hosting', 'mitaller')).toBeNull()
    expect(derivarConfig('hosting', '')).toBeNull()
  })

  it('usa valores fijos para Gmail y Outlook', () => {
    expect(derivarConfig('gmail', '')).toEqual({ host: 'smtp.gmail.com', port: 465, secure: true })
    expect(derivarConfig('outlook', '')).toEqual({ host: 'smtp-mail.outlook.com', port: 587, secure: false })
  })

  it('no deriva nada en modo manual', () => {
    expect(derivarConfig('manual', 'mitaller.cl')).toBeNull()
  })

  it('NINGÚN preset produce una combinación puerto/cifrado imposible', () => {
    // Esta es la razón de existir de los presets: el bug que costó una tarde
    // fue un 465 con el cifrado apagado. Ningún preset puede reintroducirlo.
    for (const p of PROVEEDORES) {
      const cfg = derivarConfig(p.id, 'mitaller.cl')
      if (!cfg) continue
      expect(diagnosticarConexion(cfg), `${p.id} genera una configuración inválida`).toEqual([])
    }
  })
})

describe('detectarProveedor', () => {
  it('reconoce una configuración de Gmail ya guardada', () => {
    expect(detectarProveedor({ host: 'smtp.gmail.com' })).toBe('gmail')
  })

  it('reconoce Outlook y Office 365', () => {
    expect(detectarProveedor({ host: 'smtp-mail.outlook.com' })).toBe('outlook')
    expect(detectarProveedor({ host: 'smtp.office365.com' })).toBe('outlook')
  })

  it('reconoce un hosting propio por el prefijo mail.', () => {
    expect(detectarProveedor({ host: 'mail.stevedocs.cl' })).toBe('hosting')
  })

  it('cae en manual con un servidor que no encaja en ningún patrón', () => {
    expect(detectarProveedor({ host: 'smtp.sendgrid.net' })).toBe('manual')
  })

  it('cae en manual cuando todavía no hay nada configurado', () => {
    expect(detectarProveedor({})).toBe('manual')
    expect(detectarProveedor({ host: '   ' })).toBe('manual')
  })
})

describe('dominioDesdeHost', () => {
  it('recupera el dominio para volver a mostrarlo en el campo', () => {
    expect(dominioDesdeHost('mail.stevedocs.cl')).toBe('stevedocs.cl')
  })

  it('devuelve vacío si el host no sigue la convención', () => {
    expect(dominioDesdeHost('smtp.gmail.com')).toBe('')
    expect(dominioDesdeHost(undefined)).toBe('')
  })
})

describe('proveedorPorId', () => {
  it('devuelve el proveedor pedido', () => {
    expect(proveedorPorId('gmail').nombre).toBe('Gmail')
  })

  it('los proveedores que necesitan un trámite previo traen instrucciones', () => {
    expect(proveedorPorId('gmail').instrucciones?.pasos.length).toBeGreaterThan(0)
    expect(proveedorPorId('hosting').instrucciones).toBeUndefined()
  })
})

describe('Brevo', () => {
  it('deriva el servidor de correo transaccional', () => {
    expect(derivarConfig('brevo', '')).toEqual({
      host: 'smtp-relay.brevo.com', port: 587, secure: false,
    })
  })

  it('reconoce una configuración de Brevo ya guardada', () => {
    expect(detectarProveedor({ host: 'smtp-relay.brevo.com' })).toBe('brevo')
    // Brevo se llamaba Sendinblue: hay talleres con el host antiguo guardado.
    expect(detectarProveedor({ host: 'smtp-relay.sendinblue.com' })).toBe('brevo')
  })

  it('es el proveedor recomendado y no arrastra advertencias', () => {
    const brevo = proveedorPorId('brevo')
    expect(brevo.recomendado).toBe(true)
    expect(brevo.advertencia).toBeUndefined()
  })
})

describe('advertencia del hosting compartido', () => {
  // El bloqueo por volumen ya ocurrió dos veces en producción y se manifiesta
  // como "535 Incorrect authentication data", que parece contraseña mala.
  it('avisa del límite de envío antes de elegirlo', () => {
    expect(proveedorPorId('hosting').advertencia).toMatch(/limitan|bloquean/i)
  })
})
