# Auditoría técnica de Pixit ERP

Fecha: 25-09-2026  
Alcance: repositorio `erp-react`, migraciones y Edge Functions incluidas, configuración de build/CI y comprobaciones de solo lectura sobre Supabase de producción.

## 1. Resumen ejecutivo

Pixit compila, pasa su suite automatizada y tiene buenas bases en los flujos de inventario más delicados: confirmación/anulación de ventas, recepción de compras, conteos, traslados, comisiones y webhooks WooCommerce usan funciones SQL transaccionales o mecanismos idempotentes. La separación entre empresas está aplicada de forma consistente mediante `empresa_id` y RLS en las tablas principales.

La auditoría no permite afirmar todavía que el sistema esté completamente listo para escalar sin riesgo. Los principales pendientes son autorización dentro de una empresa (roles y sucursales), concurrencia del cierre de caja, idempotencia del POS ante pérdida de respuesta, configuración de permisos no atómica y falta de pruebas autenticadas multi-tenant. También existe una advertencia operativa visible de cuota/grace period en Supabase que debe resolverse antes de depender del sistema en producción.

No se hicieron escrituras ni pruebas destructivas sobre producción.

## 2. Arquitectura detectada

- Frontend: React 19, TypeScript, Vite, Tailwind, React Router y TanStack Query.
- Backend: Supabase Postgres, Auth, Storage, Realtime y Edge Functions Deno.
- Acceso a datos: cliente Supabase directo desde el navegador; operaciones sensibles mediante RPC SQL y Edge Functions.
- Multi-tenancy: columna `empresa_id`, RLS y funciones `mi_empresa_id()`/`is_platform_admin()`.
- Datos: tablas relacionales para ventas, inventario, órdenes, WooCommerce y delivery; `erp_data` conserva configuraciones y algunos agregados JSON heredados.
- Integraciones: WooCommerce, Resend/SMTP, Anthropic, Web Push y emisión/impresión DTE.
- Despliegue: frontend en Cloudflare Pages; GitHub Actions ejecuta lint, tests, build y smoke E2E. Las Edge Functions y migraciones Supabase no se despliegan desde ese workflow.
- Observabilidad: registro de errores en la aplicación, logs de Edge Functions y `email_log`; no hay trazas distribuidas ni sourcemaps de producción verificadas.

## 3. Hallazgos por severidad

| Severidad | Cantidad | Corregidos en esta auditoría | Pendientes/mitigación parcial |
|---|---:|---:|---:|
| P0 crítico | 0 confirmados | 0 | Aislamiento dinámico A/B no verificado |
| P1 alto | 9 | 2 completos, 2 parciales | 5 |
| P2 medio | 9 | 2 | 7 |
| P3 bajo | 1 | 0 | 1 |

Que no exista un P0 confirmado no garantiza su ausencia: faltan cuentas de prueba segregadas para ejecutar IDOR/BOLA dinámico sin tocar datos reales.

## 4. Hallazgos P1

### P1-01 — Autorización interna depende demasiado del frontend

- Evidencia: varias rutas solo se ocultan en el menú; muchas policies de tablas permiten `ALL` a cualquier usuario activo de la empresa. Los permisos de cargos se evalúan principalmente en UI.
- Impacto: un vendedor/técnico podría llamar directamente tablas o abrir rutas de otro rol dentro de su misma empresa. La restricción por sucursal tampoco está aplicada de forma uniforme en backend.
- Estado: pendiente. Requiere una matriz formal de permisos y policies/RPC por recurso; cambiarla masivamente sin cuentas de prueba sería riesgoso.

### P1-02 — Suscripción pagada vencida no bloqueaba el sistema

- Causa: UI y `mi_empresa_id()` contemplaban trial/suspensión, pero no `suscripcion_termina` para planes activos.
- Corrección: bloqueo en React y migración para hacerlo efectivo también en RLS/RPC. Los perfiles desactivados también quedan excluidos por `mi_empresa_id()`.
- Archivos: `src/lib/suscripcion.ts`, `src/context/AuthContext.tsx`, `src/App.tsx`, `src/modules/auth/TrialExpirado.tsx` y migración de auditoría.
- Prueba: `src/lib/suscripcion.test.ts`.
- Estado: código listo; la parte de base queda pendiente de ejecutar.

### P1-03 — Caja usa read-modify-write de un arreglo JSON compartido

- Evidencia: sesiones de caja se leen y reescriben como colección completa en `erp_data` desde POS/Caja.
- Impacto: dos usuarios pueden abrir/cerrar simultáneamente y pisar cambios.
- Estado: pendiente. Debe migrarse a filas relacionales y RPC transaccionales con bloqueo.

### P1-04 — Reintento del POS no tiene clave de idempotencia estable

