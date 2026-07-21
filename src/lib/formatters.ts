export function capFirst(s?: string | null): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function capWords(s?: string | null): string {
  if (!s) return ''
  return s.replace(/\b\w/g, c => c.toUpperCase())
}
