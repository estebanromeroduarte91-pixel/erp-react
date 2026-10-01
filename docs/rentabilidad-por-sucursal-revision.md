# Revisión del plan "Rentabilidad profesional por sucursal"

Documento de respuesta al plan de implementación. Escrito para que el equipo que
lo ejecute pueda trabajar directamente desde acá.

**Veredicto: APROBAR CON CAMBIOS.** El modelo financiero es correcto. Lo que se
modifica es el alcance y, sobre todo, el orden: el plan construye el motor antes
de limpiar los datos que lo alimentan, y arrastra un problema de permisos que
haría peligroso publicar el reporte.

Todo lo que sigue está verificado contra el código y contra datos reales de
producción (Steve Docs, agosto y septiembre de 2026). Donde no pude verificar,
lo digo.

---

## 1. Diagnóstico confirmado

### 1.1 Divergencia de IVA entre pantallas — CONFIRMADO

- `src/modules/estadisticas/VistaGeneralBI.tsx:28-29` suma `+g.monto` crudo.
- `src/lib/metricas.ts:55` usa `gastoQueAfectaResultado()`, que descuenta el
  neto cuando el gasto tiene crédito fiscal.

Dos pantallas devuelven utilidades distintas para el mismo período.

### 1.2 Gastos generales excluidos al filtrar sucursal — CONFIRMADO

`src/modules/estadisticas/VistaGeneralBI.tsx:24-25`:

```ts
(!branchId || g.bodega_id === branchId)
```

Al seleccionar una sucursal, los gastos generales se excluyen en vez de
repartirse. La sucursal aparece más rentable de lo que es.

### 1.3 Tercera divergencia, no detectada en el plan — CONFIRMADO

Dentro del propio Dashboard conviven dos bases distintas:

- resultado global: `calcularResumenOperacional()` usa el gasto **neto**.
- resultado por sucursal: `src/lib/gastos.ts:41` usa `+g.monto` **crudo**.

La suma de sucursales no cuadra con el consolidado por construcción, apenas
alguien marque un gasto con crédito fiscal. Hoy no se nota porque ningún gasto
lo tiene marcado (ver 2.3).

---

## 2. Supuestos del plan que hay que corregir

### 2.1 El avance está subestimado: la mitad ya existe en el servidor

`fn_reporte_sucursales` (`supabase/56_reporte_sucursales.sql`) **ya calcula por
sucursal**: ventas netas, IVA, transacciones, costo y margen bruto. Además
aplica aislamiento por empresa, valida permiso con `fn_puede_ver_estadisticas()`
y restringe la sucursal para usuarios no administradores.

**Consecuencia para el plan:** no hay que construir un motor nuevo. Hay que
extender esa RPC (o una hermana que la reutilice) con los gastos, que hoy se
calculan en el navegador. El trabajo es unir, no crear.

### 2.2 El costo congelado no está garantizado

`supabase/56_reporte_sucursales.sql` y `supabase/55_reporte_rentabilidad.sql`
usan:

```sql
coalesce(vi.costo_total, vi.cantidad * coalesce(p.precio_compra, 0))
```

Cuando la línea no tiene costo histórico, **se valoriza con el precio de compra
actual**. Esto viola el principio 6 del propio plan: un cambio de precio en el
catálogo mueve la utilidad de meses cerrados.

Afecta hoy: las ventas del 15 al 25 de septiembre de 2026 quedaron sin costo
congelado (incidente de stock ya corregido). Ese período se valoriza con costos
de hoy y no es auditable. Debe marcarse como estimado en la capa de calidad de
datos.

### 2.3 El prorrateo resuelve un problema que todavía no existe

Datos reales de Steve Docs, agosto y septiembre de 2026 (164 gastos):

- gastos generales o sin sucursal: **0**
- gastos con crédito fiscal marcado: **0**

El problema real no es repartir lo compartido, es que **lo compartido está mal
asignado**: 2.991.855 de sueldos cargados enteros a Los Dominicos y 558.907 de
arriendo solo a La Dehesa. Con eso, comparar las dos tiendas hoy no significa
nada.

**Consecuencia:** la clasificación gerencial (Fase 2 del plan) tiene más valor
que el motor de distribución (Fase 1). Hay que invertir la prioridad.

### 2.4 El permiso que protege los reportes es falsificable — BLOQUEANTE

