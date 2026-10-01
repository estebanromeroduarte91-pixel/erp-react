# Conclusión conjunta: rentabilidad profesional por sucursal

Fecha: 28-09-2026

Documentos considerados:

- `PLAN_RENTABILIDAD_POR_SUCURSAL.md`
- `docs/rentabilidad-por-sucursal-revision.md`
- verificación adicional del código vigente de Pixit

## Veredicto

**APROBAR CON CAMBIOS.**

Pixit tiene una base suficiente para construir un módulo profesional sin rehacer el ERP. No se debe crear un tercer cálculo paralelo. El trabajo correcto es asegurar permisos y calidad de datos, y después extender la fuente SQL existente hasta convertirla en la única fuente de rentabilidad.

## Hallazgos aceptados

Se confirman en código:

1. `VistaGeneralBI` suma en algunos lugares el monto bruto del gasto, mientras `calcularResumenOperacional()` descuenta el neto cuando existe crédito fiscal.
2. Al filtrar una sucursal, `VistaGeneralBI` excluye gastos generales en vez de asignar la parte correspondiente.
3. El cálculo de utilidad por sucursal usa gasto bruto, aunque el consolidado puede usar gasto neto. La suma de sucursales puede no cuadrar con el total.
4. `fn_reporte_sucursales` ya entrega venta neta, costo y margen bruto por sucursal. Conviene extenderla o crear una RPC hermana que reutilice su criterio, no empezar otro motor desde cero.
5. Las líneas históricas sin `costo_total` usan el precio de compra actual como respaldo. Esas cifras son estimaciones y pueden cambiar al editar el catálogo.
6. `fn_puede_ver_estadisticas()` depende de configuraciones guardadas en `erp_data` (`cargos`, `ucfg_*`, `user_cargo_map`). Un usuario activo puede escribir claves de su empresa por API si la policy no discrimina rol.
7. El guardado actual de usuario/cargo hace varias escrituras independientes y puede quedar parcialmente aplicado.
8. La fecha del reporte debe normalizarse: `ventas.fecha` debe ser la fecha operacional oficial; `fecha_creacion` queda para auditoría técnica del momento de inserción.

Las cifras de producción citadas por la revisión de Claude —164 gastos, cero generales, cero con crédito fiscal y montos asignados a sucursales— no fueron reproducidas nuevamente durante esta conciliación. Se aceptan como evidencia aportada por esa revisión, pero deben incluirse en la consulta de diagnóstico del Sprint de datos.

## Precisión técnica sobre RLS

La revisión afirma que una policy adicional no podría bloquear porque las policies se combinan con `OR`. Eso es correcto para policies permisivas, pero PostgreSQL también admite policies `AS RESTRICTIVE`, que se combinan con `AND` respecto del resultado permisivo.

Por tanto, hay dos capas recomendadas:

1. policies restrictivas para impedir escritura directa sobre claves protegidas;
2. una RPC transaccional `SECURITY DEFINER` para que un administrador gestione cargos y usuarios de forma atómica.

No basta con esconder la pantalla en el frontend.

## Modelo financiero aprobado para el MVP

```text
Ventas netas
− costo vendido
= Margen bruto

Margen bruto
− costos variables
= Margen de contribución

Margen de contribución
− gastos fijos de la tienda
= Resultado de cuatro paredes

Resultado de cuatro paredes
− gastos corporativos asignados
= Resultado completo
```

Se posterga separar “resultado controlable” y “EBITDA local” hasta que gerencia defina formalmente qué costos controla un encargado.

El indicador principal para evaluar al encargado será **resultado de cuatro paredes**. El resultado completo servirá para decisiones corporativas sobre apertura, continuidad o cierre de tiendas.

## Orden definitivo de implementación

### Sprint 0 — Seguridad y permisos

Bloqueante antes de publicar información de sueldos, costos y márgenes.

1. Proteger escrituras de `erp_data` para:
   - `cargos`;
   - `user_cargo_map`;
   - claves `ucfg_*`;
   - cualquier otra clave que determine permisos.
2. Permitir gestión únicamente a:
   - administrador real de la empresa;
   - platform admin durante impersonación válida.
3. Crear una RPC transaccional para actualizar:
   - configuración individual;
   - mapa de cargos;
   - rol base en `user_profiles`.
4. Reemplazar en el frontend las escrituras múltiples de `useGuardarUserConfig()` por la RPC.
5. Probar:
   - vendedor/técnico rechazado por API;
   - administrador autorizado;
   - empresa A incapaz de tocar empresa B;
   - fallo intermedio sin estado parcial.

### Sprint 1 — Calidad y clasificación de datos

1. Crear configuración gerencial relacional de categorías.
2. Agregar en cada gasto un alcance explícito:
   - tienda;
   - corporativo/compartido.
