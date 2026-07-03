-- A migration seguinte (20260701135826_remote_schema.sql, pull automático do schema
-- remoto) recria "vw_central_pacientes" sem primeiro dropar a função
-- listar_central_pacientes, que depende do rowtype da view (RETURNS SETOF).
-- Isso bloqueia o DROP VIEW com "outros objetos dependem dela". A função é
-- recriada em 20260701135827_recreate_listar_central_pacientes.sql, logo após
-- a view ser recriada pelo pull.
DROP FUNCTION IF EXISTS public.listar_central_pacientes(date);
