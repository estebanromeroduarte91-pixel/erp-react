import { describe, it, expect } from 'vitest'
import { dominioDe, diagnosticarRemitente, diagnosticarConexion } from './correoDiagnostico'

describe('diagnosticarConexion', () => {
  it('marca ERROR con puerto 465 sin SSL/TLS', () => {
    // Comprobado contra un servidor Exim real: no rechaza, se cuelga esperando
    // el handshake y corta a los 10s con "el servidor no respondió".
    const r = diagnosticarConexion({ port: 465, secure: false })
    expect(r).toHaveLength(1)
    expect(r[0].severidad).toBe('error')
    expect(r[0].detalle).toContain('tiempo agotado')
  })

  it('acepta puerto 465 con SSL/TLS', () => {
    expect(diagnosticarConexion({ port: 465, secure: true })).toEqual([])
  })

  it('marca ERROR con puerto 587 y SSL/TLS directo', () => {
    const r = diagnosticarConexion({ port: 587, secure: true })
    expect(r[0].severidad).toBe('error')
    expect(r[0].titulo).toContain('587')
  })

  it('acepta puerto 587 sin SSL/TLS (STARTTLS)', () => {
    expect(diagnosticarConexion({ port: 587, secure: false })).toEqual([])
  })

  it('no opina sobre puertos no estándar', () => {
    expect(diagnosticarConexion({ port: 2525, secure: false })).toEqual([])
  })

  it('no opina si todavía no hay puerto', () => {
    expect(diagnosticarConexion({})).toEqual([])
    expect(diagnosticarConexion({ secure: true })).toEqual([])
  })

  it('no marca error con 465 si el cifrado no se definió (por defecto va con TLS)', () => {
    // `secure: undefined` = casilla nunca tocada; el servidor lo trata como TLS.
    expect(diagnosticarConexion({ port: 465 })).toEqual([])
  })
})

describe('dominioDe', () => {
  it('extrae el dominio en minúsculas', () => {
    expect(dominioDe('Contacto@MiTaller.CL')).toBe('mitaller.cl')
  })

  it('tolera espacios alrededor', () => {
    expect(dominioDe('  a@b.cl  ')).toBe('b.cl')
  })

  it('devuelve null si no parece un correo', () => {
    expect(dominioDe('sin-arroba')).toBeNull()
    expect(dominioDe('a@sinpunto')).toBeNull()
    expect(dominioDe('@b.cl')).toBeNull()
    expect(dominioDe('a@@b.cl')).toBeNull()
    expect(dominioDe(undefined)).toBeNull()
    expect(dominioDe('')).toBeNull()
  })
})

describe('diagnosticarRemitente', () => {
  it('no dice nada si todavía no hay SMTP configurado', () => {
    expect(diagnosticarRemitente({})).toEqual([])
    expect(diagnosticarRemitente({ host: 'smtp.x.cl' })).toEqual([])
  })

  it('no dice nada cuando la cuenta y el remitente son del mismo dominio', () => {
    expect(diagnosticarRemitente({
      host: 'mail.mitaller.cl', user: 'envios@mitaller.cl', from_email: 'contacto@mitaller.cl',
    })).toEqual([])
  })

  it('acepta usuario vacío cuando el remitente es la propia cuenta SMTP', () => {
    expect(diagnosticarRemitente({
      host: 'mail.mitaller.cl', user: '', from_email: 'contacto@mitaller.cl',
    })).toEqual([])
  })

  it('usa la cuenta SMTP como remitente cuando no se indica otro', () => {
    expect(diagnosticarRemitente({ host: 'smtp.x.cl', user: 'a@x.cl' })).toEqual([])
  })

  it('marca ERROR con Gmail y un remitente de otro dominio', () => {
    // Gmail reescribe o rechaza: no es "podría llegar a spam", directamente falla.
    const r = diagnosticarRemitente({
      host: 'smtp.gmail.com', user: 'taller@gmail.com', from_email: 'contacto@mitaller.cl',
    })
    expect(r).toHaveLength(1)
    expect(r[0].severidad).toBe('error')
    expect(r[0].detalle).toContain('gmail.com')
  })

  it('marca ERROR también con Outlook', () => {
    const r = diagnosticarRemitente({
      host: 'smtp.office365.com', user: 'taller@outlook.com', from_email: 'contacto@mitaller.cl',
    })
    expect(r[0].severidad).toBe('error')
  })

  it('marca solo AVISO con un servidor propio y dominios distintos', () => {
    // Acá sí puede funcionar, si el DNS del dominio remitente autoriza el envío.
    const r = diagnosticarRemitente({
      host: 'mail.hosting.cl', user: 'envios@hosting.cl', from_email: 'contacto@mitaller.cl',
    })
    expect(r).toHaveLength(1)
    expect(r[0].severidad).toBe('aviso')
    expect(r[0].detalle).toContain('spam')
  })

  it('marca ERROR si el remitente no es una dirección válida', () => {
    const r = diagnosticarRemitente({
      host: 'smtp.x.cl', user: 'a@x.cl', from_email: 'esto-no-es-un-correo',
    })
    expect(r[0].severidad).toBe('error')
    expect(r[0].titulo).toContain('no es válido')
  })

  it('ignora diferencias de mayúsculas al comparar dominios', () => {
    expect(diagnosticarRemitente({
      host: 'mail.mitaller.cl', user: 'Envios@MiTaller.cl', from_email: 'contacto@mitaller.CL',
    })).toEqual([])
  })
})
