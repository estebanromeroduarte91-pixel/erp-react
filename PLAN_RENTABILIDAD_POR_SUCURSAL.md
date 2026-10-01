# Plan de implementación: rentabilidad profesional por sucursal en Pixit

## 1. Propósito del documento

Este documento propone cómo convertir los reportes actuales de Pixit en un sistema gerencial profesional para medir y comparar la rentabilidad de cada tienda.

Está preparado para una revisión conjunta con otro equipo o modelo técnico. La revisión debe confirmar o cuestionar:

- el diagnóstico del sistema actual;
- el modelo financiero propuesto;
- las reglas de asignación de gastos;
- la secuencia de implementación;
- los riesgos de integridad y comparabilidad;
- el alcance adecuado para una primera versión.

No se debe comenzar por diseñar un dashboard nuevo. Primero se debe conseguir una fuente única y reconciliable de cifras.

---

## 2. Objetivo de negocio

Pixit debe permitir responder, con datos trazables:

1. ¿Qué sucursal vende más?
2. ¿Qué sucursal genera más margen bruto?
3. ¿Qué sucursal aporta más dinero después de sus costos variables?
4. ¿Qué sucursal tiene mejor gestión de gastos controlables?
5. ¿Qué sucursal es rentable después de su estructura local?
6. ¿Qué sucursal sigue siendo rentable después de distribuir costos corporativos?
7. ¿Cuál es el punto de equilibrio de cada tienda?
8. ¿Qué productos, servicios, empleados y categorías explican el resultado?
9. ¿Qué parte del resultado proviene de datos directos y qué parte de prorrateos?
10. ¿Puede el total de las sucursales reconciliarse exactamente con el resultado consolidado?

---

## 3. Estado actual detectado en Pixit

### 3.1 Capacidades existentes

Pixit ya registra o calcula:

- ventas brutas y netas;
- IVA de ventas;
- ventas pagadas por periodo;
- sucursal de la venta;
- productos y servicios vendidos;
- costos históricos congelados por línea de venta;
- consumo de inventario con costeo FIFO;
- margen bruto por producto, categoría y sucursal;
- gastos relacionales por fecha y categoría;
- sucursal del gasto;
- subcategoría o persona asociada al gasto;
- monto neto e IVA recuperable en gastos clasificados;
- gastos generales o compartidos;
- distribución de gastos generales según participación en ventas;
- ticket promedio;
- comparaciones contra periodos anteriores;
- reportes de ventas, productos, categorías y sucursales.

### 3.2 Código relevante existente

- `src/lib/metricas.ts`
  - cálculo de ventas brutas y netas;
  - costo de ventas;
  - gasto que afecta resultado;
  - resultado operacional estimado.
- `src/lib/gastos.ts`
  - distribución de gastos directos y generales por sucursal.
- `src/modules/estadisticas/VistaGeneralBI.tsx`
  - KPIs, puente de rentabilidad y desempeño por sucursal.
- `src/modules/estadisticas/ResumenTab.tsx`
  - estadísticas operacionales y gastos por categoría/subcategoría.
- `src/modules/estadisticas/ReportesTab.tsx`
  - margen por producto, reparación y categoría.
- `src/modules/contabilidad/GastosTab.tsx`
  - ingreso, clasificación y consulta de gastos.
- `src/lib/queries.ts`
  - consultas y RPC de ventas, gastos, rentabilidad y sucursales.
- RPC relevantes:
  - `fn_ventas_resumen`;
  - `fn_reporte_rentabilidad`;
  - `fn_reporte_sucursales`;
  - funciones transaccionales de venta, inventario y compras.

### 3.3 Nivel estimado de avance

| Capacidad | Avance estimado |
|---|---:|
| Ventas por tienda | 90% |
| Margen bruto por tienda | 80% |
| Gastos directos por tienda | 75% |
| Distribución de gastos compartidos | 50% |
| Resultado controlable | 35% |
| EBITDA gerencial por tienda | 40% |
| Productividad e inventario gerencial | 45% |
| Estado de resultados reconciliable/auditable | 35% |

