# Plan de modularidad de Pixit

Fecha: 31 de octubre de 2026.

Estado: propuesta de ejecución. Este documento no activa módulos, cambia planes, ejecuta SQL ni modifica datos de las empresas.

**Objetivo:** ofrecer Pixit para comercios que necesitan ventas, caja, inventario y compras, sin Taller. Mantener una sola aplicación y conservar la operación de las empresas actuales.

**Prioridad:** continuidad del servicio e integridad de datos antes que velocidad de publicación. No es posible garantizar riesgo cero; cada etapa debe aportar evidencia, una condición de avance y un procedimiento de reversión.

## 1. Alcance de la primera versión

La primera versión permitirá crear una empresa de demostración con perfil Comercio, sin Taller. No intentará convertir todos los módulos en complementos independientes a la vez.

| Perfil | Comportamiento propuesto |
|---|---|
| Empresa existente | Mantiene sus funciones y restricciones actuales, incluidos su plan, permisos, sucursales y estado de Delivery. No se le asigna un perfil nuevo automáticamente. |
| Comercio nuevo | Ventas/POS, caja, inventario, clientes, proveedores, compras y estadísticas comerciales según su configuración comercial explícita; sin Taller. |
| Servicio técnico nuevo | Funciones comerciales y Taller, según su configuración comercial explícita. |

Los perfiles son plantillas de configuración. No son planes de cobro nuevos ni autorización para alterar Starter, Pro o Scale de los clientes actuales.

Quedan fuera del primer alcance: una tienda de complementos, cobro automático por módulo, separar servicios o repositorios, migrar empresas reales a Comercio y convertir Delivery de reparaciones en despacho comercial.

## 2. Hallazgos confirmados en el código

| Punto | Evidencia | Riesgo que debe cubrirse |
|---|---|---|
| Configuración por empresa parcialmente existente | `empresa_modulos` y `useDeliveryHabilitado` | La restricción SQL actual solo admite `delivery`. Extenderla necesita una migración compatible; no basta con guardar otras claves. |
| Planes orientados al taller | `PLAN_MODULES` incluye Taller en Starter, pero no POS | Aplicar un perfil Comercio usando esa lista sin adaptación podría dejarlo sin ventas o activar Taller en una prueba. |
| Navegación con destino fijo | Hay redirecciones a `/taller` en rutas alternativas y validaciones | Una empresa sin Taller podría caer en una pantalla bloqueada o en un bucle. |
| POS conectado con órdenes | `POSTab` usa `useOrdenesLite` | Esconder el menú Taller no evita que el POS consulte sus datos o dependa de sus permisos. |
| Alta de empresas especializada | `bootstrapEmpresaDesdeMetadata` carga `EQUIPOS_SEED` | Comercio no debe recibir un catálogo inicial de equipos de reparación. |
| Recorrido inicial especializado | Registro y guía incluyen textos y pasos de Taller | La experiencia de un comercio seguiría pareciendo un servicio técnico. |
| Delivery depende de Taller | Ruta, permisos y datos están vinculados a reparaciones | No ofrecerlo como despacho comercial independiente sin revisar ese flujo. |
| Pruebas de navegador limitadas | Las pruebas actuales cubren páginas públicas; no operaciones autenticadas | Hace falta un entorno aislado con usuarios y operaciones de prueba antes de desplegar controles nuevos. |
| Dependencias de base y código | Existe `scripts/verificar-rpc.mjs` por un incidente previo de despliegue | Nunca publicar un frontend que requiera una función que aún no esté instalada y verificada. |

Esta revisión inicial no sustituye el inventario completo de consultas, funciones SQL, políticas y tareas programadas de la etapa 0. No se ha inspeccionado la configuración vigente de producción.

## 3. Reglas que no se negocian durante la ejecución

1. No eliminar tablas, campos, registros ni historial para ocultar un módulo.
2. No reescribir las funciones de stock, ventas, recepción de compras, FIFO, boletas o comisiones como parte de una refactorización general.
3. Los cambios imprescindibles en esos flujos serán pequeños, separados y con pruebas específicas.
4. No cambiar a todas las empresas a la vez. Activación explícita por empresa y avance por etapas.
5. La ausencia de configuración en una empresa antigua conserva su comportamiento anterior; no significa «activar todo» ni omitir restricciones de su plan.
6. Una empresa nueva tendrá configuración completa antes de operar. Una configuración incompleta no se tratará como empresa antigua.
7. Mientras se carga la configuración no se mostrará temporalmente Taller ni se enviarán consultas a módulos no habilitados.
8. Un fallo de lectura no equivale a módulo desactivado ni a empresa antigua. Se mostrará un error recuperable. Los flujos anteriores seguirán disponibles únicamente para empresas cuya modalidad anterior esté identificada de forma fiable.
9. Activar o desactivar módulos corresponde a Panel Pixit y a funciones del servidor autorizadas; el administrador de una empresa no puede autoasignarse complementos.
10. Las pruebas no crearán ventas, compras, pagos ni mensajes reales de clientes.

