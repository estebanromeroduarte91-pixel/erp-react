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

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) corre lint + typecheck + build en
cada push a `main` y en cada Pull Request. Es un complemento al build que ya hace Cloudflare
Pages en cada deploy (que también falla si hay errores de TypeScript) — corre más rápido y
además valida ESLint, que el deploy de Cloudflare no revisa.

## Estructura

- `src/modules/` — un módulo por área de negocio (ventas, taller, inventario, compras,
  contabilidad, cotizaciones, pixitadmin, config).
- `src/lib/queries.ts` — todos los hooks de datos (TanStack Query) y las llamadas a
  Supabase/RPCs. Es el archivo más grande del proyecto a propósito: mantiene el acceso a
  datos centralizado en un solo lugar en vez de disperso por los módulos.
- `public/*.html` — páginas standalone servidas fuera del bundle de React (fotos de OT por
  QR, aprobación de presupuesto por link, vista pública de cotización) — se acceden sin
  sesión, por token.