Estimación global: Pixit se encuentra aproximadamente en un 60–65% del camino hacia un módulo profesional de rentabilidad por sucursal.

---

## 4. Problemas que deben resolverse antes de ampliar el dashboard

### 4.1 Distintas pantallas pueden usar criterios diferentes

Existe riesgo de que una pantalla descuente el gasto bruto y otra descuente el gasto neto cuando hay IVA recuperable.

Ejemplo observado:

- `calcularResumenOperacional()` utiliza `gastoQueAfectaResultado()`;
- `VistaGeneralBI` suma directamente `g.monto` en algunos cálculos.

Consecuencia: dos reportes pueden mostrar resultados diferentes para el mismo periodo.

### 4.2 Gastos generales al filtrar una sucursal

Actualmente algunos cálculos filtran gastos con:

```text
gasto.bodega_id === sucursal_seleccionada
```

Esto puede excluir gastos generales en vez de distribuirlos a la sucursal seleccionada.

### 4.3 Clasificación gerencial insuficiente

Un gasto tiene categoría y sucursal, pero no necesariamente indica si es:

- directo o corporativo;
- variable o fijo;
- controlable o no controlable;
- recurrente o extraordinario;
- gasto operacional, depreciación, impuesto u otro concepto.

### 4.4 Regla única para todos los gastos compartidos

La distribución actual por porcentaje de ventas es razonable como valor por defecto, pero no representa correctamente todas las categorías.

### 4.5 Pérdidas de inventario sin impacto gerencial explícito

Un ajuste manual de stock puede corregir unidades sin reconocer una merma, daño o pérdida en el resultado de la sucursal.

### 4.6 Costos variables que dependen de registro manual

Comisiones, delivery, medios de pago, garantías y servicios tercerizados pueden existir como gastos, pero todavía no todos nacen automáticamente de su operación de origen.

### 4.7 Datos históricos incompletos

Parte del historial puede carecer de:

- sucursal;
- costo FIFO congelado;
- clasificación de IVA;
- clasificación gerencial;
- relación entre gasto y operación de origen.

La interfaz debe distinguir datos exactos, estimados y no asignados.

---

## 5. Modelo financiero objetivo

Pixit debe construir un estado de resultados gerencial por sucursal con estos niveles:

```text
Ventas brutas con IVA
− IVA débito
= Ventas netas

Ventas netas
− costo de productos y repuestos vendidos
= Margen bruto

Margen bruto
− costos variables de la operación
= Margen de contribución

Margen de contribución
− gastos controlables de la sucursal
= Resultado controlable

Resultado controlable
− gastos fijos locales no controlables
= EBITDA de tienda

EBITDA de tienda
− gastos corporativos asignados
= Resultado completo de tienda
```

### 5.1 Definiciones

#### Ventas netas

Solo ventas realizadas/pagadas, sin IVA, después de descuentos y devoluciones.

#### Costo vendido

Costo histórico congelado al confirmar la venta. Para productos debe priorizar FIFO. Una modificación posterior del costo del catálogo no debe cambiar el margen histórico.

#### Costos variables

Costos que cambian con cada venta u orden:

- comisión de técnico o vendedor;
- comisión del medio de pago;
- delivery de esa operación;
- servicio tercerizado;
- material consumible directamente atribuible;
- garantía o retrabajo atribuible.

#### Gastos controlables

Costos que el encargado puede gestionar:

- horas extra;
- insumos;
- compras menores;
- publicidad local;
- pérdidas operacionales;
- parte de dotación controlable, según política de la empresa.

#### Gastos fijos locales

- arriendo;
- remuneraciones estructurales;
- servicios básicos;
- seguridad;
- mantención del local.

