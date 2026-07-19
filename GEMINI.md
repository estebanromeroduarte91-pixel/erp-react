# Contexto del proyecto — erp-react (Pixit)

ERP multi-tenant vendido como producto (SaaS). Este repo es la migración a React del ERP original (que vivía como un único `index.html` monolítico en el repo `modulo-compras`). La migración es módulo por módulo.

## Stack
- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Supabase (Postgres + Auth + Realtime + Storage) como backend
- @tanstack/react-query, @tanstack/react-table, react-hook-form, zod, recharts
- Deploy: Netlify, dominio `pixit.cl` (DNS gestionado en Cloudflare, en modo gris/DNS-only — no proxy naranja)

## Arquitectura de datos
- La app YA NO usa un blob JSON tipo key-value (`erp_data`) para las entidades principales. `productos`, `ventas`, `ordenes`, `gastos`, `ocs` (órdenes de compra), `clientes` y `lotes_inventario` son tablas relacionales reales con RLS por `empresa_id` (multi-tenant).
- Ajustes de stock pasan por una función atómica (`fn_ajustar_stock`) en vez de escrituras directas.
- Existe panel super-admin en `/pixit-admin` (tabla `platform_admins`).

## Reglas del proyecto (importantes, no obvias)
1. **Roles**: cualquier cambio de UI debe aplicar igual a los tres roles (encargado, vendedora, super admin). No agregar gating por rol salvo que se pida explícitamente.
2. **Realtime**: los hooks de Supabase Realtime necesitan nombres de canal únicos (usar `useId()` de React). Si dos componentes montan el mismo nombre de canal, la app crashea con pantalla en blanco.
3. **Git**: los commits y el push los hace el dueño del proyecto manualmente. No hacer `git commit` / `git push` automáticamente salvo que se pida explícitamente.
4. **Validar antes de dar por cerrado un cambio**: correr `npm run build` (tsc -b + vite build) y `npm run lint`.

## Pendientes conocidos (a la fecha 2026-07-19)
- Fase 2: integración de Mercado Pago — no iniciada.
- Confirmar si Pablo (colaborador) ya tiene acceso al repo en GitHub.
- Limpiar órdenes de prueba en producción (`#3699` y un `#3702` duplicado, empresa real `f347f086-…`) — **no tocar** el `#3702` legítimo de "Cristobal Subiare".

## Cómo trabajar en este repo
- `npm run dev` para levantar el servidor local.
- No introducir abstracciones ni refactors fuera del alcance de la tarea pedida.
- Preferir editar archivos existentes a crear nuevos.
