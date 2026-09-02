-- =============================================================================
-- Configurar a criação automática do card de inclusão de terapia no ClickUp
-- =============================================================================
-- Ainda NÃO EXECUTAR. Este arquivo é o roteiro do "passo zero": ele só faz
-- sentido depois que a migration da outbox existir e que os UUIDs tiverem sido
-- descobertos. Está aqui para que a descoberta seja feita UMA vez e fique
-- registrada — a mesma disciplina de 20260825_clickup_ids_healthcheck.sql.
--
-- O CONTEXTO EM UMA LINHA
-- Quando o terapêutico inclui uma terapia nova em /cronograma/ocupacao-paciente,
-- hoje ele precisa lembrar de preencher um formulário no ClickUp para avisar o
-- cronograma. Em 09/2026 alguém esqueceu e a sessão glosou. A automação passa a
-- criar o card sozinha, no ato da implantação.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — achar o list_id (a URL do formulário NÃO o contém)
-- ─────────────────────────────────────────────────────────────────────────────
-- O token NÃO entra neste arquivo (o repositório é público). Ele já existe como
-- secret CLICKUP_TOKEN das Edge Functions — o mesmo que serve glosa e
-- healthcheck. Token pessoal vai CRU no header, sem "Bearer".
--
-- ACHADO DE 2026-09-02, e é o motivo de este passo existir: supor que o trecho
-- do meio da URL do formulário
--
--     forms.clickup.com/9011600909/f/8cj47gd-10171/NS6NIG90F6VS01DDQQ
--
-- fosse o list_id está ERRADO. A API responde
--     400 {"err":"validateListIDEx List ID invalid","ECODE":"INPUT_003"}
-- — 400 e não 404, isto é, recusou o FORMATO antes de procurar. List id na v2 é
-- NUMÉRICO (ex.: 901234567); aquele trecho é o slug público do formulário, um
-- objeto diferente, e nenhuma manipulação de string o converte. Só se chega ao
-- list_id navegando spaces -> folders -> lists:
--
--   PowerShell:
--     $env:CLICKUP_TOKEN="pk_..."
--     node supabase/snippets/achar_lista_pacientes_clickup.mjs
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — descobrir os UUIDs dos campos
-- ─────────────────────────────────────────────────────────────────────────────
--     $env:CLICKUP_LIST_ID="<o numérico do passo 1>"
--     node supabase/snippets/descobrir_campos_lista_pacientes.mjs
--
-- O script é SOMENTE LEITURA e imprime, para cada campo da lista, o id e — nos
-- dropdowns — o UUID de cada opção. É esse UUID que a API exige na criação; o
-- texto da opção NÃO é aceito.
--
-- Ele também lista as FORM VIEWS da lista com seus public_url: a lista certa é
-- aquela cuja form view termina em NS6NIG90F6VS01DDQQ. É assim que se confirma
-- que se está mexendo na lista do formulário, e não numa homônima.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 3 — o que já se sabe sem precisar da API
-- ─────────────────────────────────────────────────────────────────────────────
-- Valores dos dropdowns, confirmados pelo usuário em 2026-09-02:
--
--   Origem da Solicitação : Terapêutico            <- constante
--   Motivo                : Alteração de Cronograma <- ÚNICA opção existente
--   Unidade               : Ambiente Natural, Fazendinha, Padre Miguel,
--                           Real Saúde, Realengo, Sede
--   Tipo de Autorização   : Acordo, Convencional Convênio, Liminar,
--                           Parceria, Particular, Penhora
--
-- DUAS CONSEQUÊNCIAS QUE NÃO SÃO ÓBVIAS:
--
-- 1. "Motivo" tem uma opção só. Ele NÃO distingue inclusão de alta, de
--    desligamento ou de troca de profissional — o formulário serve a todos esses
--    casos. Quem distingue é o texto livre "Descreva a solicitação". Por isso a
--    Edge Function monta esse texto com cuidado: é ele que diz ao cronograma o
--    que de fato aconteceu.
--
-- 2. "Tipo de Autorização" JÁ EXISTE no Pulsar. Liminar, Penhora e Acordo são,
--    letra por letra, a coluna origem_judicial de
--    cadastros_pacientes_altas_individualidades (migration 20260831120000,
--    espelhada em ORIGENS_JUDICIAIS de frontend/types/laudos.ts). A derivação:
--
--      origem_judicial preenchida       -> o próprio valor
--      origem_judicial NULL + convênio  -> Convencional Convênio
--      origem_judicial NULL + particular-> Particular
--
--    "Parceria" não tem origem em NENHUMA tabela (grep não acha o termo no
--    repositório inteiro). Ou existe regra de negócio que o usuário conhece, ou
--    esses poucos casos são ajustados à mão no card.
--
-- Unidade é 1:1 e não precisa de normalização: cronograma_salas.unidade_nome tem
-- exatamente Fazendinha / Padre Miguel / Realengo (seed 20260716160000), a mesma
-- grafia do formulário. As outras três opções são unidades que o Pulsar não
-- conhece — o de-para simplesmente não as produz.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 4 — gravar (SÓ depois da migration da outbox)
-- ─────────────────────────────────────────────────────────────────────────────
-- Substituir <list-id-numerico> pelo valor do passo 1 e os <uuid-...> pelos que
-- o script do passo 2 imprimir.
--
-- Estrear apontando para uma lista de TESTE, nunca direto na PACIENTES: foi
-- assim que o healthcheck estreou (canal tecnologia-dev), e é o que permite
-- conferir o card de olho antes de o setor receber o primeiro de verdade.
-- Virar para produção depois é um UPDATE, sem redeploy.

