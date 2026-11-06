-- Modelos compatibles de un producto.
--
-- Un mismo repuesto sirve para varios equipos: la batería del iPhone 12 es la
-- misma del 12 Pro. Antes había que elegir un solo modelo en el nombre, o crear
-- dos productos con stocks separados que nunca cuadraban con la caja física.
-- Ahora es un solo producto con un solo stock, y esta columna guarda los otros
-- modelos para los que sirve ("iPhone 12, iPhone 12 Pro"). La búsqueda de
-- productos mira esta columna además del nombre y el SKU, así que buscar
-- "batería 12 pro" encuentra la "Batería iPhone 12".
--
-- Es solo texto para buscar: no toca stock, costos ni movimientos.

alter table public.productos
  add column if not exists modelos_compatibles text;

-- Sin índice: el catálogo es de algunos miles de filas y la búsqueda ya
-- filtra por empresa_id primero.
