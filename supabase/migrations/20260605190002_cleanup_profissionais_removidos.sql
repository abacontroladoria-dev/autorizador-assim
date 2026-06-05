-- Limpeza pontual: remove dados orfãos de Daiane Fernandes e Vinicius Andrade,
-- removidos do TITA mas cujos registros persistiram porque:
--   1. O sync de agenda não retroage para datas passadas (sessões antigas ativo=TRUE).
--   2. O sync de grade ainda não rodou com a janela seg→sex.
--
-- Inativa sessões desta semana em agenda_tita e remove entradas em grade_profissionais_tita.

UPDATE public.agenda_tita
SET ativo = FALSE, motivo_inativacao = 'excluido', updated_at = NOW()
WHERE ativo = TRUE
  AND profissional_nome ILIKE '%Daiane%Fernandes%'
  AND data_atendimento BETWEEN date_trunc('week', CURRENT_DATE)::date
                           AND date_trunc('week', CURRENT_DATE)::date + 6;

UPDATE public.agenda_tita
SET ativo = FALSE, motivo_inativacao = 'excluido', updated_at = NOW()
WHERE ativo = TRUE
  AND profissional_nome ILIKE '%Vinicius%Andrade%'
  AND data_atendimento BETWEEN date_trunc('week', CURRENT_DATE)::date
                           AND date_trunc('week', CURRENT_DATE)::date + 6;

DELETE FROM public.grade_profissionais_tita
WHERE nome_profissional ILIKE '%Daiane%Fernandes%';

DELETE FROM public.grade_profissionais_tita
WHERE nome_profissional ILIKE '%Vinicius%Andrade%';