## 4. Modelo de acceso propuesto

La autorización efectiva debe combinar:

**Empresa activa + módulo habilitado para esa empresa + condiciones del plan + permiso del usuario + alcance de sucursal.**

- Tener un cargo de administrador no habilita por sí mismo un módulo no contratado.
- Un perfil no sustituye los permisos de cargos ni la separación por empresa.
- El perfil Comercio debe incluir una configuración de POS válida; no se cambiará el Starter histórico para conseguirlo.
- Los períodos de prueba respetarán el perfil elegido: una prueba comercial no encenderá Taller automáticamente.
- El administrador de Pixit conserva el acceso a Panel Pixit. La impersonación debe identificar la empresa destino y no ejecutar por accidente operaciones en su empresa propia.
- La misma decisión debe proteger menú, rutas, consultas, funciones SQL y otros puntos de entrada. No se considerará suficiente una validación en React.

Se evaluará extender `empresa_modulos`, ya existente, en vez de crear un sistema paralelo. La decisión final debe documentar valores permitidos, modalidad anterior/nueva, versión de configuración y autoridad de escritura.

Para la primera versión basta con resolver Taller activado/desactivado dentro de una configuración comercial completa. La independencia de los demás módulos se habilitará progresivamente.

## 5. Etapas y condiciones de avance

### Etapa 0 — Diagnóstico completo y punto de recuperación

- [ ] Identificar el código y las migraciones realmente publicados; no asumir que coinciden con el repositorio.
- [ ] Registrar el estado de compilación, lint y pruebas. Resolver o separar los errores previos sin mezclarlos con la modularidad.
- [ ] Inventariar accesos a Taller desde POS, caja, dashboard, estadísticas, búsqueda, clientes, cotizaciones, mensajes, configuración, guías y enlaces públicos.
- [ ] Revisar en Supabase las funciones, políticas y tareas que necesitan conocer el módulo habilitado.
- [ ] Obtener una fotografía de funciones y restricciones efectivas por empresa, sin guardar secretos en el repositorio.
- [ ] Verificar respaldo y procedimiento de recuperación en un entorno separado. Registrar qué se puede restaurar y con qué alcance.
- [ ] Identificar la última versión estable de la aplicación que puede volver a publicarse.

**Avance:** mapa de dependencias revisado, diferencias entre código y producción conocidas, respaldos y recuperación comprobados. Todavía no se cambia la configuración de clientes.

### Etapa 1 — Entorno de pruebas independiente

- [ ] Crear un entorno con base de datos y credenciales propios. Sin conexión operativa a producción.
- [ ] Usar datos ficticios o anonimizados; credenciales y tokens reales no se copian.
- [ ] Bloquear emisiones fiscales, envíos reales de correo/WhatsApp, cobros y sincronizaciones externas. Usar sustitutos o entornos de prueba.
- [ ] Preparar empresas que representen: operación anterior con Taller, Comercio sin Taller y diferentes planes y estados de suscripción.
- [ ] Preparar usuarios: administrador, encargado con sucursal, técnico, vendedor, cargo personalizado y administrador de plataforma.
- [ ] Automatizar pruebas autenticadas sobre las operaciones críticas.

**Avance:** se puede vender, recibir una compra y abrir una orden ficticia sin afectar clientes ni proveedores externos.

### Etapa 2 — Configuración central, sin cambiar la experiencia actual

- [ ] Incorporar el catálogo de capacidades, las dependencias y la configuración por empresa mediante migraciones aditivas.
- [ ] Mantener intacta la configuración actual de Delivery y los controles existentes de plan.
- [ ] Implementar el cálculo central de acceso y la transición explícita entre modalidad anterior y modular.
- [ ] Comparar el resultado anterior y el nuevo en modo de comprobación, sin que la decisión nueva bloquee operaciones.
- [ ] Probar todos los planes y permisos, incluida la expiración del trial y los cambios de sucursal o empresa.
- [ ] Validar que una configuración incompleta o una lectura fallida no bloquee en masa a las empresas antiguas ni abra acceso indebido.

**Avance:** las empresas representadas por la modalidad anterior obtienen los mismos accesos efectivos que antes. No se aplicó una reconfiguración masiva.

### Etapa 3 — Navegación y experiencia de Comercio

