# Pixit — ERP/POS para talleres de servicio técnico

App multi-tenant (React + Supabase) para talleres de reparación de celulares/computadores:
punto de venta, órdenes de trabajo, inventario con costeo FIFO, compras a proveedores,
cotizaciones, contabilidad básica y un panel de administración de la plataforma
(`/pixit-admin`) para gestionar los talleres que usan el producto.

En producción: **pixit.cl**, desplegado en Cloudflare Pages a partir de la rama `main`.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS, React Router (HashRouter),
  TanStack Query.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions). Sin backend propio —
  la lógica de negocio sensible (folios atómicos, transacciones de venta, permisos) vive en
  funciones/triggers de Postgres, no en el cliente. Ver [`supabase/`](./supabase).
- **Multi-tenant**: cada fila de las tablas de negocio tiene `empresa_id`; el aislamiento
  entre talleres se hace con Row Level Security (RLS) de Postgres, no con lógica de la app.

## Desarrollo local

```bash
npm install
npm run dev       # servidor de desarrollo (Vite)
npm run lint      # ESLint
npm run build     # typecheck (tsc) + build de producción
npm run preview   # sirve el build de dist/ localmente
```

No hace falta un `.env` para levantar el proyecto: la URL y la anon key de Supabase están
en [`src/lib/supabase.ts`](./src/lib/supabase.ts) (la anon key es pública por diseño, no es
un secreto). La única variable de entorno real es:

- `VITE_VAPID_PUBLIC_KEY` — clave pública para notificaciones push del navegador.

## Base de datos (Supabase)

Todo el SQL de seguridad/rendimiento (RLS, funciones, triggers, índices) corrido contra el
proyecto de Supabase está versionado en [`supabase/`](./supabase), numerado en el orden en
que se aplicó. Son documentación de lo que ya existe en producción, **no un runner de
migraciones automático** — si levantas un proyecto Supabase nuevo desde cero, hay que
correrlos a mano y en orden desde el SQL Editor del dashboard.

Piezas clave a tener presente si vas a tocar el schema:

- `mi_empresa_id()` — función central que resuelve la empresa del usuario autenticado.
  Casi todas las policies de RLS de la app filtran por `empresa_id = mi_empresa_id()`, así
  que un cambio ahí (ver `15_suspension_real.sql`) afecta a toda la base a la vez.
- `fn_confirmar_venta` / `fn_recibir_oc` — las únicas dos operaciones de negocio que
  necesitan atomicidad multi-tabla real (venta + stock + lotes + movimiento, o recepción de
  OC + stock + lotes) pasan por una función de Postgres en vez de varias escrituras
  independientes desde el cliente.
- `erp_data` — tabla key-value (`empresa_id`, `clave`, `datos jsonb`) heredada del ERP
  original de un solo archivo. Productos, ventas, órdenes, OCs, movimientos de inventario y
  lotes FIFO ya se migraron a tablas relacionales propias; lo que queda en `erp_data` es
  configuración y datos de menor volumen (plantillas de mensajes, plan_limits, etc.).

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) corre lint + tests + typecheck +
build + smoke tests en cada push a `main` y en cada Pull Request. Es un complemento al build
que ya hace Cloudflare Pages en cada deploy (que también falla si hay errores de TypeScript)
— corre más rápido y además valida ESLint, que el deploy de Cloudflare no revisa.

## Tests

- **`npm test`** — unitarios con Vitest sobre lógica pura (FIFO de lotes, RUT, contabilidad,
  estado de OC, reparto de gastos por sucursal, fechas locales, validación de archivos
  importados, tablas de planes).
- **`npm run test:e2e`** — smoke tests con Playwright sobre el **build real** (`dist`), no
  sobre el dev server: verifican que la landing, el login, las páginas públicas por token
  (`foto-orden.html`, `aprobar.html`, `cotizacion.html`) y una ruta inexistente no queden en
  pantalla en blanco ni tiren errores de consola.

  Existen por un incidente concreto: un deploy dejó la app en blanco porque los chunks lazy
  del build anterior dejaban de existir y el error caía en el ErrorBoundary. Ningún test
  unitario lo detectó, porque el bug vivía en el build y no en la lógica.

  **No hay pruebas E2E con sesión iniciada, a propósito**: crearían órdenes y ventas reales
  contra la base de producción. Para tenerlas hace falta primero un entorno de pruebas
  aparte (un segundo proyecto Supabase, o una empresa dedicada) — pendiente conocido.

  Ojo: `e2e/` está excluido de Vitest en `vitest.config.ts`. Los dos runners usan archivos
  `.spec/.test` pero APIs distintas, y sin esa exclusión Vitest intenta correr los de
  Playwright y falla.

