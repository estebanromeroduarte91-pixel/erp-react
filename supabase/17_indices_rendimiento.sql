-- Fase 5, punto 3: índices compuestos sobre las columnas que efectivamente
-- se usan para filtrar/ordenar en src/lib/queries.ts, para las tablas
-- relacionales creadas durante la migración fuera del blob erp_data.
--
-- Sin CONCURRENTLY: el editor de SQL de Supabase corre los scripts dentro de
-- una transacción, y CONCURRENTLY no puede usarse ahí. Con el volumen actual
-- (miles de filas, no millones) el lock de un CREATE INDEX normal es de
-- milisegundos — no hace falta correr cada línea aparte.
--
-- NOTA: este archivo documenta SQL que ya fue ejecutado contra producción.

create index if not exists idx_ventas_empresa_fecha on public.ventas (empresa_id, fecha desc);
create index if not exists idx_ventas_empresa_estado on public.ventas (empresa_id, estado);
-- Las llaves foráneas no se indexan solas en Postgres: venta_items.venta_id
-- se usa en cada join de una venta con sus líneas (incluida fn_ventas_resumen).
create index if not exists idx_venta_items_venta_id on public.venta_items (venta_id);
create index if not exists idx_ordenes_empresa_draft on public.ordenes (empresa_id, is_draft);
create index if not exists idx_ordenes_empresa_num on public.ordenes (empresa_id, num);
create index if not exists idx_movimientos_empresa_creado on public.movimientos_inventario (empresa_id, creado_en desc);
create index if not exists idx_ocs_empresa_fecha on public.ocs (empresa_id, fecha);
create index if not exists idx_lotes_empresa_bodega_producto on public.lotes_inventario (empresa_id, bodega_id, producto_id);
