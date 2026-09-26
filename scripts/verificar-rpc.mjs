#!/usr/bin/env node
// Compara lo que el código llama contra lo que hay en la base de datos.
//
//   node scripts/verificar-rpc.mjs              → imprime el SQL a pegar
//   node scripts/verificar-rpc.mjs --desde x.json → compara y falla si algo no calza
//
// Existe por el incidente del 2026-09-15: el frontend se publicó esperando una
// función nueva que nunca se aplicó en la base, y durante diez días las ventas
// no descontaron stock sin mostrar ningún error.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Marcadores: trozos de texto que SOLO aparecen en la versión vigente de cada
// función. Sin esto, una función vieja con la misma firma pasa inadvertida.
const MARCADORES = {
  fn_confirmar_venta: {
    marcadores: ['direccion', 'venta_lote_consumos'],
    porque: 'la versión anterior descuenta stock solo si el navegador le manda los ajustes',
  },
  fn_registrar_traslado: {
    // 'cantidad_inicial' solo aparece en la versión que recrea las capas FIFO
    // en el destino. Un marcador que la versión vieja también tiene (como
    // 'lotes_inventario') no distingue nada y da una falsa tranquilidad.
    marcadores: ['cantidad_inicial'],
    porque: 'el traslado tiene que mover las capas de costo junto con el stock',
  },
  fn_registrar_conteo: {
    marcadores: ['conteos_inventario'],
    porque: 'faltaba por completo en producción: la toma de inventario no podía guardar',
  },
  fn_upsert_asientos: {
    marcadores: ['asientos_contables'],
    porque: 'el Libro Diario la necesita para guardar sin pisar los asientos de otro usuario',
  },
  fn_fijar_stock_manual: {
    marcadores: ['fn_ajustar_stock'],
    porque: 'los ajustes manuales deben pasar por el delta atómico',
  },
}

function archivosDeCodigo(dir, acc = []) {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === 'dist' || entrada.startsWith('.')) continue
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) archivosDeCodigo(ruta, acc)
    else if (/\.(ts|tsx|mts|mjs)$/.test(entrada) && !/\.test\./.test(entrada)) acc.push(ruta)
  }
  return acc
}

/** Busca cada `.rpc('nombre', { p_uno: ..., p_dos: ... })` y anota sus parámetros. */
export function extraerLlamadas(codigo) {
  const encontradas = new Map()
  const re = /\.rpc\(\s*['"`]([a-z0-9_]+)['"`]\s*(?:,\s*(\{))?/gi
  let m
  while ((m = re.exec(codigo)) !== null) {
    const [, nombre, abre] = m
    const previo = encontradas.get(nombre) ?? new Set()
    if (abre) {
      // Recorre el objeto de argumentos contando llaves, para no cortarlo en
      // un objeto anidado ni en una llave dentro de un texto.
      let i = re.lastIndex, nivel = 1, cuerpo = ''
      while (i < codigo.length && nivel > 0) {
        const c = codigo[i]
        if (c === '{') nivel++
        else if (c === '}') nivel--
        // Solo el primer nivel: las claves de un objeto anidado son datos del
        // argumento, no parámetros de la función.
        if (nivel === 1 && c !== '{' && c !== '}') cuerpo += c
        i++
      }
      // Sin comentarios: una propiedad escrita debajo de un comentario queda
      // separada de su coma y se perdería.
      const limpio = cuerpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      // Solo cuenta como parámetro lo que abre una propiedad: después de "{"
      // o de una coma. Así un ternario dentro del argumento (`x ? id : null`)
      // no se confunde con dos claves llamadas "id" y "null".
      for (const p of limpio.matchAll(/(?:^|[,{])\s*([a-z_][a-z0-9_]*)\s*:/gi)) previo.add(p[1])
    }
    encontradas.set(nombre, previo)
  }
  return encontradas
}

function contratoEsperado() {
  const fuentes = [join(raiz, 'src'), join(raiz, 'supabase', 'functions')]
  const esperado = {}
  const donde = {}
  for (const base of fuentes) {
    let archivos = []
    try { archivos = archivosDeCodigo(base) } catch { continue }
    for (const archivo of archivos) {
      for (const [nombre, params] of extraerLlamadas(readFileSync(archivo, 'utf8'))) {
        esperado[nombre] ??= { parametros: [], marcadores: MARCADORES[nombre]?.marcadores ?? [] }
        const set = new Set([...esperado[nombre].parametros, ...params])
        esperado[nombre].parametros = [...set].sort()
        ;(donde[nombre] ??= new Set()).add(relative(raiz, archivo))
      }
    }
  }
  return { esperado, donde }
}

function imprimirSql(esperado) {
  const json = JSON.stringify(esperado, null, 2).replace(/'/g, "''")
  console.log(`-- Pega esto en el SQL Editor de Supabase y guarda el resultado en un archivo.
-- Después:  node scripts/verificar-rpc.mjs --desde resultado.json

select public.fn_contrato_rpc('${json}'::jsonb);
`)
}

/**
 * El SQL Editor devuelve el resultado envuelto de distintas formas según cómo
 * se copie: la lista pelada, `{fn_contrato_rpc: [...]}` o esa misma dentro de
 * un array de filas. Acá se desenvuelve cualquiera de las tres.
 */
export function normalizarReporte(reporte) {
  if (Array.isArray(reporte)) {
    if (reporte.length && reporte[0] && typeof reporte[0] === 'object' && 'fn_contrato_rpc' in reporte[0]) {
      return normalizarReporte(reporte[0].fn_contrato_rpc)
    }
    return reporte.filter(f => f && typeof f === 'object' && 'funcion' in f)
  }
  if (reporte && typeof reporte === 'object' && 'fn_contrato_rpc' in reporte) {
    return normalizarReporte(reporte.fn_contrato_rpc)
  }
  return []
}

function comparar(esperado, donde, reporte) {
  const filas = normalizarReporte(reporte)
  if (!filas.length) {
    console.error('El archivo no trae el resultado de fn_contrato_rpc.')
    return 2
  }

  const problemas = []
  for (const fila of filas) {
    const usos = [...(donde[fila.funcion] ?? [])].join(', ')
    if (!fila.existe) {
      problemas.push(`✗ ${fila.funcion} NO EXISTE en la base — la llama ${usos}`)
      continue
    }
    for (const p of fila.parametros_faltantes ?? []) {
      problemas.push(`✗ ${fila.funcion} no recibe el parámetro "${p}" que le manda ${usos}\n    firma en la base: (${fila.firma})`)
    }
    for (const m of fila.marcadores_faltantes ?? []) {
      problemas.push(`✗ ${fila.funcion} parece una versión antigua: le falta "${m}"\n    ${MARCADORES[fila.funcion]?.porque ?? ''}`)
    }
  }

  const revisadas = filas.length
  if (!problemas.length) {
    console.log(`✓ ${revisadas} funciones revisadas: el código y la base están sincronizados.`)
    return 0
  }
  console.error(`${problemas.length} problema(s) en ${revisadas} funciones revisadas:\n`)
  for (const p of problemas) console.error('  ' + p)
  console.error('\nFalta aplicar una migración en Supabase antes de publicar este código.')
  return 1
}

const { esperado, donde } = contratoEsperado()
const i = process.argv.indexOf('--desde')
if (i === -1) {
  imprimirSql(esperado)
  console.log(`-- ${Object.keys(esperado).length} funciones llamadas desde el código.`)
} else {
  process.exit(comparar(esperado, donde, JSON.parse(readFileSync(process.argv[i + 1], 'utf8'))))
}
