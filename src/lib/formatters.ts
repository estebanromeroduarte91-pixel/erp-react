export function capFirst(s?: string | null): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function capWords(s?: string | null): string {
  if (!s) return ''
  // Se capitaliza solo la primera letra de cada palabra (split/join en vez de
  // \b\w) — la regex \w no reconoce vocales acentuadas (í, á, é...), así que
  // \b las trataba como límite de palabra y capitalizaba también la letra
  // siguiente (ej: "Baterías" → "BateríAs").
  return s.split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ')
}
