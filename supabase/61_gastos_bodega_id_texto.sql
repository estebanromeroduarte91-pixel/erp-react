-- Los IDs de sucursal/bodega de Pixit son identificadores de texto históricos
-- (por ejemplo, 1788380615640), no UUIDs. `gastos` debe usar el mismo tipo que
-- ventas, órdenes e inventario; de otro modo los gastos automáticos no pueden
-- conservar su sucursal de origen.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gastos'
      and column_name = 'bodega_id'
      and data_type <> 'text'
  ) then
    alter table public.gastos
      alter column bodega_id type text using bodega_id::text;
  end if;
end;
$$;