#### Gastos corporativos

- administración central;
- contabilidad;
- gerencia;
- marketing corporativo;
- software central;
- bodega o logística central.

---

## 6. Principios de diseño

1. Una cifra debe tener una sola definición en todo Pixit.
2. Los cálculos críticos deben vivir en una capa compartida o RPC, no duplicados entre pantallas.
3. El consolidado debe reconciliarse con la suma de sucursales más “No asignado”.
4. Nunca ocultar datos incompletos distribuyéndolos silenciosamente.
5. Toda cifra debe permitir drill-down hasta los movimientos que la originan.
6. Los periodos cerrados no deben cambiar porque se editó el costo actual de un producto.
7. Los gastos corporativos no deben usarse para evaluar al encargado.
8. El usuario debe ver por separado resultado directo y resultado después de prorrateos.
9. Las reglas de distribución deben ser versionadas por periodo.
10. No se deben reescribir históricos automáticamente sin conservar trazabilidad.

---

## 7. Modelo de datos propuesto

Los nombres finales deben validarse contra el esquema actual antes de crear migraciones.

### 7.1 Ampliar categorías de gasto

Crear una configuración relacional equivalente a:

```text
gasto_categoria_config
- id
- empresa_id
- categoria_nombre o categoria_id
- naturaleza: variable | fijo_local | corporativo | extraordinario
- controlabilidad: controlable | no_controlable
- regla_distribucion: directo | ventas | margen | transacciones | empleados | unidades | fijo | manual | no_distribuir
- incluir_en_ebitda: boolean
- vigente_desde
- vigente_hasta
- creado_en
- actualizado_en
```

Las reglas deben pertenecer a la empresa y estar protegidas por RLS.

### 7.2 Asignaciones de gastos compartidos

```text
gasto_distribuciones
- gasto_id
- empresa_id
- sucursal_id
- regla_aplicada
- base_calculo
- porcentaje
- monto_asignado
- periodo o versión
- calculado_en
```

Alternativa para primera versión: calcular en una RPC sin persistir, pero siempre devolver la regla, porcentaje y monto aplicado. Para cierres mensuales es preferible persistir una fotografía.

### 7.3 Cierres gerenciales mensuales

```text
rentabilidad_cierres
- id
- empresa_id
- sucursal_id
- periodo
- estado: borrador | cerrado | reabierto
- ventas_netas
- costo_ventas
- margen_bruto
- costos_variables
- resultado_controlable
- gastos_fijos
- ebitda_tienda
- gastos_corporativos
- resultado_completo
- datos_no_asignados
- reglas_version
- cerrado_por
- cerrado_en
```

No es necesario incluir esta tabla en la primera entrega, pero el diseño no debe impedir incorporarla.

### 7.4 Eventos de pérdida de inventario

Los ajustes deberían tener motivo:

- corrección administrativa;
- merma;
- daño;
- robo;
- garantía;
- consumo interno;
- diferencia de conteo.

Los motivos con impacto económico deben generar un gasto o asiento trazable usando el costo vigente del lote/stock afectado.

---

## 8. Reglas de distribución recomendadas

| Tipo de gasto | Regla inicial recomendada |
|---|---|
| Arriendo de tienda | Directo |
| Sueldos de tienda | Directo |
| Servicios básicos | Directo |
| Comisión técnica | Operación/sucursal de origen |
| Comisión de pago | Operación/sucursal de origen |
| Delivery | Viaje u operación de origen |
| Marketing local | Directo |
| Marketing corporativo | Por ventas netas |
| Software | Por usuarios activos o fijo |
| Administración central | Por transacciones o ventas netas |
| Bodega central | Por unidades movilizadas |
| Gerencia | Por margen bruto o porcentaje manual |
| Gasto sin clasificación | No asignado; nunca distribuir silenciosamente |

Todas las reglas deben poder modificarse por empresa.

---

