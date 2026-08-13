import { describe, expect, it } from 'vitest'
import { modoCorreo, smtpConfigurado, usuarioSmtp } from './correoModo'

describe('modoCorreo', () => {
  it('usa correo administrado por defecto aunque existan credenciales antiguas', () => {
    expect(modoCorreo(undefined)).toBe('pixit')
    expect(modoCorreo({})).toBe('pixit')
  })

  it('solo usa SMTP cuando fue seleccionado explícitamente', () => {
    expect(modoCorreo({ mode: 'smtp' })).toBe('smtp')
  })
})

describe('usuarioSmtp', () => {
  it('usa el usuario explícito cuando existe', () => {
    expect(usuarioSmtp({ user: 'login@empresa.cl', from_email: 'contacto@empresa.cl' }))
      .toBe('login@empresa.cl')
  })

  it('usa el correo remitente cuando el usuario queda vacío', () => {
    expect(usuarioSmtp({ user: '  ', from_email: ' contacto@empresa.cl ' }))
      .toBe('contacto@empresa.cl')
  })
})

describe('smtpConfigurado', () => {
  it('acepta correo remitente como usuario y una contraseña guardada', () => {
    expect(smtpConfigurado({
      host: 'mail.empresa.cl', from_email: 'contacto@empresa.cl', hasPassword: true,
    })).toBe(true)
  })

  it('exige host, identidad y contraseña', () => {
    expect(smtpConfigurado({ host: 'mail.empresa.cl', from_email: 'contacto@empresa.cl' })).toBe(false)
    expect(smtpConfigurado({ from_email: 'contacto@empresa.cl', hasPassword: true })).toBe(false)
  })
})

