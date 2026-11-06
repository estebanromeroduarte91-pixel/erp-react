-- Texto de búsqueda de productos, sin tildes y en minúsculas.
--
-- La búsqueda del punto de venta, del taller y de Compras corre en el
-- servidor con ilike, que distingue tildes: "bateria" no encontraba
-- "Batería". Además solo miraba nombre, SKU y modelos compatibles, y en
-- Steve Docs la palabra "Batería" está en la categoría, no en el nombre.
--
-- Esta columna junta nombre, SKU, categoría, subcategoría y modelos
-- compatibles ya sin tildes. Postgres la recalcula sola cada vez que cambia
-- el producto (columna generada), así que nunca queda desactualizada.
-- La app pasa lo escrito por el mismo filtro (minúsculas, sin tildes) antes
-- de buscar.

alter table public.productos
  add column if not exists texto_busqueda text
  generated always as (
    translate(
      lower(
        coalesce(nombre, '') || ' ' ||
        coalesce(sku, '') || ' ' ||
        coalesce(categoria, '') || ' ' ||
        coalesce(subcategoria, '') || ' ' ||
        coalesce(modelos_compatibles, '')
      ),
      'áéíóúüñàèìòùÁÉÍÓÚÜÑ',
      'aeiouunaeiouaeiouun'
    )
  ) stored;