## 9. Plan de implementación

### Fase 0 — Validación funcional y financiera

Objetivo: acordar definiciones antes de modificar código.

Tareas:

1. Confirmar qué significa “rentabilidad” para Pixit.
2. Definir si remuneraciones serán monto líquido o costo empresa.
3. Definir tratamiento de depreciación e impuestos.
4. Definir regla inicial para gastos corporativos.
5. Decidir si el primer alcance tendrá cierre mensual.
6. Seleccionar un mes real de Steve Docs para reconciliación manual.

Entregable: glosario financiero firmado y ejemplo de estado de resultados esperado.

### Fase 1 — Fuente única y cifras reconciliables

Objetivo: que todas las pantallas calculen lo mismo.

Tareas:

1. Auditar cada uso de ventas, costos y gastos en Estadísticas/Dashboard.
2. Centralizar tratamiento de IVA con `gastoQueAfectaResultado()` o equivalente SQL.
3. Centralizar la distribución de gastos generales.
4. Corregir el filtro de sucursal para incluir su parte de gastos compartidos.
5. Devolver explícitamente:
   - gastos directos;
   - gastos distribuidos;
   - gastos no asignados;
   - ventas sin sucursal;
   - costos sin respaldo histórico.
6. Crear pruebas de reconciliación.

Criterios de aceptación:

- Dashboard, Estadísticas y reporte por sucursal muestran el mismo resultado para igual periodo/filtro.
- La suma de sucursales + no asignado coincide con el consolidado, con diferencia máxima de redondeo definida.
- El IVA recuperable no reduce dos veces la utilidad.
- Los registros históricos incompletos se muestran como advertencia, no se ocultan.

### Fase 2 — Clasificación gerencial de gastos

Objetivo: separar margen, contribución, controlabilidad y estructura.

Tareas:

1. Crear configuración gerencial por categoría.
2. Asignar valores iniciales a categorías existentes.
3. Incorporar los campos al formulario de categorías, no al ingreso diario de cada gasto.
4. Permitir sobreescritura excepcional por gasto con trazabilidad.
5. Migrar históricos con clasificación sugerida, sin inventar sucursal.
6. Mostrar advertencia de categorías aún no clasificadas.

Criterios de aceptación:

- Todo gasto nuevo hereda una clasificación gerencial.
- Los gastos no clasificados quedan visibles en una sección de calidad de datos.
- Cambiar una regla futura no altera cierres ya congelados.

### Fase 3 — Motor de rentabilidad por sucursal

Objetivo: producir el estado de resultados gerencial completo.

Tareas:

1. Crear RPC o servicio único con filtros de empresa, sucursal y periodo.
2. Calcular ventas netas y costo vendido.
3. Calcular margen bruto.
4. Separar costos variables.
5. Calcular margen de contribución.
6. Separar gastos controlables.
7. Calcular resultado controlable.
8. Separar gastos fijos locales.
9. Calcular EBITDA de tienda.
10. Aplicar gastos corporativos y calcular resultado completo.
11. Devolver drill-down y metadatos de calidad.

Forma sugerida de respuesta:

```text
resumen
- ventas_brutas
- ventas_netas
- costo_ventas
- margen_bruto
- costos_variables
- margen_contribucion
- gastos_controlables
- resultado_controlable
- gastos_fijos
- ebitda_tienda
- gastos_corporativos
- resultado_completo

calidad
- ventas_sin_sucursal
- gastos_sin_sucursal
- gastos_sin_clasificar
- lineas_sin_costo_historico
- montos_no_asignados

detalle_sucursales[]
detalle_categorias[]
reglas_aplicadas[]
```

Criterios de aceptación:

- La RPC aplica aislamiento por empresa en backend.
- No acepta una empresa manipulada salvo impersonación válida de platform admin.
- Las cifras concilian con ventas, ítems y gastos subyacentes.
- El resultado es estable al repetir la consulta.

