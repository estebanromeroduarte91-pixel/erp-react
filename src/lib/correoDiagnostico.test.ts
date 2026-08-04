import { describe, it, expect } from 'vitest'
import { dominioDe, diagnosticarRemitente, REMITENTE_RESPALDO } from './correoDiagnostico'

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

  it('avisa cuando no hay remitente propio y se usará el buzón de respaldo', () => {
    const r = diagnosticarRemitente({ host: 'smtp.x.cl', user: 'a@x.cl' })
    expect(r).toHaveLength(1)
    expect(r[0].severidad).toBe('aviso')
    expect(r[0].detalle).toContain(REMITENTE_RESPALDO)
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
