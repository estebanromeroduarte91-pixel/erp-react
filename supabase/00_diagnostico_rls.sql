-- Fase 0: diagnóstico de solo lectura. No modifica nada.
-- Correr en Supabase Dashboard → SQL Editor, y pegar el resultado completo de vuelta.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