### Fase 4 — Interfaz gerencial

Objetivo: hacer comprensible el resultado sin ocultar la trazabilidad.

Pantalla propuesta: **Rentabilidad por sucursal**.

Componentes:

1. Periodo y comparación.
2. Selector consolidado/sucursal.
3. KPIs:
   - ventas netas;
   - margen bruto y porcentaje;
   - margen de contribución y porcentaje;
   - resultado controlable;
   - EBITDA de tienda y porcentaje;
   - resultado completo.
4. Puente visual de rentabilidad.
5. Comparación entre sucursales.
6. Punto de equilibrio.
7. Gastos directos versus distribuidos.
8. Rentabilidad por categoría/producto/servicio.
9. Alertas de calidad de datos.
10. Drill-down al detalle de ventas y gastos.

La interfaz debe diferenciar visualmente:

- dato directo;
- dato prorrateado;
- dato estimado;
- dato incompleto.

### Fase 5 — Automatización de costos variables

Objetivo: reducir trabajo humano y omisiones.

Tareas:

1. Asociar comisión técnica a orden/sucursal.
2. Calcular comisión del medio de pago según configuración.
3. Asociar delivery a solicitud/orden/sucursal.
4. Registrar servicios tercerizados desde la orden.
5. Clasificar garantías y retrabajos.
6. Generar impacto económico de mermas de inventario.
7. Evitar duplicar gastos automáticos mediante IDs deterministas.

### Fase 6 — Cierre mensual y gobierno de datos

Objetivo: conservar cifras históricas auditables.

Tareas:

1. Cierre mensual por empresa/sucursal.
2. Fotografía de reglas y distribuciones.
3. Reapertura solo con autorización y registro de auditoría.
4. Bloqueo o advertencia para ediciones retroactivas.
5. Exportación Excel/PDF del estado de resultados.
6. Registro de quién cerró, reabrió o modificó.

---

## 10. Pruebas necesarias

### 10.1 Unitarias

- gasto con y sin IVA recuperable;
- venta con costo FIFO cero o faltante;
- gasto directo;
- gasto general distribuido por ventas;
- periodo sin ventas;
- sucursal sin ventas pero con gastos;
- gasto de sucursal eliminada;
- redondeo de prorrateos;
- punto de equilibrio;
- clasificación variable/fijo/controlable.

### 10.2 Integración SQL

- aislamiento entre dos empresas;
- filtros por sucursal;
- suma de sucursales contra consolidado;
- consistencia bajo ejecuciones concurrentes;
- reglas vigentes por fecha;
- cierre histórico inmutable;
- platform admin impersonando empresa de forma válida.

### 10.3 E2E

1. Crear ventas en dos sucursales.
2. Registrar gasto directo en cada una.
3. Registrar gasto general.
4. Verificar distribución.
5. Cambiar periodo y sucursal.
6. Abrir drill-down.
7. Confirmar que cifras coinciden entre Dashboard y Rentabilidad.
8. Ver alertas de datos no asignados.

### 10.4 Caso patrón de reconciliación

Preparar un caso pequeño calculable manualmente:

```text
Sucursal A
Ventas netas: 1.000.000
Costo vendido: 400.000
Gasto directo: 100.000

Sucursal B
Ventas netas: 500.000
Costo vendido: 250.000
Gasto directo: 50.000

Gasto corporativo compartido: 150.000
Regla: ventas netas

Asignación esperada:
A: 100.000
B: 50.000

Resultado completo esperado:
A: 400.000
B: 150.000
Consolidado: 550.000
```

Este caso debe existir como prueba automatizada permanente.

---

## 11. Migración y compatibilidad