## Dependencias y `npm audit`

- **`xlsx` (SheetJS)** se instala desde el CDN oficial del proveedor
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), no desde npm: SheetJS dejó de
  publicar en el registro, y la última versión que hay ahí (0.18.5) arrastra dos
  vulnerabilidades altas (prototype pollution y ReDoS) que **sí** son alcanzables acá,
  porque la app parsea archivos `.xlsx` subidos por el usuario (importar clientes, equipos
  e historial de órdenes). Al actualizar la versión hay que cambiar esa URL a mano.
  CI y cualquier `npm ci` necesitan poder alcanzar `cdn.sheetjs.com`.

- **`react-router` — advisory [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
  (CSRF en modo RSC): NO aplica a este proyecto y se deja a propósito sin "arreglar".**
  La app usa `HashRouter` puro (SPA estática servida por Cloudflare Pages), sin framework
  mode, sin `react-router.config.ts` y sin React Server Components — no hay servidor
  ejecutando actions, que es lo que explota ese advisory. El `npm audit fix --force` que
  npm sugiere baja a `react-router-dom@7.11.0`, que es un cambio breaking, a cambio de
  nada. Por eso `npm audit` queda en 2 (react-router + react-router-dom) y eso es lo
  esperado, no un pendiente.

  **Volver a evaluar esta excepción si pasa cualquiera de estas cosas:** se actualiza
  React Router a una versión que ya tenga el parche; se introduce SSR, framework mode
  (`react-router.config.ts` / `@react-router/dev`), React Server Components o Server
  Actions; o se cambia `HashRouter` por un router con loaders/actions del lado del
  servidor. Mientras siga siendo una SPA estática sin servidor, la excepción se sostiene.

- **`npm audit` no corre en CI a propósito.** El workflow hace lint + test + build, nada
  más. Si alguna vez se agrega, tiene que ser con una allowlist que permita explícitamente
  GHSA-qwww-vcr4-c8h2 — si no, CI queda en rojo permanente por un advisory que no aplica,
  y un CI que siempre falla es un CI que nadie mira.

## Importación de archivos Excel

`src/lib/importArchivo.ts` valida todo archivo antes de pasarlo al parser: tamaño máximo
(10 MB), extensión contra las que cada pantalla realmente soporta (Clientes e Inventario
`.xlsx`/`.xls`, Equipos también `.csv`, Historial solo `.xlsx`), firma binaria del
contenido, y tope de filas (20.000) y hojas (20) ya parseado.

Se valida la **firma binaria** y no el MIME del navegador: el MIME de un `.xlsx` es
inconsistente entre navegadores y sistemas —a veces llega vacío—, así que como filtro duro
rechazaría archivos legítimos. Un `.xlsx` es un ZIP (`50 4B`) y un `.xls` es OLE2
(`D0 CF 11 E0`); eso detecta un archivo renombrado, que la extensión sola no ve.

Ojo: el `accept` del `<input type="file">` es solo una sugerencia de UI — no frena un
drag&drop ni a quien elija "todos los archivos" en el diálogo. Por eso la validación va en
el código, y en Equipos vive dentro de `procesarExcel()`, que es por donde entran tanto el
input como el drag&drop.

## Estructura

- `src/modules/` — un módulo por área de negocio (ventas, taller, inventario, compras,
  contabilidad, cotizaciones, pixitadmin, config).
- `src/lib/queries.ts` — todos los hooks de datos (TanStack Query) y las llamadas a
  Supabase/RPCs. Es el archivo más grande del proyecto a propósito: mantiene el acceso a
  datos centralizado en un solo lugar en vez de disperso por los módulos.
- `public/*.html` — páginas standalone servidas fuera del bundle de React (fotos de OT por
  QR, aprobación de presupuesto por link, vista pública de cotización) — se acceden sin
  sesión, por token.