- [ ] Resolver el inicio y los enlaces inválidos hacia una ruta disponible para el usuario; nunca redirigir a Taller por defecto si está deshabilitado.
- [ ] Filtrar menú, guías, búsqueda, notificaciones y configuración por capacidades.
- [ ] Separar del POS la consulta y el cobro de órdenes. La venta comercial debe funcionar sin consultar Taller.
- [ ] Adaptar dashboard y estadísticas: ocultar indicadores específicos de reparación y conservar las métricas comerciales correctas.
- [ ] Mantener los servicios y la facturación comercial que no dependen de una reparación.
- [ ] No cargar equipos de reparación al registrar Comercio. Usar textos neutrales donde corresponda.
- [ ] Revisar cotizaciones y kits/combos para que sus funciones comerciales no dependan de Taller.
- [ ] Gestionar carga y errores sin pantallas en blanco y sin saltos a módulos desactivados.

**Avance:** una empresa comercial de prueba completa la jornada de venta, inventario y caja sin ver ni consultar Taller. Una empresa con Taller mantiene los mismos flujos.

### Etapa 4 — Protección y comprobación en el servidor

- [ ] Instalar y verificar las funciones nuevas antes de publicar código que las requiera. Conservar las firmas antiguas mientras sigan utilizándose.
- [ ] Aplicar la autorización modular en los puntos de entrada identificados: tablas/políticas cuando corresponda, funciones, servicios, trabajos y rutas públicas.
- [ ] Preservar explícitamente el comportamiento anterior para empresas no migradas.
- [ ] Probar llamadas directas con un usuario autenticado, sin depender del menú o del navegador.
- [ ] Probar aislamiento entre empresas y sucursales; una llamada con otro `empresa_id` no debe conceder acceso.
- [ ] Coordinar cambios de permisos, caché y servidor para que ninguna publicación intermedia deje la aplicación y la base en desacuerdo.

**Avance:** la empresa comercial no puede crear ni consultar datos de Taller por accesos directos, y puede operar ventas e inventario. El conjunto de pruebas anterior sigue pasando.

### Etapa 5 — Panel Pixit y altas nuevas

- [ ] Añadir la selección de perfil y la activación de módulos desde Panel Pixit, con resumen de dependencias y registro de cambios.
- [ ] Crear las empresas nuevas con perfil, condiciones comerciales, límites y configuración completos en una operación consistente.
- [ ] No permitir que un formulario de registro elija libremente módulos pagados o límites del plan.
- [ ] No desactivar Taller de una empresa operativa con órdenes pendientes, sin una revisión específica de sus procesos en curso.
- [ ] Definir el acceso autorizado al historial después de una desactivación; conservar el registro contable de operaciones ya realizadas.
- [ ] Comprobar que reactivar un módulo recupera su información, sin duplicar datos iniciales.

**Avance:** se puede crear Comercio desde el flujo previsto sin SQL manual por cada cliente y sin cambiar las empresas existentes.

### Etapa 6 — Piloto controlado y publicación

- [ ] Ejecutar primero el piloto con una empresa interna sin operaciones reales de clientes.
- [ ] Publicar el código compatible con las migraciones ya verificadas, manteniendo las empresas existentes en su modalidad anterior.
- [ ] Comprobar que una pestaña abierta con la versión anterior sigue funcionando durante la transición.
- [ ] Verificar en producción, mediante comprobaciones de lectura, el acceso, la configuración y las versiones de las funciones instaladas.
- [ ] Observar errores por empresa, fallos de funciones, latencia de acceso y diferencias entre stock y lotes. Definir responsables y ventanas de seguimiento.
- [ ] Aprobar explícitamente el primer cliente comercial después de la prueba completa. No usar Steve Docs o Terramóvil como experimento de desactivación.

**Avance:** piloto validado, sin fallos críticos pendientes y con reversión disponible. Solo entonces ofrecer el perfil a nuevos clientes.

### Etapa 7 — Modularización adicional

- [ ] Separar gradualmente otros complementos según necesidades comerciales reales.
- [ ] Definir precios y condiciones de contratación en un trabajo comercial separado.
- [ ] Migrar clientes existentes únicamente con revisión individual y conservación de sus derechos actuales.
- [ ] Retirar compatibilidad antigua solo cuando ya no existan empresas ni versiones activas que la necesiten.

## 6. Matriz mínima de pruebas

Cada caso debe ejecutarse para una empresa representativa de la modalidad anterior y para Comercio cuando corresponda.