1. No eliminar campos actuales.
2. Introducir configuración con valores predeterminados conservadores.
3. Los gastos históricos sin clasificación deben permanecer visibles como “No clasificado”.
4. No asignar automáticamente una sucursal inexistente.
5. Mantener la vista operacional actual mientras se valida el nuevo motor.
6. Comparar ambos cálculos durante al menos un periodo real.
7. Retirar cálculos duplicados solo después de aprobar la reconciliación.
8. Toda migración SQL debe ser reejecutable cuando sea posible y no debe modificar montos históricos sin respaldo.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Mostrar rentabilidad falsa por gastos sin sucursal | Sección “No asignado” y bloqueo de cierre |
| Cambiar históricos al editar reglas | Versionar reglas y congelar cierres |
| Diferencias entre pantallas | Una RPC/fuente única |
| Prorrateos que no suman por redondeo | Asignar residuo determinísticamente |
| Evaluar injustamente al encargado | Separar resultado controlable y completo |
| Duplicar comisiones/gastos automáticos | ID determinista y restricción única |
| Inventario perdido sin gasto | Motivo de ajuste e impacto económico |
| Datos antiguos sin costo | Indicador de estimación y plan de saneamiento |
| Consulta pesada en rangos largos | Agregados SQL, índices y cierres mensuales |
| Fuga entre empresas | RLS, validación en RPC y tests A/B |

---

## 13. Decisiones pendientes para gerencia

Antes de implementar deben responderse estas preguntas:

1. ¿El encargado será evaluado por resultado controlable, EBITDA local o ambos?
2. ¿Los sueldos se registrarán como líquido pagado o costo empresa completo?
3. ¿Cómo se tratarán las leyes sociales?
4. ¿Qué categorías se consideran variables?
5. ¿Qué costos corporativos deben repartirse y cuáles solo mostrarse consolidados?
6. ¿Cuál será la regla inicial de cada costo corporativo?
7. ¿Las comisiones de medios de pago se configurarán por método?
8. ¿Las garantías disminuirán el resultado de la tienda que realizó la reparación?
9. ¿Las mermas afectarán a la sucursal donde se detectan?
10. ¿Se permitirá editar meses cerrados?
11. ¿Se necesita EBITDA contable o un EBITDA gerencial aproximado?
12. ¿El primer lanzamiento será solo para Steve Docs o configurable para todos los clientes Pixit?

---

## 14. Alcance recomendado para la primera versión

La primera entrega no debería intentar cubrir contabilidad financiera completa.

Debe incluir:

- fuente única de cálculo;
- ventas netas;
- costo vendido histórico;
- margen bruto;
- gastos directos;
- gastos generales distribuidos por una regla explícita;
- resultado controlable;
- EBITDA gerencial de tienda;
- resultado completo;
- punto de equilibrio;
- conciliación consolidado/sucursales;
- drill-down;
- alertas de datos no asignados.

Debe dejar para una segunda entrega:

- depreciaciones complejas;
- impuestos a la renta;
- costeo por hora técnica;
- presupuestos versus real;
- forecasting;
- cierre contable legal;
- múltiples monedas;
- integraciones contables externas.

---

## 15. Instrucciones para la revisión de Claude

Revisar este plan como arquitecto SaaS, gerente financiero de retail y especialista ERP/POS.

Entregar una respuesta que incluya:

1. Acuerdos con el diagnóstico.
2. Supuestos incorrectos o incompletos.
3. Riesgos no contemplados.
4. Cambios propuestos al modelo financiero.
5. Cambios propuestos al modelo de datos.
6. Evaluación de si conviene calcular en tiempo real o congelar cierres.
7. MVP mínimo recomendado.
8. Orden de implementación recomendado.
9. Pruebas imprescindibles.
10. Decisiones que debe tomar gerencia.
11. Conclusión explícita: aprobar, aprobar con cambios o rechazar el plan.

No proponer un rediseño masivo si la arquitectura actual puede evolucionar de forma incremental. Priorizar consistencia, trazabilidad, aislamiento multi-tenant e integridad de datos por encima de la estética del dashboard.

