-- Solo lectura. Exporta el catálogo de equipos (tp_equipos) de la empresa demo
-- (la que aparece en Taller > Equipos con 1210 equipos) para usarlo como
-- catálogo por defecto de toda empresa nueva que se registre.
--
-- Reemplaza 'Kechu Demo' por el nombre exacto de la empresa si no coincide.
select e.nombre, ed.datos
from erp_data ed
join empresas e on e.id = ed.empresa_id
where ed.clave = 'tp_equipos'
  and e.nombre = 'Kechu Demo';
