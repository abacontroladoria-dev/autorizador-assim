-- Fase 2.1 — Concentrar a LEITURA de csv_grades_profissionais em um ponto só.
--
-- Antes desta migration havia 14 consultas espalhadas por 8 arquivos, cada uma
-- repetindo (ou esquecendo) os mesmos filtros. Duas consequências medidas:
--
--   • `ativo = true` estava ausente em convenioValores.service.ts — as três
--     listas de opções (convênio, terapia, paciente) enxergavam linha inativada.
--   • `profissional_cpf` continuava legível por qualquer authenticated, o
--     pendente registrado em SECURITY_CHECKLIST.md ("csv_grades_profissionais
--     aberta pra qualquer authenticated"), cujo passo 1 é exatamente "mapear
--     todas as telas/hooks que fazem .from('csv_grades_profissionais')".
--
--     ATENÇÃO: isto NÃO fecha aquele pendente. As views são security_invoker,
--     então quem lê por elas continua precisando de SELECT na tabela — e a
--     policy "Allow select for authenticated ... USING (true)" segue de pé.
--     O que muda é que nenhuma leitura da aplicação traz mais o CPF; revogar o
--     acesso direto à tabela é o passo seguinte, e só fica seguro DEPOIS que
--     todos os consumidores estiverem na view, que é o que esta migration faz.
--
-- A vw_grade_base da Fase 1 não servia como esse ponto único: ela fixava
-- `unidade_id = 280` e `status_agendamento = 'Agendado'` no corpo da view, e
-- boa parte dos consumidores não pode aceitar nem um nem outro —
-- buscarGradeComparativo precisa de TODAS as unidades (é o que distingue o
-- Comparativo de Sessões do fluxo operacional), e a busca de reposição manual
-- consulta exclusivamente slots 'Livre'. Uma view que os exclui deixaria metade
-- dos consumidores na tabela crua, que é a situação que se quer encerrar.
--
-- Esta migration reposiciona a divisão:
--
--   vw_grade_base         — invariantes que NINGUÉM deve poder desligar:
--                           linha ativa, sem CPF, sem profissional de teste.
--                           Recorte (unidade, status, data) vira WHERE.
--   vw_grade_atendimentos — o recorte de longe mais pedido (11 dos 14 sites),
--                           definido SOBRE a base, não em paralelo a ela.
--
-- A view da Fase 1 não tinha nenhum consumidor de aplicação — só o script
-- scripts/validar-fase1-grade.sql — então alargá-la não regride tela alguma.

-- ─── 1. Base ────────────────────────────────────────────────────────────────
--
-- DROP + CREATE, e não CREATE OR REPLACE: o REPLACE só aceita ACRESCENTAR
-- colunas no fim da lista, e aqui as dez colunas de execução entram no meio
-- (logo depois de `origem`, antes dos recortes de calendário) para manter
-- identidade e execução juntas. Com REPLACE isto falharia no db push.
--
-- A ordem do DROP importa: as duas views derivadas dependem da base, então caem
-- primeiro. Sem isso o último DROP exigiria CASCADE — que aqui derrubaria
-- silenciosamente qualquer outro dependente futuro, e não é o que se quer.
DROP VIEW IF EXISTS public.vw_grade_opcoes;
DROP VIEW IF EXISTS public.vw_grade_atendimentos;
DROP VIEW IF EXISTS public.vw_grade_base;

CREATE VIEW public.vw_grade_base
WITH (security_invoker = true) AS
SELECT
  id,
  data,
  dia_semana,
  hora_inicial,
  hora_final,
  paciente_id,
  paciente_nome,
  profissional_id,
  profissional_nome,
  terapia_id,
  terapia_nome,
  terapia_exibicao_id,
  terapia_exibicao_nome,
  sala_nome,
  unidade_id,
  unidade_nome,
  convenio_nome,
  status_agendamento,
  tita_agendamento_id,
  origem,

  -- Execução (Fase 2, migration 20260806100000). Ficaram de fora da view da
  -- Fase 1 apenas porque ainda não existiam. Sem elas, todo consumidor que
  -- quisesse saber o que de fato ACONTECEU na sessão teria de voltar à tabela.
  -- Semântica medida contra julho/2026 — ler antes de tirar conclusão:
  -- possui_tratativa NÃO é um segundo sinal independente de status_execucao,
  -- é praticamente o mesmo bit ('Realizado', 99,96%); 'Em Conflito' é paciente
  -- sobreposto e quase todo ele é paciente-fantasma administrativo; e
  -- justificativa só existe em 'Cancelado'.
  status_execucao,
  justificativa,
  possui_tratativa,
  tratativa_profissional_id,
  tratativa_profissional_nome,
  tratativa_criada_em,
  tratativa_origem,
  evolucao_vinculo,
  criado_em_tita,
  excluido_em_tita,

  EXTRACT(year  FROM data)::int AS ano,
  EXTRACT(month FROM data)::int AS mes,
  to_char(data, 'YYYY-MM')      AS ano_mes,
  -- Semana ISO do ano, exposta só para quem precisar cruzar com relatório
  -- externo. Os flags abaixo NÃO usam esta coluna.
  EXTRACT(week  FROM data)::int AS semana_iso,

  (EXTRACT(day FROM data)::int - 1) / 7 + 1       AS semana_do_mes,
  (EXTRACT(day FROM data)::int - 1) / 7 + 1 = 1   AS is_primeira_semana,
  -- Último bloco de 7 dias do mês, na mesma contagem de semana_do_mes: compara
  -- o bloco do dia com o bloco do último dia do mês. Em mês de 31 dias o último
  -- bloco tem 3 dias (29–31); é o comportamento pretendido da contagem por
  -- calendário.
  (EXTRACT(day FROM data)::int - 1) / 7
    = (EXTRACT(day FROM (date_trunc('month', data) + interval '1 month' - interval '1 day'))::int - 1) / 7
                                                  AS is_ultima_semana,

  data = date_trunc('month', data)::date          AS is_primeiro_dia_mes,
  data = (date_trunc('month', data) + interval '1 month' - interval '1 day')::date
                                                  AS is_ultima_data_mes,
  -- Dia útil aqui é seg–sex; a clínica não atende fim de semana.
  EXTRACT(isodow FROM data)::int BETWEEN 1 AND 5  AS is_dia_util,

  -- Espelha exatamente a regra do trigger trg_congelar_grade_passada:
  -- true = a linha já é imutável.
  data < (now() AT TIME ZONE 'America/Sao_Paulo')::date AS is_congelado

FROM public.csv_grades_profissionais
-- Os três filtros abaixo são invariantes, não recorte. Cada um existe porque
-- esquecê-lo já produziu (ou produziria) resultado errado:
--
--   ativo             — o sync versiona em vez de apagar (20260805160000).
--                       Sem o filtro, uma sessão remarcada aparece duas vezes;
--                       em gradeRemuneracao isso é pagar em dobro.
--   profissional_cpf  — omitido da projeção, não filtrado: pendente de
--                       segurança citado no cabeçalho.
--   profissionais de  — 'Profissional Teste' / 'Testes Técnicos' / 'Combinar
--   teste               Consulta' não são pessoas que atendem. Já eram
--                       descartados no cálculo de remuneração (PROFS_IGNORAR
--                       em lib/remuneracao/constants.ts); aqui a regra passa a
--                       valer para todo consumidor, inclusive os de cronograma
--                       e salas, que não a aplicavam.
WHERE ativo
  AND COALESCE(profissional_nome, '') NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  AND COALESCE(profissional_nome, '') NOT ILIKE 'Testes Técnicos%'
  AND COALESCE(profissional_nome, '') NOT ILIKE 'Combinar Consulta%';

COMMENT ON VIEW public.vw_grade_base IS
  'Ponto único de leitura de csv_grades_profissionais. Garante linha ativa, sem profissional_cpf e sem profissional de teste; NÃO recorta unidade nem status (isso é WHERE do chamador — há consumidor legítimo de todas as unidades e de slots Livre). Traz identidade + execução + recortes de calendário. Semana = calendário do mês (1-7, 8-14, ...), não ISO.';

-- service_role explícito: a Edge Function snapshot-previsao-receitas e o
-- services/laudos/client.ts (server-only) leem por esta view com a chave de
-- serviço. O GRANT para `authenticated` não os cobre, e sem isto os dois
-- passariam a receber 403 — falha silenciosa num job que roda sozinho.
GRANT SELECT ON public.vw_grade_base TO authenticated, service_role;

-- ─── 2. Recorte de atendimento ──────────────────────────────────────────────
--
-- 'Agendado' + unidade 280 é o que 11 dos 14 consumidores querem dizer quando
-- dizem "a grade". Vale a view nomeada por dois motivos: evita repetir os dois
-- filtros em cada chamada, e dá um lugar único para corrigir caso a clínica
-- passe a operar uma segunda unidade.
--
-- Slots 'Livre' e 'Sem Agendamento' não são atendimento — ambos vêm sem
-- tita_agendamento_id, e o histórico semeado do backup .xls também não os tem,
-- então incluí-los faria a série temporal mudar de significado em 2026-07-01.

CREATE VIEW public.vw_grade_atendimentos
WITH (security_invoker = true) AS
SELECT * FROM public.vw_grade_base
WHERE status_agendamento = 'Agendado'
  AND unidade_id = 280;

COMMENT ON VIEW public.vw_grade_atendimentos IS
  'vw_grade_base restrita a atendimento real da unidade 280 (status_agendamento = Agendado). Recorte mais usado; para todas as unidades ou para slots Livre, consultar vw_grade_base direto.';

GRANT SELECT ON public.vw_grade_atendimentos TO authenticated, service_role;

-- ─── 3. Valores distintos para os formulários ───────────────────────────────
--
-- Convênio, terapia e paciente dos formulários de cadastro de valores são
-- sempre escolhidos a partir do que existe de fato na agenda — nunca texto
-- livre. São as únicas consultas da grade SEM recorte de data, e por isso as
-- mais caras do sistema.
--
-- Como estava (medido com EXPLAIN contra 96.730 linhas): o frontend paginava a
-- grade inteira, de mil em mil, uma vez por lista. Em produção (~148 mil
-- linhas) isso é ~148 requisições por lista, 444 no total — e cada página
-- refaz um SEQ SCAN COMPLETO, porque OFFSET não pula leitura. São ~66 MB de
-- buffers por página. A tabela tinha 54 mil linhas quando aquele código foi
-- escrito; o seed de Jan–Jun da Fase 1 levou a 148 mil e o custo subiu junto.
-- Este projeto já recebeu aviso de Disk IO da Supabase.
--
-- Como fica: 497 opções (440 pacientes, 42 terapias, 15 convênios) em UMA
-- requisição. O LATERAL VALUES emite as três colunas por linha lida, então o
-- DISTINCT resolve tudo em UMA varredura — três SELECT DISTINCT separados
-- fariam três.
--
-- O formato é largo (tipo, id, nome) de propósito: uma view por lista seriam
-- três objetos para manter e três idas ao banco, e o consumidor já separa por
-- `tipo` em memória. `id` é NULL para convênio porque a fonte não tem
-- convenio_id — só nome.
--
-- Não filtra paciente fictício aqui: isFakePatient casa por PREFIXO
-- ('Supervisor', 'Alinhamento', …) e continua em JS, onde a lista é
-- compartilhada com o cálculo de remuneração. Sobre 497 linhas é irrelevante.

CREATE VIEW public.vw_grade_opcoes
WITH (security_invoker = true) AS
SELECT DISTINCT v.tipo, v.id, v.nome
  FROM public.vw_grade_base g,
       LATERAL (VALUES ('convenio', NULL::bigint,  g.convenio_nome),
                       ('terapia',  g.terapia_id,  g.terapia_nome),
                       ('paciente', g.paciente_id, g.paciente_nome)) AS v(tipo, id, nome)
 WHERE v.nome IS NOT NULL;

COMMENT ON VIEW public.vw_grade_opcoes IS
  'Valores distintos de convênio, terapia e paciente vistos na agenda real, para os selects de cadastro de valores. Formato largo: tipo IN (convenio, terapia, paciente), id NULL para convênio (a fonte não tem convenio_id). Substitui a paginação da grade inteira — 497 linhas em 1 requisição no lugar de ~444 requisições com seq scan cada.';

GRANT SELECT ON public.vw_grade_opcoes TO authenticated, service_role;

-- ─── 4. Fechar anon explicitamente ──────────────────────────────────────────
--
-- Os default privileges do Supabase concedem em toda view nova do schema
-- public. Verificado no dump de produção de 2026-08-06: a vw_grade_base da
-- Fase 1 está lá com `GRANT ALL ... TO anon`, sem ninguém ter pedido.
--
-- Hoje isso não vaza nada — as views são security_invoker e a policy da tabela
-- base não contempla `anon`, então a leitura anônima volta 0 linhas (medido:
-- Content-Range `*/0`). Mas a proteção está vindo só da RLS; basta alguém
-- trocar a view para security_definer, ou criar uma policy para anon, para que
-- nome de paciente e agenda inteira fiquem legíveis com a chave pública
-- embutida no JS. Foi exatamente o achado de 20260724190000 em
-- csv_reposicao_faltas.
--
-- Nenhuma rota pública usa a grade: /tv (a única tela sem login) lê apenas
-- chamada_paciente e fila_autorizacoes. Revogar é seguro e deixa a intenção
-- registrada em vez de depender de default privilege.
REVOKE ALL ON public.vw_grade_base         FROM anon;
REVOKE ALL ON public.vw_grade_atendimentos FROM anon;
REVOKE ALL ON public.vw_grade_opcoes       FROM anon;