| Flujo | Evidencia requerida |
|---|---|
| Inicio de sesión y recuperación | Administrador y empleados entran al destino correcto; las restricciones de suspensión y vencimiento siguen funcionando. |
| Venta comercial | Pago único y dividido, stock correcto por sucursal, lote y movimiento correspondientes; cancelar/anular no duplica ajustes. |
| Caja | Apertura, venta y cierre mantienen los totales y el desglose por método de pago. |
| Compras | Crear, recibir parcialmente, completar y editar mantiene cantidades, costos y stock en origen/destino. |
| Inventario | Importar, editar, trasladar y contar no depende de Taller ni cambia el stock accidentalmente. |
| Taller existente | Ingresar orden, recibir aprobación, asociar repuestos, cobrar, entregar y pagar comisión sigue funcionando. |
| Comisiones | Administrador gestiona; encargado consulta su sucursal; técnico consulta sus comisiones. |
| Documentos y mensajes | Los servicios compartidos mantienen su comportamiento; los enlaces públicos vigentes de clientes actuales no se rompen. |
| Estadísticas y contabilidad | Totales comerciales y asientos coinciden; no desaparecen operaciones históricas por ocultar un módulo. |
| Permisos | Probar plan, cargo, sucursal, empresa, trial, acceso directo e impersonación. |
| Configuración | Lectura lenta, error de red, configuración faltante, cambio de empresa y sesión antigua no producen accesos incorrectos. |
| Módulos | Desactivar conserva datos; reactivar no reinicia ni duplica información. |

La ausencia de Taller no justifica quitar movimientos comerciales de los informes. La facturación y los indicadores deben seguir reconciliando con las operaciones registradas.

## 7. Publicación y reversión

**Orden por entrega:** respaldo verificado → migración compatible → comprobación de funciones/firmas/permisos → código compatible → habilitación de la empresa piloto → comprobaciones y seguimiento.

No combinar en la misma entrega la retirada de interfaces antiguas y la activación general del sistema nuevo.

| Incidente | Acción prevista |
|---|---|
| Falla visual o de navegación nueva | Volver al código estable y retirar la activación piloto, conservando las extensiones de base que sean compatibles. |
| Acceso bloqueado incorrectamente | Revertir conjuntamente la activación de la empresa y los controles nuevos que dependan de ella. No asumir que volver al frontend deshace una política SQL. |
| Problema de datos o stock | Detener el flujo afectado, revisar auditoría y aplicar una corrección específica. No restaurar toda producción encima de ventas posteriores válidas. |
| Migración incompleta | No publicar el frontend que la necesita. Revertir la transacción o corregir la migración después de verificar su estado. |
| Configuración incorrecta de un cliente nuevo | Recuperar su configuración anterior registrada, sin convertirlo en empresa antigua para saltarse controles. |

Cada entrega debe guardar su versión de código, SQL aplicado, comprobaciones, configuración anterior y pasos concretos de reversión. Se probarán antes del piloto. Si una etapa no cumple su condición de avance, no se habilita en la siguiente empresa.

## 8. Entregables de cada etapa

1. Cambio acotado y revisable, con sus archivos y migraciones identificados.
2. Evidencia de pruebas y limitaciones conocidas.
3. Confirmación del estado de base de datos necesario para ese cambio.
4. Instrucciones de publicación y reversión.
5. Registro del resultado del piloto y decisión de avanzar o corregir.

Cuando Esteban deba ejecutar SQL manualmente, se entregará completo en el chat, con orden de ejecución y sin secretos. Este plan no requiere ejecutar SQL ahora.

## 9. Archivos iniciales de referencia

- [Planes y acceso por módulo](/Users/estebanromero/erp-react/src/lib/queries/usePlanLimits.ts)
- [Rutas de la aplicación](/Users/estebanromero/erp-react/src/App.tsx)
- [Menú lateral](/Users/estebanromero/erp-react/src/components/layout/Sidebar.tsx)
- [Alta y sesión de la empresa](/Users/estebanromero/erp-react/src/context/AuthContext.tsx)
- [Punto de venta](/Users/estebanromero/erp-react/src/modules/ventas/POSTab.tsx)
- [Configuración actual de Delivery](/Users/estebanromero/erp-react/src/modules/delivery/deliveryQueries.ts)
- [Tabla actual de módulos](/Users/estebanromero/erp-react/supabase/migrations/20260916193000_modulo_delivery.sql)
- [Verificación de funciones SQL](/Users/estebanromero/erp-react/scripts/verificar-rpc.mjs)
- [Pruebas de navegador actuales](/Users/estebanromero/erp-react/e2e/humo.spec.ts)

**Primer paso al ejecutar el plan:** completar la etapa 0. La creación del documento no significa que las etapas de respaldo, pruebas autenticadas, migración o piloto ya estén realizadas.
