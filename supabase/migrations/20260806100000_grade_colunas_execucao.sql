-- Fase 2.1 — Colunas de EXECUÇÃO em csv_grades_profissionais.
--
-- Contexto medido em 2026-08-06 contra a própria API da TiTa (junho inteiro,
-- 19.053 linhas). A API `csv_grade_profissionais` devolve 42 colunas; o sync
-- gravava 21 e descartava, entre as outras, todo o bloco que descreve o que de
-- fato ACONTECEU na sessão. Duas descobertas motivam esta migration:
--
-- 1. A API tem DUAS colunas de status, e só a menos informativa era capturada:
--
--      "Status do Agendamento" (col 14) → Agendado / Livre / Sem Agendamento
--                                          ↑ é a que virou status_agendamento
--      "Status"                (col 26) → Realizado          7.890
--                                         Planejado/Pendente 5.738
--                                         Em Conflito        2.926
--                                         Cancelado          2.489
--
--    Estava registrado no projeto que "o status nunca é Realizado/Falta — a
--    tabela registra intenção, não execução". Isso é verdade sobre a TABELA e
--    falso sobre a API: ela entrega execução para data passada, completa.
--
-- 2. A evolução (tratativa) vem POR LINHA, no grão de profissional-sessão, que é
--    exatamente o grão do pagamento. Prova medida — mesmo paciente, mesmo
--    horário, duas profissionais, tratativas diferentes:
--
--      mateus muniz dos santos jardim | 08:40
--        Bruna Ferreira Araujo    Possui Tratativa = Não
--        Willian da Silva Santos  Possui Tratativa = Sim
--
--    Qualquer chave por (paciente, data, hora) funde essas duas linhas e paga
--    errado. É por isso que cco.atendimentos (session_key = sha256(paciente ‖
--    data ‖ hora)) não serve como fonte de remuneração, e por isso a captura
--    mora aqui, onde a linha já é por profissional.
--
-- Hoje /relacionamento-prestador/{rp,individual,analise,historico} depende de um
-- upload manual desse mesmo relatório. Verificado: as 42 colunas que a API
-- devolve são IDÊNTICAS, na mesma ordem e com os mesmos rótulos, à lista
-- MODELOS_RELATORIOS.grade.colunasEsperadas do parser
-- (frontend/lib/remuneracao/relatorio.ts). O arquivo que a pessoa sobe É esta
-- resposta. Capturar aqui entrega ao cálculo o mesmo insumo, sem intermediário.
--
-- Nenhum índice novo: a passada de execução recorta por data e o
-- idx_csv_grades_data_unidade já atende. Medir antes de acrescentar.

ALTER TABLE public.csv_grades_profissionais
  ADD COLUMN IF NOT EXISTS status_execucao             text,
  ADD COLUMN IF NOT EXISTS justificativa               text,
  ADD COLUMN IF NOT EXISTS possui_tratativa            boolean,
  ADD COLUMN IF NOT EXISTS tratativa_profissional_id   bigint,
  ADD COLUMN IF NOT EXISTS tratativa_profissional_nome text,
  ADD COLUMN IF NOT EXISTS tratativa_criada_em         timestamptz,
  ADD COLUMN IF NOT EXISTS tratativa_origem            text,
  ADD COLUMN IF NOT EXISTS evolucao_vinculo            text,
  ADD COLUMN IF NOT EXISTS criado_em_tita              timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_em_tita            timestamptz;

COMMENT ON COLUMN public.csv_grades_profissionais.status_execucao IS
  'TiTa "Status" (col 26) — o que aconteceu: Realizado / Planejado-Pendente / Em Conflito / Cancelado. Não confundir com status_agendamento (col 14: Agendado/Livre), que diz se o horário está ocupado. O cálculo de remuneração consome este campo por um único caminho, isCancelado() — um teste de substring por "cancel" — então os três valores não-cancelados são equivalentes para ele.';

COMMENT ON COLUMN public.csv_grades_profissionais.justificativa IS
  'TiTa "Justificativa" (col 27). Usada junto com status_execucao para distinguir falta do paciente de cancelamento por outro motivo (ver presencaTita em frontend/lib/remuneracao/relatorio.ts).';

COMMENT ON COLUMN public.csv_grades_profissionais.possui_tratativa IS
  'TiTa "Possui Tratativa" (col 34) — a evolução clínica foi registrada nesta sessão, por este profissional. É o insumo central do Pagamento por Evolução. NULL = ainda não capturado (linha anterior a esta migration ou fora da janela de recaptura); false = capturado e não evoluído.';

COMMENT ON COLUMN public.csv_grades_profissionais.tratativa_profissional_nome IS
  'TiTa "Nome Profissional Tratativa" (col 36) — quem evoluiu. Quando difere de profissional_nome, o cálculo classifica a sessão como "Substituição" (202 casos em junho/2026).';

COMMENT ON COLUMN public.csv_grades_profissionais.tratativa_criada_em IS
  'TiTa "Criação Tratativa" (col 37), instante em que a evolução foi registrada. Chega como "2026-06-08 08:37:17", horário de São Paulo sem fuso — o sync anexa -03:00 (o Brasil não observa horário de verão desde 2019). Distribuição do atraso sessão→evolução medida em 7.981 evoluções de junho/2026: 75,8% no mesmo dia, p90=3d, p95=6d, p99=12d, máximo 41d. É esse número que fixa a janela de recaptura em 45 dias.';

COMMENT ON COLUMN public.csv_grades_profissionais.tratativa_origem IS
  'TiTa "Origem Tratativa" (col 38). Em junho/2026: Prontuario 2.013, Feedback 5.';

COMMENT ON COLUMN public.csv_grades_profissionais.evolucao_vinculo IS
  'TiTa "Vínculo da Evolução" (col 39): "Agendamento ativo" / "Agendamento excluído" / "Sem agendamento". A própria fonte rotula o que o sistema hoje deduz por heurística (ausência de ID Agendamento vira "Evolução sem agendamento"). Em junho as 20 linhas dessa classe se dividiam em 10 "Agendamento excluído" e 10 "Sem agendamento" — casos com tratamento diferente antes de pagar, que a heurística funde.';

COMMENT ON COLUMN public.csv_grades_profissionais.criado_em_tita IS
  'TiTa "Agendamento Criado Em" (col 40).';

COMMENT ON COLUMN public.csv_grades_profissionais.excluido_em_tita IS
  'TiTa "Agendamento Excluído Em" (col 41). Permite registrar que a TiTa apagou a sessão SEM apagá-la aqui — que é a razão de existir do congelamento.';
