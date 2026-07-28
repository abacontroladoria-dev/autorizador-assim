-- Habilita versionamento de sessões em agenda_tita.
-- Antes: upsert por tita_agendamento_id sobrescrevia silenciosamente qualquer alteração.
-- Agora: registro antigo é marcado ativo=false + motivo_inativacao, novo registro é inserido.
-- A info mais recente (ativo=true) é sempre a verdadeira; histórico fica preservado.

-- 1. Remove a constraint UNIQUE para permitir múltiplas versões do mesmo agendamento.
ALTER TABLE public.agenda_tita
  DROP CONSTRAINT IF EXISTS agenda_tita_tita_agendamento_id_key;

-- 2. Coluna que registra o motivo da inativação do registro.
--    'alterado' → campos-chave mudaram no TiTa (novo registro foi inserido no lugar)
--    'excluido' → agendamento não voltou mais na resposta do TiTa
--    NULL       → registro ativo atual
ALTER TABLE public.agenda_tita
  ADD COLUMN IF NOT EXISTS motivo_inativacao text;

-- 3. Atualiza fn_sync_tita_semana para chamar a Edge Function sem datas explícitas,
--    deixando-a usar o default: hoje → último dia útil do mês seguinte.
CREATE OR REPLACE FUNCTION public.fn_sync_tita_semana()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- 4. Atualiza fn_sync_tita_grade para chamar a Edge Function sem datas explícitas,
--    deixando-a usar o default: hoje → último dia útil do mês seguinte.
CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$$;