`fn_puede_ver_estadisticas()` (`supabase/54_reportes_ventas.sql:46`) resuelve el
permiso leyendo el cargo del usuario desde `erp_data`, en las claves
`ucfg_<uid>` y `user_cargo_map`.

La política RLS que gobierna esa tabla es:

```
erp_data_update USING (empresa_id = auth.uid() OR EXISTS(
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid() AND empresa_id = erp_data.empresa_id AND activo = true))
```

**No tiene condición de rol.** Cualquier usuario activo de la empresa puede
reescribir la clave `cargos` o su propio `ucfg_<uid>`, y el servidor le
concederá el permiso. El control existe, pero confía en un dato que el propio
usuario controla.

Publicar un reporte de rentabilidad sobre este permiso expone costos, márgenes y
sueldos a cualquier empleado de la empresa.

No fue explotado: la conclusión sale del texto de la política y del código de la
función, no de una prueba destructiva.

---

## 3. Riesgos no contemplados en el plan

1. **Fecha de venta contra fecha de creación.** Conviven `ventas.fecha` (date) y
   `ventas.fecha_creacion` (timestamptz). Distintas pantallas usan distintos
   campos y en Chile eso mueve ventas de un mes a otro. Hay que fijar uno,
   documentarlo y usarlo en todas partes.
2. **El costo del medio de pago no se registra.** Los métodos activos son
   GetNet, Transferencia y Efectivo. La comisión de GetNet no existe en gastos,
   así que el margen de contribución que muestre el reporte estará sobrestimado.
3. **`erp_data` es último-en-escribir-gana.** Las reglas de distribución que el
   plan quiere guardar ahí se pisarían entre usuarios concurrentes.
4. **El reporte puede convertirse en el tercer cálculo.** Si se agrega sin
   eliminar los dos existentes, el problema de consistencia empeora.

---

## 4. Cambios al modelo financiero

Cascada de **cuatro** niveles en la primera versión, no seis:

```
Ventas netas - costo vendido             = Margen bruto
             - costos variables           = Margen de contribución
             - gastos fijos de la tienda  = Resultado de cuatro paredes
             - corporativos asignados     = Resultado completo
```

Se fusionan "resultado controlable" y "EBITDA de tienda": separarlos exige una
política de qué controla el encargado que todavía no está definida, y sin esa
definición el nivel extra no informa nada.

Dos precisiones del rubro que el plan no hace:

- **La mano de obra técnica no está en el costo vendido.** El margen bruto de
  agosto (68%) incluye el trabajo del técnico como margen; su costo aparece
  después, como comisión. Ese 68% no es comparable con retail puro. La métrica
  comparable es el margen de contribución.
- **Servicio y producto deben reportarse separados.** En agosto, el 98% de la
  venta pasó por productos del catálogo y solo el 2% por líneas de servicio sin
  producto: "cambio de batería" se registra como producto. El reporte debe poder
  separar reparación de accesorio.

---

## 5. Cambios al modelo de datos

| Propuesta original | Decisión |
|---|---|
| `gasto_categoria_config` | Sí, con naturaleza, controlabilidad, regla y vigencia |
| `gasto_distribuciones` | No en v1. Calcular en la RPC y devolver regla, base y monto aplicados. Persistir cuando exista cierre mensual |
| `rentabilidad_cierres` | Posponer. La RPC debe recibir período para poder congelarse después sin rediseño |
| Motivo en ajustes de inventario | Sí, fase posterior. Es cambio de flujo operativo, no de reporte |

**Agregar, no está en el plan:** un campo explícito en el gasto que indique si es
de tienda o corporativo. La configuración por categoría no alcanza: "Sueldos" es
de tienda para un vendedor y corporativo para el contador. Categoría como valor
por defecto, gasto como excepción con trazabilidad.

---

## 6. Tiempo real o cierres congelados

**Cálculo al vuelo para el mes en curso; congelado al cerrar el mes.**

Hoy no existe disciplina de cierre y los datos se corrigen hacia atrás: esta
semana se corrigieron dos semanas de stock y de costos. Congelar antes de tener
el dato limpio congela el error. El diseño debe permitir el cierre desde el
principio, pero la primera versión no debe exigirlo.

---

## 7. MVP recomendado

