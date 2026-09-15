export interface ErrorDescripto {
  mensaje: string
  stack?: string
}

function textoNoVacio(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined
}

/**
 * Convierte errores desconocidos (incluidos los objetos PostgREST de Supabase)
 * en texto legible. String(objeto) produce "[object Object]" y elimina justo
 * la información que se necesita para diagnosticar el fallo.
 */
export function describirError(error: unknown, fallback = 'Error desconocido'): ErrorDescripto {
  if (error instanceof Error) {
    return { mensaje: error.message || fallback, stack: error.stack }
  }

  const directo = textoNoVacio(error)
  if (directo) return { mensaje: directo }

  if (error && typeof error === 'object') {
    const detalle = error as Record<string, unknown>
    const partes = [detalle.message, detalle.details, detalle.hint]
      .map(textoNoVacio)
      .filter((valor): valor is string => !!valor)

    if (partes.length) {
      const codigo = textoNoVacio(detalle.code)
      return {
        mensaje: `${partes.join(' — ')}${codigo ? ` (${codigo})` : ''}`,
        stack: textoNoVacio(detalle.stack),
      }
    }

    try {
      const serializado = JSON.stringify(error)
      if (serializado && serializado !== '{}') return { mensaje: serializado }
    } catch {
      // Objetos circulares: se usa el fallback sin arriesgar otro error.
    }
  }

  return { mensaje: fallback }
}