- Evidencia: cada intento genera un nuevo folio/ID. La transacción SQL es atómica, pero si se pierde la respuesta después del commit, reintentar puede crear otra venta.
- Estado: pendiente. Agregar `idempotency_key` estable generado antes de enviar, con `UNIQUE (empresa_id, idempotency_key)`.

### P1-05 — Eliminación de productos podía dejar inventario huérfano

- Evidencia en producción: 7 lotes sin producto, todos con saldo positivo; total 30 unidades.
- Corrección: trigger que impide borrar productos con stock/lotes pendientes y limpia referencias con saldo cero.
- Estado: prevención lista en migración. Los 7 lotes existentes requieren conciliación manual; no se borraron ni alteraron.

### P1-06 — Guardado de permisos/configuración de usuario no es atómico

- Evidencia: se escriben por separado `ucfg_user`, `user_cargo_map` y rol.
- Impacto: fallo o concurrencia intermedia puede dejar permisos desalineados.
- Estado: pendiente. Unificar en una RPC transaccional.

### P1-07 — Sincronización manual WooCommerce procesaba cola global

- Causa: `woo-push` autorizaba a cualquier perfil válido y llamaba `fn_woo_pendientes` sin filtrar empresa.
- Corrección: el frontend envía la empresa actual; la Edge Function la valida (incluida impersonación de platform admin y vigencia del plan); la RPC nueva filtra por empresa. El cron conserva procesamiento global.
- Estado: código y SQL listos; se deben desplegar en el orden indicado.

### P1-08 — Endpoints con costo/efecto externo tienen autorización insuficiente

- Afectados: `ai-query`, `manage-domain`, `send-email`, `send-push-notification`, `woo-orders-pull`.
- Riesgo: consumo de APIs pagadas o acciones administrativas por usuarios autenticados con un rol no previsto. Parte de ellos valida empresa, pero no siempre estado activo, rol o rate limit.
- Estado: pendiente; se necesita definir qué cargos pueden ejecutar cada acción antes de endurecerlos sin romper flujos.

### P1-09 — Riesgo operacional por cuota de Supabase

- Evidencia: consola mostró “Grace period is over” y advertencia de interrupción al agotar cuota.
- Estado: pendiente; porcentaje y fecha exacta no fueron verificables desde el repositorio. Debe revisarse facturación/usage antes del lanzamiento.

## 5. Hallazgos P2/P3

1. P2 — 19 grupos de SKU duplicados (19 filas extra). Ninguno estaba marcado `vender_online`, pero impiden una restricción única y pueden volver ambiguo WooCommerce.
2. P2 — XSS almacenado en el resaltado de enlaces de Kits mediante `dangerouslySetInnerHTML`. Corregido con render React escapado y prueba de regresión.
3. P2 — SSRF en `dte-imprimir`: descargaba `logoUrl` editable por tenant. Corregido limitando host/ruta, HTTPS, tipo y 2 MB.
4. P2 — Invitaciones sin expiración y consumo no atómico; un fallo al crear perfil puede dejar usuario Auth huérfano.
5. P2 — Valores dinámicos de plantillas de correo no se escapan de forma sistemática; riesgo de HTML inyectado en emails.
6. P2 — Páginas públicas cargan librerías CDN por rango mayor y sin SRI/CSP comprobado.
7. P2 — `npm audit`: 5 vulnerabilidades transitivas de tooling (2 high, 3 moderate: browserslist, nanoid, vitest/mocker y baseline-browser-mapping). No se hizo upgrade masivo.
8. P2 — Migraciones divididas entre scripts históricos/manuales y carpeta `migrations`; existe riesgo de drift entre entornos.
9. P2 — Bundle principal ~763 kB minificado (~195 kB gzip) y XLSX ~493 kB; advertencia del build y costo de carga.
10. P3 — Observabilidad: algunos errores llegan como `[object Object]`; no se verificaron sourcemaps/trazas de producción.

## 6. Integridad y datos observados

Consultas de solo lectura realizadas en producción:

- ítems de venta huérfanos: 0;
- stock sin producto: 0;
- ventas pagadas sin ítems: 0;
- números de venta/orden duplicados por empresa: 0;
- RUT normalizado duplicado por empresa: 0;
- lotes negativos: 0;
- lotes huérfanos: 7, con 30 unidades en total;
- grupos de SKU duplicados: 19;
- filas de stock negativo: 63.

El stock negativo no se clasificó automáticamente como defecto porque el producto permite ventas sin stock por configuración. Debe revisarse por empresa/sucursal para distinguir operación permitida de inventario desajustado.

## 7. Operaciones críticas revisadas

