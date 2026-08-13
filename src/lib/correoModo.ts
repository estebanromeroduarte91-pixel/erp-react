import type { SmtpConfig } from '@/types'

/**
 * El canal de salida nunca se deduce solo porque quedaron credenciales SMTP
 * antiguas guardadas. Ese comportamiento hacía que un hosting bloqueado
 * interrumpiera todos los avisos aun cuando Pixit tenía correo administrado.
 */
export function modoCorreo(cfg: Pick<SmtpConfig, 'mode'> | null | undefined): 'pixit' | 'smtp' {
  return cfg?.mode === 'smtp' ? 'smtp' : 'pixit'
}

/** Gestioo permite omitir "Usuario" cuando coincide con el remitente. */
export function usuarioSmtp(cfg: Pick<SmtpConfig, 'user' | 'from_email'>): string {
  return cfg.user?.trim() || cfg.from_email?.trim() || ''
}

export function smtpConfigurado(
  cfg: Pick<SmtpConfig, 'host' | 'user' | 'from_email' | 'password' | 'hasPassword'>,
): boolean {
  return !!(
    cfg.host?.trim()
    && usuarioSmtp(cfg)
    && (cfg.password?.trim() || cfg.hasPassword)
  )
}