3. Usar la categoría como valor predeterminado, pero permitir excepción por gasto con trazabilidad.
4. Reasignar correctamente los sueldos por empleado/sucursal.
5. Revisar el arriendo y otros gastos locales.
6. Configurar comisiones de medios de pago, empezando por GetNet.
7. Ejecutar diagnóstico de:
   - gastos sin sucursal;
   - gastos sin clasificación;
   - ventas sin sucursal;
   - líneas sin costo congelado;
   - gastos con IVA recuperable.
8. No modificar automáticamente importes históricos.

### Sprint 2 — Fuente única de rentabilidad

1. Extender `fn_reporte_sucursales` o crear una RPC hermana que reutilice la misma base.
2. Incorporar gastos directos y corporativos.
3. Aplicar gasto neto cuando exista crédito fiscal.
4. Aplicar reglas de distribución explícitas.
5. Devolver consolidado, sucursales, no asignado y calidad de datos.
6. Marcar como estimadas las líneas sin costo congelado.
7. Reemplazar cálculos de:
   - `VistaGeneralBI`;
   - Dashboard;
   - cualquier resumen equivalente.
8. Eliminar o dejar sin uso los cálculos duplicados solo después de reconciliar.

Condición obligatoria:

```text
Resultado consolidado
= suma de sucursales
+ resultado no asignado
± diferencia de redondeo documentada
```

### Sprint 3 — Pantalla gerencial

1. Cascada de cuatro niveles.
2. Comparación entre tiendas.
3. Punto de equilibrio.
4. Gastos directos versus prorrateados.
5. Rentabilidad de producto versus servicio/reparación.
6. Drill-down desde cada monto.
7. Alertas visibles de calidad de datos.
8. Comparación con periodo anterior.

### Sprint 4 — Automatización y cierre

1. Comisión de medio de pago automática.
2. Comisiones técnicas asociadas a operación y sucursal.
3. Delivery asociado a viaje/orden/sucursal.
4. Garantías y retrabajos cargados a la tienda de origen.
5. Mermas cargadas a la tienda donde se detectan.
6. Cierre mensual congelado.
7. Reapertura solo con permiso y auditoría.

## Decisiones gerenciales adoptadas como recomendación

| Tema | Decisión recomendada |
|---|---|
| Evaluación del encargado | Resultado de cuatro paredes |
| Sueldos | Costo empresa completo |
| Leyes sociales | Separadas pero incluidas en costo empresa |
| Garantías/retrabajos | Tienda que realizó la reparación |
| Mermas | Tienda donde se detectan |
| Comisión de medios de pago | Configurable por método y automática |
| Mes en curso | Cálculo en tiempo real |
| Mes cerrado | Congelado; reapertura auditada |
| Tipo de EBITDA | Gerencial, no contable/legal |
| Primera activación | Steve Docs; arquitectura configurable para todos |
| Fecha operacional de venta | `ventas.fecha` |
| `fecha_creacion` | Auditoría técnica, no periodo gerencial |

Estas decisiones deben ser confirmadas por gerencia antes del Sprint 1. Si se cambia alguna, el modelo de datos debe ajustarse antes de crear migraciones.

## Pruebas bloqueantes

1. Usuario sin permiso no puede leer estadísticas llamando directamente la RPC.
2. Usuario sin permiso no puede autoasignarse cargo o sucursal editando `erp_data`.
3. Empresa A no puede leer empresa B manipulando `p_empresa_id`.
4. Gasto con crédito fiscal afecta igual consolidado y sucursal.
5. Gasto general se distribuye y conserva trazabilidad de regla/base/monto.
6. Sucursal sin ventas pero con gasto no desaparece.
7. Venta del último día del mes cae en el periodo de `ventas.fecha`.
8. Línea sin costo congelado aparece como estimada.
9. Suma de sucursales + no asignado coincide con consolidado.
10. Guardado de permisos es atómico.

## Alcance fuera del MVP

- depreciación financiera detallada;
- impuesto a la renta;
- cierre contable legal;
- presupuesto versus real;
- forecasting;
- costeo por hora técnica;
- múltiples monedas;
- integración automática con contabilidad externa.

## Conclusión final

Se debe implementar, pero no comenzar por la pantalla.

El orden aprobado es:

```text
Seguridad → calidad de datos → fuente única SQL → pantalla → automatización/cierre
```

La primera tarea técnica es cerrar la escritura de permisos en `erp_data` y reemplazar el guardado múltiple de configuración de usuario por una RPC transaccional. La primera tarea gerencial es corregir la asignación real de sueldos, arriendos y comisiones por tienda.

Una vez cerradas ambas, el motor de rentabilidad puede construirse sobre datos y permisos confiables.