1. Una sola fuente de cálculo: extender `fn_reporte_sucursales` con gastos, o
   una RPC hermana que la reutilice.
2. Cascada de cuatro niveles, por sucursal y consolidado.
3. Gastos directos y, cuando existan, generales repartidos por venta, devolviendo
   siempre la regla aplicada.
4. Bloque de calidad de datos: ventas sin sucursal, gastos sin clasificar, líneas
   sin costo congelado.
5. Punto de equilibrio por tienda.
6. Una pantalla que **reemplaza** los cálculos duplicados de `VistaGeneralBI`.

Fuera del MVP: depreciación, impuestos, presupuesto contra real, costeo por hora
técnica, cierre contable legal, múltiples monedas.

---

## 8. Orden de implementación

**Sprint 0 — Seguridad. Bloqueante, antes de tocar el reporte.**
Impedir que `erp_data` sea escribible por cualquier usuario en las claves
`cargos`, `ucfg_*` y `user_cargo_map`. Requiere modificar `erp_data_update`, no
solo agregar una política nueva: en RLS las políticas del mismo tipo se combinan
con OR, así que una política adicional no bloquea nada por sí sola. Debe
acompañarse de una prueba de que un no-administrador queda bloqueado y un
administrador sigue guardando su configuración.

**Sprint 1 — Datos.**
Campo tienda/corporativo en gastos. Reasignar los sueldos de Steve Docs por
persona y sucursal. Registrar la comisión del medio de pago. Sin esto el reporte
es exacto y falso.

**Sprint 2 — Fuente única.**
RPC con la cascada. Las tres pantallas la consumen. Aquí mueren las divergencias
1.1, 1.2 y 1.3.

**Sprint 3 — Pantalla y punto de equilibrio.**

**Sprint 4 — Automatización de costos variables y cierre mensual.**

---

## 9. Pruebas imprescindibles

Se mantiene el caso patrón de reconciliación del plan original, y se agregan:

1. **Consolidado igual a suma de sucursales más no asignado**, probado con
   gastos generales y con gastos sin sucursal.
2. **Gasto con crédito fiscal**: el IVA recuperable se descuenta una sola vez, y
   el consolidado y el detalle usan la misma base.
3. **Permisos**: un usuario sin el módulo no obtiene datos aunque manipule su
   cargo en `erp_data`. Esta prueba es la que demuestra que el Sprint 0 quedó
   bien hecho.
4. **Multi-tenant**: la RPC llamada con `p_empresa_id` de otra empresa devuelve
   los datos propios, igual que hacen hoy `fn_ventas_resumen` y
   `fn_reporte_sucursales` (verificado en producción).
5. **Período**: una venta del último día del mes cae en el mes correcto según el
   campo de fecha que se haya fijado.

---

## 10. Decisiones de gerencia, con recomendación

| Pregunta | Recomendación |
|---|---|
| ¿Con qué se evalúa al encargado? | Resultado de cuatro paredes |
| ¿Sueldos líquidos o costo empresa? | Costo empresa, con leyes sociales |
| ¿Garantías y retrabajos? | A la tienda que hizo la reparación |
| ¿Mermas? | A la tienda donde se detectan |
| ¿Meses cerrados editables? | No; toda reapertura con registro de auditoría |
| ¿Primer lanzamiento? | Configurable para todos, activado primero en Steve Docs |
| ¿EBITDA contable o gerencial? | Gerencial |
| ¿Comisión de medios de pago? | Configurable por método, aplicada automáticamente |

---

## 11. Restricciones para quien implemente

- No crear una tercera fuente de cálculo: la RPC nueva debe **reemplazar** los
  cálculos de `VistaGeneralBI`, no sumarse a ellos.
- No modificar montos históricos. Los períodos ya cerrados no cambian de valor
  por aplicar esta funcionalidad.
- No inventar sucursal para datos que no la tienen: se muestran como
  "No asignado".
- No distribuir silenciosamente lo que no se puede clasificar.
- Toda migración SQL debe poder reejecutarse sin efectos secundarios.
- Antes de publicar, verificar que la función desplegada en Supabase es la que el
  código espera: `npm run verificar:rpc`. Durante esta auditoría se encontraron
  cuatro migraciones que estaban en el repositorio y nunca se aplicaron en
  producción; una de ellas dejó diez días de ventas sin descontar stock.
