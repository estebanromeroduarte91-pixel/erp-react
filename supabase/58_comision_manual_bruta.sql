-- Comisión técnica manual por monto BRUTO.
-- Puede ejecutarse aunque la migración 57 no se haya corrido: completa todas
-- las columnas necesarias y calcula el snapshot al entregar la OT en POS.

alter table public.ordenes
  add column if not exists comision_tecnica_activa boolean not null default false,
  add column if not exists comision_tecnica_porcentaje numeric(5,2) not null default 0,
  add column if not exists comision_tecnica_bruto numeric,
  add column if not exists comision_tecnica_base numeric,
  add column if not exists comision_tecnica_monto numeric;

alter table public.ordenes
  drop constraint if exists ordenes_comision_tecnica_porcentaje_rango;

alter table public.ordenes
  add constraint ordenes_comision_tecnica_porcentaje_rango
  check (comision_tecnica_porcentaje >= 0 and comision_tecnica_porcentaje <= 100);

-- La función de venta ya inserta venta_items antes de entregar la OT. Este
-- trigger toma sólo `ot-servicio`, por lo que repuestos y accesorios quedan
-- excluidos aunque estén en la misma boleta.
create or replace function public.calcular_comision_tecnica_orden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio_neto numeric := 0;
  v_neto_configurado numeric := 0;
  v_base_final numeric := 0;
begin
  if new.venta_id is not null and new.venta_id is distinct from old.venta_id then
    if coalesce(new.comision_tecnica_activa, false)
       and coalesce(new.comision_tecnica_porcentaje, 0) > 0
       and coalesce(new.comision_tecnica_bruto, 0) > 0 then
      select coalesce(sum(subtotal), 0)
        into v_servicio_neto
      from public.venta_items
      where venta_id = new.venta_id
        and empresa_id = new.empresa_id
        and producto_id = 'ot-servicio';

      -- Se parte del monto bruto ingresado por el encargado. El tope por el
      -- servicio realmente cobrado evita pagar comisión sobre un descuento.
      v_neto_configurado := round(new.comision_tecnica_bruto / 1.19);
      v_base_final := least(v_neto_configurado, v_servicio_neto);
      new.comision_tecnica_base := v_base_final;
      new.comision_tecnica_monto := round(v_base_final * new.comision_tecnica_porcentaje / 100);
    else
      new.comision_tecnica_base := null;
      new.comision_tecnica_monto := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calcular_comision_tecnica_orden on public.ordenes;
create trigger trg_calcular_comision_tecnica_orden
before update of venta_id on public.ordenes
for each row execute function public.calcular_comision_tecnica_orden();