- `fn_confirmar_venta`: locks, validaciones, stock/lotes FIFO, venta, ítems y movimiento en una transacción.
- `fn_anular_venta`: idempotente, restaura stock/lotes y bloquea casos incompatibles con comisión pagada.
- Recepción de OC, traslado, conteo y ajuste manual: RPCs transaccionales.
- Pago de comisión: lock de orden y gasto con ID determinista.
- Woo webhook: verificación HMAC y aplicación idempotente por pedido/línea.
- DTE: se ejecuta después de guardar venta; si falla, la venta permanece y el error se informa. Es una decisión de resiliencia, no atomicidad total.

## 8. Pruebas y comandos ejecutados

| Comprobación | Resultado |
|---|---|
| `npm run lint` | OK |
| `npm test -- --run` | 32 archivos, 249 tests, todos OK |
| `npm run build` | OK; advertencia de chunks grandes |
| `npm run test:e2e` | 6 smoke tests Chromium, todos OK |
| `git diff --check` | OK |
| `npm audit --json` | 5 hallazgos transitivos de tooling |
| Inspección SQL producción | Solo lectura; resultados indicados arriba |

Pruebas nuevas:

- `src/lib/suscripcion.test.ts`: vencimiento de plan pagado.
- `src/components/shared/HighlightText.test.tsx`: regresión de XSS almacenado.

No se ejecutaron pruebas autenticadas contra roles/tenants/sucursales reales ni pruebas de fallo de red con commit confirmado. Se marcan como **NO VERIFICADO**.

## 9. Matriz de flujos críticos

| Flujo | Testeado | Resultado | Test automático | Riesgo |
|---|---|---|---|---|
| Landing/login/páginas públicas | Sí, navegador | OK | Playwright smoke | Bajo |
| Login, refresh, recovery autenticado | Parcial | Revisión estática | Unitarios auxiliares | Medio; NO VERIFICADO dinámicamente |
| Aislamiento empresa A/B | Parcial | RLS consistente en estático | No | Alto; IDOR dinámico NO VERIFICADO |
| Permisos por cargo/sucursal | Parcial | Brecha confirmada | No | Alto |
| Venta POS + descuento de stock | Parcial | RPC atómica revisada | Unitarios de cálculos | Medio; integración DB NO VERIFICADA |
| Venta simultánea del último producto | Parcial | locks/validación presentes | No | Medio; carga concurrente NO VERIFICADA |
| Reintento tras perder respuesta POS | Sí, análisis | Falta idempotencia | No | Alto |
| Anulación/devolución | Parcial | RPC idempotente revisada | No | Medio |
| Traslado y conteo inventario | Parcial | RPCs atómicas revisadas | Unitarios auxiliares | Medio |
| Eliminación de producto con stock | Sí, estático | Guard listo | No DB local | Alto hasta aplicar SQL |
| Compra/recepción OC | Parcial | Transacción y lock presentes | No | Medio |
| Caja multiusuario | Sí, análisis | Race confirmada | No | Alto |
| Gastos/comisiones | Parcial | Comisión transaccional | Unitarios de lógica | Medio |
| Woo pedidos/webhook | Parcial | HMAC/idempotencia presentes | Tests de helpers | Medio |
| Woo push manual | Sí, estático | Corrección lista | Build/typecheck | Alto hasta desplegar SQL+función |
| Delivery | Parcial | Tokens y RLS revisados | Unitarios existentes | Medio |
| DTE/impresión | Parcial | Flujo resiliente; SSRF corregido | Build | Medio; proveedor real NO VERIFICADO |
| Emails/push | Parcial | Errores registrados | Unitarios de plantillas | Medio |
| KPIs dashboard vs DB real | No completo | NO VERIFICADO | No | Medio |

## 10. Recomendaciones antes del lanzamiento

1. Aplicar la migración de auditoría y desplegar `woo-push` y `dte-imprimir` en el orden documentado.
2. Conciliar manualmente los 7 lotes huérfanos y los 19 grupos de SKU duplicados antes de crear constraints.
3. Resolver el warning de cuota de Supabase.
4. Crear un entorno staging con al menos dos empresas, dos sucursales y todos los roles; ejecutar pruebas IDOR/BOLA y permisos vía API.
5. Migrar caja a tablas relacionales y RPC transaccional.
6. Incorporar idempotency key estable en POS.
7. Llevar la matriz de cargos/sucursales a RLS/RPC, no solo al menú.
8. Convertir invitaciones y guardado de permisos en operaciones transaccionales.
9. Añadir tests de integración Postgres para ventas simultáneas, anulaciones, traslados y expiración de planes.
10. Documentar y automatizar el despliegue/versionado de migraciones y Edge Functions.

## 11. Conclusión

Existe evidencia razonable de que el proyecto compila, los smoke públicos cargan y varias operaciones centrales son transaccionales. No existe todavía evidencia suficiente para garantizar permisos internos, aislamiento dinámico entre tenants y comportamiento de concurrencia de caja/POS. Esos puntos deben cerrarse antes de presentar el sistema como plenamente endurecido para múltiples clientes simultáneos.

