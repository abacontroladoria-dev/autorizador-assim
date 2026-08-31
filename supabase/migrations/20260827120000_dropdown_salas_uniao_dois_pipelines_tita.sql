-- Bug (2026-08-27): a profissional Andréa Aparecida Borges de Oliveira
-- (profissional_id 18551, Terapia Ocupacional, Realengo · Sala 5) estava ativa
-- na TiTa, com 7 slots 'Livre' na tarde de 27/08, e NÃO aparecia no dropdown de
-- "Alocar sessão livre" em /relacionamento-prestador/ocupacao-salas.
--
-- Causa medida em produção: o dropdown lê vw_cronograma_profissionais_salas,
-- que até aqui tinha csv_grades_profissionais como única fonte. Essa tabela é
-- alimentada pelo cron `sync-grade-csv-daily`, que roda UMA vez por dia às
-- 02:00 BRT. A grade dela entrou na TiTa às 10:00 BRT — depois da rodada do
-- dia (a última tinha carimbo 04:01 BRT). Ou seja: profissional cadastrado
-- durante o horário comercial só podia ser alocado no dia seguinte, e a tela
-- não dava nenhum sinal de que a ausência era atraso de sync, não cadastro
-- faltando. Quem enfrenta isso não tem como distinguir os dois casos.
--
-- O dado já estava no banco: `grade_profissionais_tita`, o outro pipeline TiTa
-- (fn_sync_tita_operacional, cron `sync-tita-operacional` às 06:00 e 12:00 BRT
-- em dias úteis), já tinha as 7 linhas dela desde 10:00 BRT do mesmo dia. As
-- duas tabelas leem a mesma unidade (280) e cobrem a mesma janela — a diferença
-- é só a frequência de atualização.
--
-- Correção: a view passa a considerar as DUAS fontes. Não é troca de fonte nem
-- ampliação de regra de negócio — é hedge de latência. Medido hoje, depois de
-- rodar o sync manualmente para desbloquear a Andréa: com o mesmo piso de 30
-- dias e as mesmas exclusões de nome, as duas fontes convergem para o mesmo
-- conjunto (129 nomes em csv, 128 em gpt, ZERO nomes que só existem em
-- grade_profissionais_tita). A união só produz efeito na janela em que uma das
-- pontas está atrasada em relação à outra — que é exatamente o bug. Pior caso
-- cai de ~24h para poucas horas.
--
-- Duas assimetrias entre as fontes, e por que nenhuma atrapalha:
--
--   • `ativo` só existe em csv_grades_profissionais (soft-delete do
--     sync-grade-csv: sessão que a TiTa deixou de devolver vira ativo = false).
--     grade_profissionais_tita é snapshot por slot, sem soft-delete. O piso de
--     `data >= current_date - 30 days` é o que limita a exposição: quem saiu
--     deixa de ter data recente e cai fora em no máximo 30 dias — a mesma
--     tolerância que csv_grades_profissionais já tem hoje para linha que
--     continua ativa.
--
--   • o profissional_id pode divergir entre as fontes para o mesmo nome. A
--     coluna `prioridade` resolve isso sem empate arbitrário: csv vem antes,
--     então o ID gravado na alocação continua saindo do pipeline canônico, e
--     grade_profissionais_tita só preenche lacuna — nunca sobrepõe.
--
-- security_invoker = true é mantido, e funciona nas duas tabelas:
-- grade_profissionais_tita tem policy de SELECT para `authenticated` com
-- using (true) desde 20260524120000. Só profissional_id e nome saem da view —
-- cpf_profissional e numero_telefone, que aquela tabela também carrega, ficam
-- fora de propósito.
--
-- Definições anteriores: 20260805110000 (criação) e 20260805160100 (piso de
-- data + `ativo` + exclusão de 'Combinar Consulta%').

CREATE OR REPLACE VIEW public.vw_cronograma_profissionais_salas
WITH (security_invoker = true) AS
WITH fontes AS (
  -- Pipeline canônico (sync-grade-csv, 02:00 BRT) — prioridade 0.
  SELECT 0 AS prioridade, profissional_id, profissional_nome
  FROM public.csv_grades_profissionais
  WHERE ativo
    AND data >= current_date - interval '30 days'

  UNION ALL

  -- Pipeline operacional (fn_sync_tita_operacional, 06:00 e 12:00 BRT em dias
  -- úteis) — prioridade 1, só preenche quem o canônico ainda não viu.
  SELECT 1 AS prioridade, profissional_id, nome_profissional AS profissional_nome
  FROM public.grade_profissionais_tita
  WHERE data >= current_date - interval '30 days'
)
SELECT DISTINCT ON (profissional_nome)
  profissional_id, profissional_nome
FROM fontes
WHERE profissional_nome IS NOT NULL
  AND profissional_nome <> ''
  AND profissional_nome NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  AND profissional_nome NOT ILIKE 'Testes Técnicos%'
  AND profissional_nome NOT ILIKE 'Combinar Consulta%'
ORDER BY profissional_nome, prioridade, profissional_id;

GRANT SELECT ON public.vw_cronograma_profissionais_salas TO authenticated;

COMMENT ON VIEW public.vw_cronograma_profissionais_salas IS
  'Profissionais oferecidos no dropdown de "Alocar sessão livre" (Ocupação de Salas). União dos dois pipelines TiTa para não esconder quem foi cadastrado depois da rodada diária do sync-grade-csv — ver 20260827120000.';

-- vw_remuneracao_profissionais_roster (Config → Capacidade do profissional) tem
-- a MESMA janela de atraso, e deliberadamente NÃO foi alterada aqui: ela devolve
-- `terapia_principal` a partir de terapia_exibicao_nome, coluna que
-- grade_profissionais_tita nomeia diferente (terapia_exibicao) e preenche por
-- outro caminho. Unir as fontes ali mudaria o VALOR devolvido, não só o conjunto
-- de nomes — é outra entrega, com outra validação.