/*
UPDATE public.inclusoes_terapia_config
   SET ativo               = false,          -- ligar só depois de conferir o card de teste
       clickup_workspace_id = '9011600909',  -- "Grupo Universo ABA - Saúde e Inclusão"
       -- NUMÉRICO, do passo 1. NÃO é o '8cj47gd-10171' da URL do formulário:
       -- aquele é o slug do form, e a API o recusa com 400/INPUT_003 (testado
       -- em 2026-09-02).
       clickup_list_id      = '<list-id-numerico>',
       campos = jsonb_build_object(
         'origem_solicitacao', jsonb_build_object(
            'field_id', '<uuid-campo-origem>',
            'valor',    '<uuid-opcao-terapeutico>'),
         'motivo', jsonb_build_object(
            'field_id', '<uuid-campo-motivo>',
            'valor',    '<uuid-opcao-alteracao-de-cronograma>'),
         'convenio', jsonb_build_object(
            'field_id', '<uuid-campo-convenio>',
            'opcoes',   jsonb_build_object(
               -- valor do Pulsar (convenio_nome) -> uuid da opção no ClickUp
               'ASSIM', '<uuid>'
            )),
         'tipo_autorizacao', jsonb_build_object(
            'field_id', '<uuid-campo-tipo>',
            'opcoes',   jsonb_build_object(
               'Liminar',              '<uuid>',
               'Penhora',              '<uuid>',
               'Acordo',               '<uuid>',
               'Convencional Convênio','<uuid>',
               'Particular',           '<uuid>'
            )),
         'unidade', jsonb_build_object(
            'field_id', '<uuid-campo-unidade>',
            'opcoes',   jsonb_build_object(
               'Realengo',     '<uuid>',
               'Padre Miguel', '<uuid>',
               'Fazendinha',   '<uuid>'
            )),
         'paciente',    jsonb_build_object('field_id', '<uuid>'),
         'descricao',   jsonb_build_object('field_id', '<uuid>'),
         'solicitante', jsonb_build_object('field_id', '<uuid>'),
         'vigencia',    jsonb_build_object('field_id', '<uuid>')
       ),
       updated_at = now()
 WHERE id = 1;
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- OPERAÇÃO DO DIA A DIA
-- ─────────────────────────────────────────────────────────────────────────────

-- O que está pendente de envio, e há quanto tempo.
/*
SELECT id, paciente_nome, convenio_nome, unidade_nome,
       jsonb_array_length(sessoes) AS qtd_sessoes,
       criado_em, tentativas, left(ultimo_erro, 120) AS erro
  FROM public.inclusoes_terapia
 WHERE enviado_em IS NULL
 ORDER BY criado_em;
*/

-- O que falhou por de-para incompleto (convênio/unidade sem opção correspondente).
-- Esta é a consulta que importa depois de o ClickUp ganhar uma opção nova: a
-- automação é fail-loud de propósito, então a linha fica pendente com o erro em
-- vez de criar um card com o campo vazio.
/*
SELECT paciente_nome, convenio_nome, unidade_nome, ultimo_erro, tentativas
  FROM public.inclusoes_terapia
 WHERE enviado_em IS NULL AND ultimo_erro IS NOT NULL
 ORDER BY criado_em DESC;
*/

-- Cards criados por dia, para saber o volume real (dimensiona o lote da Edge
-- Function e mostra se o formulário manual já pode sair de circulação).
/*
SELECT (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
       count(*) AS cards
  FROM public.inclusoes_terapia
 WHERE enviado_em IS NOT NULL
 GROUP BY 1 ORDER BY 1 DESC;
*/
