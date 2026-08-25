-- Autorizações avulsas: a solicitação que não nasce de uma sessão.
--
-- O PROBLEMA
-- Existem autorizações que a equipe tira à mão, direto no site da ASSIM, porque não
-- correspondem a sessão nenhuma da agenda. O /solicitar não alcança esses casos por
-- construção: `listar_central_autorizacoes` parte de `agenda_tita_autorizacao`, então sem
-- sessão não existe card para clicar. O trabalho ficava fora do Pulsar inteiro — sem
-- registro de quem pediu, sem motivo, e sem o robô.
--
-- O QUE MUDA
-- Uma página nova enfileira a solicitação como qualquer outra e o robô a executa. Nada no
-- robo-autorizador muda: `robo_buscar_tarefa` (20260813100200:148) devolve 9 campos
-- (paciente_nome, empresa, matricula, dep, crm, crm_uf, nome_medico, tuss) e não pergunta
-- de onde a linha veio — nem lê `data_atendimento`/`horario`. Uma linha 'pendente' com o
-- `machine_id` da estação é tudo de que ele precisa.
--
-- POR QUE UMA COLUNA, E NÃO UMA TABELA NOVA
-- Porque a linha PRECISA estar em `fila_autorizacoes` para o robô pegá-la. E porque tudo
-- o que já existe em volta da fila passa a valer de graça: o trigger de `criado_por`
-- (20260730000000), o de `crm_uf` (20260728040000), o realtime que as telas escutam, o
-- `robo_concluir_tarefa`, a origem da guia (20260825000000) e a RLS. Uma tabela paralela
-- duplicaria os oito triggers e o robô teria de aprender uma segunda fonte.
--
-- ONDE A AVULSA APARECE, E ONDE NÃO
-- Foi conferido, não presumido:
--
--   Conferência / Auditoria   invisível já.   `fn_blocos_assim` (20260824020000:111) e a
--                             CTE `blocos_auditoria` de get_auditoria_assim_periodo partem
--                             de `agenda_tita`. Sem sessão, não há bloco.
--   Reconciliação (órfãs)     não vira órfã já. `get_guias_orfas` (20260824010000:119-124)
--                             exclui guia capturada pelo Pulsar via NOT EXISTS em
--                             `numero_autorizacao` + janela de 5 min.
--   central-pacientes         POLUIRIA. A parte 1 de `vw_central_pacientes` é
--                             `FROM fila_autorizacoes fa LEFT JOIN agenda_tita_autorizacao`,
--                             então a avulsa entraria como card fantasma — sem terapia, sem
--                             profissional, sem unidade. É o que o bloco 4 conserta.
--
-- ORDEM: aplicar depois de 20260825010000_origem_da_guia_nas_leituras.sql, de onde o bloco
-- 4 copia a definição viva da view. Aplicar fora de ordem = a view perde
-- `numero_autorizacao_origem` e a Ficha Operacional volta a não saber a origem da guia.

-- ---------------------------------------------------------------------------
-- 1. O marcador
-- ---------------------------------------------------------------------------
-- `not null default false` de propósito: nenhuma linha existente muda, nenhum backfill,
-- e toda leitura futura pode escrever `avulsa = false` sem se preocupar com NULL — que
-- num filtro de exclusão seria exatamente o bug (`fa.avulsa = false` descartaria a linha
-- antiga se a coluna fosse nullable).
ALTER TABLE public.fila_autorizacoes
  ADD COLUMN IF NOT EXISTS avulsa        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_avulsa text;

COMMENT ON COLUMN public.fila_autorizacoes.avulsa IS
  'Solicitação que não corresponde a sessão nenhuma da agenda, pedida na página /autorizacoes-avulsas. Excluída da parte 1 de vw_central_pacientes — sem sessão, o card não tem terapia, profissional nem unidade.';
COMMENT ON COLUMN public.fila_autorizacoes.motivo_avulsa IS
  'Por que a autorização foi pedida fora da agenda. Obrigatório na tela: sem sessão para explicar a linha, é o único registro de intenção que sobra.';

-- Serve a listagem da página e o painel da Reconciliação, que sempre filtram por avulsa e
-- ordenam por data. Parcial: a fila tem centenas de milhares de linhas e praticamente
-- nenhuma é avulsa, então o índice cheio seria quase todo desperdício — e esta tabela já
-- foi origem de esgotamento de pool por varredura (20260824000000).
CREATE INDEX IF NOT EXISTS idx_fila_avulsa
  ON public.fila_autorizacoes (data_atendimento DESC)
  WHERE avulsa;

-- ---------------------------------------------------------------------------
-- 2. O mapa terapia -> TUSS para a tela
-- ---------------------------------------------------------------------------
-- A página precisa oferecer as terapias possíveis, e cada uma tem de trazer o TUSS certo.
-- A fonte é `tuss_da_sessao()` — o mapa ÚNICO (reference_tuss_da_sessao_mapa_unico) —,
-- alcançado através de `agenda_tita_autorizacao`, que já o aplica no CROSS JOIN LATERAL e
-- já descarta o que dá TUSS nulo. Re-inlinar o CASE em TypeScript criaria a terceira
-- cópia divergente do mapa; a segunda já custou uma sessão inteira de depuração.
--
-- A janela de 90 dias não é recorte de negócio, é custo: a resposta é a mesma lista de ~12
-- pares com ou sem ela, e sem filtro isto varreria a agenda inteira.
CREATE OR REPLACE FUNCTION public.listar_terapias_tuss()
RETURNS TABLE (terapia text, codigo_tuss text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
-- Declarado DENTRO da função: `create or replace` descarta o proconfig posto por
-- ALTER FUNCTION, calado (reference_create_or_replace_perde_proconfig).
SET statement_timeout = '5s'
AS $$
  SELECT DISTINCT at.terapia_exibicao_nome, at.codigo_tuss
  FROM public.agenda_tita_autorizacao at
  WHERE at.data_atendimento >= current_date - 90
  ORDER BY 1
$$;

COMMENT ON FUNCTION public.listar_terapias_tuss() IS
  'Pares terapia -> TUSS para a página de autorizações avulsas, derivados de tuss_da_sessao() através de agenda_tita_autorizacao. Nunca re-inlinar o CASE do TUSS no cliente.';

REVOKE ALL ON FUNCTION public.listar_terapias_tuss() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_terapias_tuss() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Os pacientes que a página pode oferecer
-- ---------------------------------------------------------------------------
-- Só paciente da ASSIM aparece na tela. A pergunta "este paciente é da ASSIM?" NÃO
-- se responde pelo cadastro: `pacientes.convenio_nome` é um CACHE da linha mais
-- recente de `agenda_tita`, e convênio no TiTa é POR AGENDAMENTO
-- (reference_convenio_carteirinha_tita). Um paciente da ASSIM cuja última sessão
-- foi Particular tem o cache dizendo 'Particular', e filtrar por ele o esconderia
-- da tela — calado, e justamente no caso em que alguém precisa de uma avulsa.
--
-- Então a fonte é a agenda: quem TEM sessão ASSIM na janela é paciente da ASSIM.
-- Mesmo predicado de `fn_blocos_assim` (20260824020000:128), inclusive o
-- `ativo = true` — ler `agenda_tita` sem ele traz terapia duplicada
-- (project_fix_ativo_view).
--
-- Devolve também carteirinha, CRM, UF e médico, que é tudo o que o formulário
-- precisa: uma chamada em vez de uma lista + um round-trip por paciente escolhido.
--
-- A janela de 180 dias é generosa de propósito — um paciente que não aparece em 6
-- meses não é candidato a avulsa hoje —, e existe por custo: sem ela isto varre a
-- agenda inteira, e esta é a tabela que já esgotou o pool uma vez (20260824000000).
CREATE OR REPLACE FUNCTION public.listar_pacientes_assim()
RETURNS TABLE (
  paciente_id        bigint,
  paciente_nome      text,
  numero_carteirinha text,
  crm                text,
  crm_uf             text,
  nome_medico        text,
  ultima_sessao      date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '10s'
AS $$
  WITH assim AS (
    -- DISTINCT ON pega a linha MAIS RECENTE de cada paciente: é dela que vem a
    -- carteirinha, que pode ter sido corrigida no TiTa depois de um erro.
    SELECT DISTINCT ON (at.paciente_id)
           at.paciente_id,
           at.paciente_nome,
           at.numero_carteirinha,
           at.data_atendimento
    FROM public.agenda_tita at
    WHERE at.data_atendimento >= current_date - 180
      AND at.ativo = true
      AND at.convenio_nome ILIKE '%assim%'
      AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo', 'Notificação Prévia'])
    ORDER BY at.paciente_id, at.data_atendimento DESC
  )
  SELECT
    a.paciente_id,
    a.paciente_nome,
    a.numero_carteirinha,
    o.crm,
    o.crm_uf,
    o.nome_medico,
    a.data_atendimento AS ultima_sessao
  FROM assim a
  -- `ficticio` é a flag canônica de paciente-não-pessoa (Horário Bloqueado, Ainda
  -- não selecionado e afins) e substitui os quatro filtros SQL divergentes que
  -- existiam espalhados. Os dois nomes acima ficam como piso, para o caso de o
  -- paciente não estar no cadastro.
  LEFT JOIN public.pacientes p ON p.tita_paciente_id = a.paciente_id
  -- CRM, UF e médico pela MESMA consulta do trigger `fn_set_crm_uf`
  -- (20260728040000): por paciente_id, `updated_at` desc. Ser idêntica é o ponto —
  -- a tela mostra o que o banco gravaria se o campo chegasse nulo.
  LEFT JOIN LATERAL (
    SELECT ao.crm, ao.crm_uf, ao.nome_medico
    FROM public.agenda_orbita ao
    WHERE ao.paciente_id = a.paciente_id::text
    ORDER BY ao.updated_at DESC NULLS LAST
    LIMIT 1
  ) o ON true
  WHERE COALESCE(p.ficticio, false) = false
  ORDER BY a.paciente_nome
$$;

COMMENT ON FUNCTION public.listar_pacientes_assim() IS
  'Pacientes com sessão ASSIM nos últimos 180 dias, com carteirinha, CRM, UF e médico solicitante — a lista da página de autorizações avulsas. A pergunta "é da ASSIM?" é respondida pela AGENDA, não por pacientes.convenio_nome, que é cache da última sessão e mente quando a última foi de outro convênio.';

REVOKE ALL ON FUNCTION public.listar_pacientes_assim() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_pacientes_assim() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Catálogo de permissão
-- ---------------------------------------------------------------------------
-- Quem usa: `recepcao` e `admin`. São exatamente os papéis que já têm INSERT em
-- `fila_autorizacoes` (20260610000011:330) — nenhuma policy nova é necessária, e a decisão
-- de 2026-08-17 de NÃO dar INSERT ao papel `autorizacao` (20260817120000:60-73) fica de pé.
--
-- O default por papel vive em frontend/lib/permissions/routes.ts (roleDefaults). Esta
-- tabela é o catálogo que alimenta /admin/permissoes e os overrides por usuário.
-- O código usa underscore (`autorizacoes_avulsas`), como todos os outros do
-- catálogo, e tem de bater LETRA POR LETRA com a chave de CODIGO_PARA_ROTAS em
-- frontend/lib/permissions/routes.ts: é por esse código que `usuarios_permissoes`
-- casa o override com a rota. Um hífen aqui e um underscore lá dariam uma
-- permissão que aparece em /admin/permissoes e não abre porta nenhuma.
INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('autorizacoes_avulsas', 'Autorizacoes Avulsas', '/autorizacoes-avulsas', 'Atendimentos',
   'Solicitar ao robo autorizacoes que nao correspondem a nenhuma sessao da agenda')
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Tirar a avulsa da central-pacientes
-- ---------------------------------------------------------------------------
-- Recriação FIEL do bloco 2 de 20260825010000_origem_da_guia_nas_leituras.sql (a definição
-- viva), com `AND fa.avulsa = false` em DOIS pontos por gêmeo:
--
--   (a) o WHERE da parte 1  -> a avulsa deixa de virar card fantasma na tela.
--   (b) o NOT EXISTS de `slots_sem_fila` -> uma avulsa cujo horário coincidisse com o de
--       uma sessão real esconderia essa sessão da parte 2. Com segundos no horário a
--       coincidência é improvável, mas "improvável" não é razão para deixar a porta aberta:
--       o custo de fechar é uma linha e o sintoma seria uma sessão desaparecida, calada.
--
-- O NOT EXISTS de `guias_sem_fila` fica INTACTO de propósito. Ali a pergunta é "esta guia
-- do relatório já foi capturada pelo Pulsar?", e a guia de uma avulsa FOI — ela tem de
-- continuar suprimindo a linha sintética da parte 3, senão a mesma autorização apareceria
-- duas vezes.
--
-- A dívida do CASE de TUSS inline em quatro cópias aqui dentro é herdada e conhecida
-- (declarada em 20260825010000): o mapa único é `public.tuss_da_sessao()`. Continua fora do
-- escopo — consertá-la de carona misturaria mudanças de risco muito diferente na mesma
-- aplicação, e é justamente por isso que ela sobreviveu a duas migrations seguidas.
DROP FUNCTION IF EXISTS public.listar_central_pacientes(date);
DROP VIEW IF EXISTS public.vw_central_pacientes;

-- ============================================================================
-- VIEW (contrato de tipo)
-- ============================================================================
CREATE VIEW public.vw_central_pacientes AS

-- Parte 1: registros que passaram pela fila
(
    SELECT DISTINCT ON (fa.id)
        fa.id,
        fa.agenda_id,
        fa.paciente_id,
        fa.paciente_nome,
        fa.data_atendimento,
        fa.horario,
        ((fa.data_atendimento::text || ' '::text) || fa.horario::text)::timestamp without time zone AS data_horario,
        fa.status,
        fa.status_assim,
        fa.tipo_falta,
        fa.completion_type,
        fa.numero_autorizacao,
        fa.numero_autorizacao_origem,
        fa.machine_id,
        fa.error_message,
        fa.execution_time_ms,
        fa.created_at,
        fa.updated_at,
        fa.assim_updated_at,
        fa.horario_autorizacao,
        fa.terapia_exibicao_id,
        fa.terapia_nome AS classificacao_terapia,
        fa.forma_autorizacao,
        ag.hora_inicial,
        ag.hora_final,
        ag.profissional_nome,
        ag.profissional_id,
        ag.terapia_nome,
        ag.terapia_exibicao_nome,
        ag.sala_nome,
        ag.clinica_nome,
        ag.convenio_nome,
        ag.responsavel_nome,
        ag.responsavel_telefone,
        ag.numero_carteirinha,
        ag.sala_nome AS unidade,
        ag.convenio_nome AS convenio,
        maq.nome AS usuario_nome,
        CASE
            WHEN fa.status = 'erro'::text             THEN 'erro'::text
            WHEN fa.status = 'processando'::text      THEN 'processando'::text
            WHEN fa.tipo_falta = 'terapeuta'::text    THEN 'falta_terapeuta'::text
            WHEN fa.tipo_falta = 'paciente'::text     THEN 'falta_paciente'::text
            -- (1) concluiu no fluxo ASSIM mas sem guia vinculada
            WHEN fa.status = ANY (ARRAY['concluido'::text, 'concluido_sem_guia'::text])
                 AND fa.numero_autorizacao IS NULL
                 AND COALESCE(fa.completion_type, 'automated'::text) = 'automated'::text
                                                      THEN 'concluido_sem_guia'::text
            WHEN fa.status_assim = 'autorizado'::text THEN 'autorizado'::text
            WHEN fa.status = 'concluido'::text        THEN 'autorizado'::text
            WHEN fa.status = 'pendente'::text         THEN 'pendente'::text
            ELSE COALESCE(fa.status, 'pendente'::text)
        END AS status_operacional,
        ctrl.profissional_substituto_nome,
        COALESCE(ctrl.profissional_substituto_nome, ag.profissional_nome) AS profissional_realizou_nome,
        (ctrl.profissional_substituto_id IS NOT NULL) AS is_substituicao,
        ctrl.status AS controle_status,
        ctrl.confirmado_em,
        fa.criado_por,
        ctrl.confirmado_por_nome
    FROM public.fila_autorizacoes fa
    LEFT JOIN public.maquinas maq ON maq.id = fa.machine_id
    LEFT JOIN public.agenda_tita_autorizacao ag ON (
        fa.paciente_id::bigint = ag.paciente_id
        AND fa.data_atendimento = ag.data_atendimento
        AND fa.horario = ag.hora_inicial
        AND lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) = lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))
    )
    LEFT JOIN LATERAL (
        SELECT ct.status, ct.profissional_substituto_id, ct.profissional_substituto_nome, ct.confirmado_em, ct.confirmado_por_nome
        FROM public.controle_terapeutico ct
        WHERE ct.tita_agendamento_id = ag.tita_agendamento_id
        ORDER BY ct.updated_at DESC NULLS LAST
        LIMIT 1
    ) ctrl ON true
    WHERE fa.id IS NOT NULL
      AND fa.avulsa = false          -- <<< avulsa não tem sessão: viraria card sem terapia
      AND (fa.status IS NOT NULL OR fa.status_assim IS NOT NULL
           OR fa.numero_autorizacao IS NOT NULL OR fa.tipo_falta IS NOT NULL)
    ORDER BY fa.id, fa.created_at DESC NULLS LAST,
             ag.updated_at DESC NULLS LAST, ag.created_at DESC NULLS LAST
)

UNION ALL

-- Parte 2: autorizados diretamente no ASSIM sem registro em fila_autorizacoes
(
    SELECT
        p2.id,
        p2.agenda_id,
        p2.paciente_id,
        p2.paciente_nome,
        p2.data_atendimento,
        p2.horario,
        p2.data_horario,
        p2.status,
        p2.status_assim,
        p2.tipo_falta,
        p2.completion_type,
        p2.numero_autorizacao,
        p2.numero_autorizacao_origem,
        p2.machine_id,
        p2.error_message,
        p2.execution_time_ms,
        p2.created_at,
        p2.updated_at,
        p2.assim_updated_at,
        p2.horario_autorizacao,
        p2.terapia_exibicao_id,
        p2.classificacao_terapia,
        p2.forma_autorizacao,
        p2.hora_inicial,
        p2.hora_final,
        p2.profissional_nome,
        p2.profissional_id,
        p2.terapia_nome,
        p2.terapia_exibicao_nome,
        p2.sala_nome,
        p2.clinica_nome,
        p2.convenio_nome,
        p2.responsavel_nome,
        p2.responsavel_telefone,
        p2.numero_carteirinha,
        p2.unidade,
        p2.convenio,
        p2.usuario_nome,
        p2.status_operacional,
        p2.profissional_substituto_nome,
        p2.profissional_realizou_nome,
        p2.is_substituicao,
        p2.controle_status,
        p2.confirmado_em,
        p2.criado_por,
        p2.confirmado_por_nome
    FROM (
        WITH
        agenda_com_tuss AS (
            SELECT
                at.id,
                at.tita_agendamento_id,
                at.paciente_id,
                at.paciente_nome,
                at.data_atendimento,
                at.hora_inicial,
                at.hora_final,
                at.profissional_id,
                at.profissional_nome,
                at.terapia_nome,
                at.terapia_exibicao_id,
                at.terapia_exibicao_nome,
                at.sala_nome,
                at.clinica_nome,
                at.convenio_nome,
                at.responsavel_nome,
                at.responsavel_telefone,
                at.numero_carteirinha,
                CASE
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text,'Psicologia ABA'::text,'Arteterapia'::text,'Arteterapia (Psicologia ABA)'::text,'Avaliação Neuropsicológica'::text,'Habilidades Sociais (Psicologia ABA)'::text]) THEN '22070384'::text
                    WHEN at.terapia_exibicao_nome = 'Fonoaudiologia'::text           THEN '22070397'::text
                    WHEN at.terapia_exibicao_nome = 'Psicomotricidade'::text         THEN '22070400'::text
                    WHEN at.terapia_exibicao_nome = 'Fisioterapia'::text             THEN '22070419'::text
                    WHEN at.terapia_exibicao_nome = 'Terapia Ocupacional'::text      THEN '22070427'::text
                    WHEN at.terapia_exibicao_nome = 'Psicopedagogia'::text           THEN '22070435'::text
                    WHEN at.terapia_exibicao_nome = 'Musicoterapia'::text            THEN '22070451'::text
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Nutrição'::text,'Terapia Alimentar'::text]) THEN '22070460'::text
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia'::text,'Fisioterapia Aquática'::text]) THEN '22070265'::text
                    WHEN at.terapia_exibicao_nome = 'Equoterapia'::text              THEN '22070257'::text
                    ELSE NULL::text
                END AS codigo_tuss
            FROM public.agenda_tita at
            WHERE at.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text,'Notificação Prévia'::text])
        ),
        slots_sem_fila AS (
            SELECT
                *,
                ROW_NUMBER() OVER (
                    PARTITION BY paciente_id, data_atendimento, codigo_tuss
                    ORDER BY hora_inicial ASC
                ) AS ordem
            FROM agenda_com_tuss
            WHERE codigo_tuss IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public.fila_autorizacoes fa
                  WHERE fa.paciente_id::bigint = agenda_com_tuss.paciente_id
                    AND fa.data_atendimento = agenda_com_tuss.data_atendimento
                    AND fa.horario = agenda_com_tuss.hora_inicial
                    AND fa.avulsa = false   -- <<< avulsa não representa esta sessão
              )
        ),
        guias_sem_fila AS (
            SELECT
                aa.*,
                ROW_NUMBER() OVER (
                    PARTITION BY aa.paciente_id, aa.data_execucao::date, aa.codigo_tuss
                    ORDER BY aa.guia ASC
                ) AS ordem
            FROM public.autorizacoes_assim aa
            WHERE aa.codigo_tuss IS NOT NULL
              -- (2) exclusão escopada por data: o número da guia recicla
              AND NOT EXISTS (
                  SELECT 1 FROM public.fila_autorizacoes fa
                  WHERE fa.numero_autorizacao = aa.guia
                    AND fa.data_atendimento BETWEEN (aa.data_execucao::date - 7)
                                                AND (aa.data_execucao::date + 7)
              )
        )
        SELECT
            (substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),1,8) ||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),9,4) ||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),13,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),17,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),21,12))::uuid AS id,
            NULL::uuid                AS agenda_id,
            s.paciente_id::text       AS paciente_id,
            s.paciente_nome,
            s.data_atendimento,
            s.hora_inicial            AS horario,
            (s.data_atendimento::text||' '::text||s.hora_inicial::text)::timestamp without time zone AS data_horario,
            'concluido'::text         AS status,
            'autorizado'::text        AS status_assim,
            NULL::text                AS tipo_falta,
            'automated'::text         AS completion_type,
            g.guia                    AS numero_autorizacao,
            -- Guia SEM linha na fila: não houve solicitação pelo Pulsar, logo ela só
            -- pode ter sido tirada no portal. O `criado_por` NULL três linhas abaixo
            -- sempre disse isso; agora dá para ler.
            'relatorio'::text         AS numero_autorizacao_origem,
            NULL::text                AS machine_id,
            NULL::text                AS error_message,
            NULL::integer             AS execution_time_ms,
            g.data_autorizacao        AS created_at,
            g.updated_at,
            g.updated_at              AS assim_updated_at,
            g.data_autorizacao        AS horario_autorizacao,
            s.terapia_exibicao_id,
            s.terapia_nome            AS classificacao_terapia,
            'automatico'::text        AS forma_autorizacao,
            s.hora_inicial,
            s.hora_final,
            s.profissional_nome,
            s.profissional_id,
            s.terapia_nome,
            s.terapia_exibicao_nome,
            s.sala_nome,
            s.clinica_nome,
            s.convenio_nome,
            s.responsavel_nome,
            s.responsavel_telefone,
            s.numero_carteirinha,
            s.sala_nome               AS unidade,
            s.convenio_nome           AS convenio,
            NULL::text                AS usuario_nome,
            'autorizado'::text        AS status_operacional,
            ctrl.profissional_substituto_nome,
            COALESCE(ctrl.profissional_substituto_nome, s.profissional_nome) AS profissional_realizou_nome,
            (ctrl.profissional_substituto_id IS NOT NULL) AS is_substituicao,
            ctrl.status               AS controle_status,
            ctrl.confirmado_em,
            NULL::text                AS criado_por,
            ctrl.confirmado_por_nome
        FROM slots_sem_fila s
        INNER JOIN guias_sem_fila g ON (
            g.paciente_id = s.paciente_id
            AND g.data_execucao::date = s.data_atendimento
            AND g.codigo_tuss = s.codigo_tuss
            AND g.ordem = s.ordem
        )
        LEFT JOIN LATERAL (
            SELECT ct.status, ct.profissional_substituto_id, ct.profissional_substituto_nome, ct.confirmado_em, ct.confirmado_por_nome
            FROM public.controle_terapeutico ct
            WHERE ct.tita_agendamento_id = s.tita_agendamento_id
            ORDER BY ct.updated_at DESC NULLS LAST
            LIMIT 1
        ) ctrl ON true
    ) p2
);

-- ============================================================================
-- RPC parametrizada
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listar_central_pacientes(p_data date)
RETURNS SETOF public.vw_central_pacientes
LANGUAGE sql STABLE SECURITY INVOKER
AS $$

-- Parte 1: registros que passaram pela fila
(
    SELECT DISTINCT ON (fa.id)
        fa.id,
        fa.agenda_id,
        fa.paciente_id,
        fa.paciente_nome,
        fa.data_atendimento,
        fa.horario,
        ((fa.data_atendimento::text || ' '::text) || fa.horario::text)::timestamp without time zone AS data_horario,
        fa.status,
        fa.status_assim,
        fa.tipo_falta,
        fa.completion_type,
        fa.numero_autorizacao,
        fa.numero_autorizacao_origem,
        fa.machine_id,
        fa.error_message,
        fa.execution_time_ms,
        fa.created_at,
        fa.updated_at,
        fa.assim_updated_at,
        fa.horario_autorizacao,
        fa.terapia_exibicao_id,
        fa.terapia_nome AS classificacao_terapia,
        fa.forma_autorizacao,
        ag.hora_inicial,
        ag.hora_final,
        ag.profissional_nome,
        ag.profissional_id,
        ag.terapia_nome,
        ag.terapia_exibicao_nome,
        ag.sala_nome,
        ag.clinica_nome,
        ag.convenio_nome,
        ag.responsavel_nome,
        ag.responsavel_telefone,
        ag.numero_carteirinha,
        ag.sala_nome AS unidade,
        ag.convenio_nome AS convenio,
        maq.nome AS usuario_nome,
        CASE
            WHEN fa.status      = 'erro'        THEN 'erro'
            WHEN fa.status      = 'processando' THEN 'processando'
            WHEN fa.tipo_falta  = 'terapeuta'   THEN 'falta_terapeuta'
            WHEN fa.tipo_falta  = 'paciente'    THEN 'falta_paciente'
            -- (1) concluiu no fluxo ASSIM mas sem guia vinculada
            WHEN fa.status IN ('concluido', 'concluido_sem_guia')
                 AND fa.numero_autorizacao IS NULL
                 AND COALESCE(fa.completion_type, 'automated') = 'automated'
                                                THEN 'concluido_sem_guia'
            WHEN fa.status_assim = 'autorizado' THEN 'autorizado'
            WHEN fa.status      = 'concluido'   THEN 'autorizado'
            WHEN fa.status      = 'pendente'    THEN 'pendente'
            ELSE COALESCE(fa.status, 'pendente')
        END AS status_operacional,
        ctrl.profissional_substituto_nome,
        COALESCE(ctrl.profissional_substituto_nome, ag.profissional_nome) AS profissional_realizou_nome,
        (ctrl.profissional_substituto_id IS NOT NULL) AS is_substituicao,
        ctrl.status AS controle_status,
        ctrl.confirmado_em,
        fa.criado_por,
        ctrl.confirmado_por_nome
    FROM public.fila_autorizacoes fa
    LEFT JOIN public.maquinas maq
        ON maq.id = fa.machine_id
    LEFT JOIN public.agenda_tita_autorizacao ag
        ON  fa.paciente_id::bigint = ag.paciente_id
        AND fa.data_atendimento    = ag.data_atendimento
        AND fa.horario             = ag.hora_inicial
        AND lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) =
            lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))
    LEFT JOIN LATERAL (
        SELECT ct.status, ct.profissional_substituto_id, ct.profissional_substituto_nome, ct.confirmado_em, ct.confirmado_por_nome
        FROM public.controle_terapeutico ct
        WHERE ct.tita_agendamento_id = ag.tita_agendamento_id
        ORDER BY ct.updated_at DESC NULLS LAST
        LIMIT 1
    ) ctrl ON true
    WHERE fa.id IS NOT NULL
      AND fa.data_atendimento = p_data
      AND fa.avulsa = false          -- <<< avulsa não tem sessão: viraria card sem terapia
      AND (fa.status IS NOT NULL OR fa.status_assim IS NOT NULL
           OR fa.numero_autorizacao IS NOT NULL OR fa.tipo_falta IS NOT NULL)
    ORDER BY fa.id,
             fa.created_at  DESC NULLS LAST,
             ag.updated_at  DESC NULLS LAST,
             ag.created_at  DESC NULLS LAST
)

UNION ALL

-- Parte 2: autorizados diretamente no ASSIM sem registro em fila_autorizacoes
(
    SELECT
        p2.id, p2.agenda_id, p2.paciente_id, p2.paciente_nome,
        p2.data_atendimento, p2.horario, p2.data_horario,
        p2.status, p2.status_assim, p2.tipo_falta, p2.completion_type,
        p2.numero_autorizacao, p2.numero_autorizacao_origem,
        p2.machine_id, p2.error_message, p2.execution_time_ms,
        p2.created_at, p2.updated_at, p2.assim_updated_at, p2.horario_autorizacao,
        p2.terapia_exibicao_id, p2.classificacao_terapia, p2.forma_autorizacao,
        p2.hora_inicial, p2.hora_final, p2.profissional_nome, p2.profissional_id,
        p2.terapia_nome, p2.terapia_exibicao_nome, p2.sala_nome, p2.clinica_nome,
        p2.convenio_nome, p2.responsavel_nome, p2.responsavel_telefone, p2.numero_carteirinha,
        p2.unidade, p2.convenio, p2.usuario_nome, p2.status_operacional,
        p2.profissional_substituto_nome, p2.profissional_realizou_nome,
        p2.is_substituicao, p2.controle_status, p2.confirmado_em,
        p2.criado_por, p2.confirmado_por_nome
    FROM (
        WITH
        agenda_com_tuss AS (
            SELECT
                at.id,
                at.tita_agendamento_id,
                at.paciente_id,
                at.paciente_nome,
                at.data_atendimento,
                at.hora_inicial,
                at.hora_final,
                at.profissional_id,
                at.profissional_nome,
                at.terapia_nome,
                at.terapia_exibicao_id,
                at.terapia_exibicao_nome,
                at.sala_nome,
                at.clinica_nome,
                at.convenio_nome,
                at.responsavel_nome,
                at.responsavel_telefone,
                at.numero_carteirinha,
                CASE
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text,'Psicologia ABA'::text,'Arteterapia'::text,'Arteterapia (Psicologia ABA)'::text,'Avaliação Neuropsicológica'::text,'Habilidades Sociais (Psicologia ABA)'::text]) THEN '22070384'::text
                    WHEN at.terapia_exibicao_nome = 'Fonoaudiologia'::text           THEN '22070397'::text
                    WHEN at.terapia_exibicao_nome = 'Psicomotricidade'::text         THEN '22070400'::text
                    WHEN at.terapia_exibicao_nome = 'Fisioterapia'::text             THEN '22070419'::text
                    WHEN at.terapia_exibicao_nome = 'Terapia Ocupacional'::text      THEN '22070427'::text
                    WHEN at.terapia_exibicao_nome = 'Psicopedagogia'::text           THEN '22070435'::text
                    WHEN at.terapia_exibicao_nome = 'Musicoterapia'::text            THEN '22070451'::text
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Nutrição'::text,'Terapia Alimentar'::text]) THEN '22070460'::text
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia'::text,'Fisioterapia Aquática'::text]) THEN '22070265'::text
                    WHEN at.terapia_exibicao_nome = 'Equoterapia'::text              THEN '22070257'::text
                    ELSE NULL::text
                END AS codigo_tuss
            FROM public.agenda_tita at
            WHERE at.data_atendimento = p_data
              AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text,'Notificação Prévia'::text])
        ),
        slots_sem_fila AS (
            SELECT
                *,
                ROW_NUMBER() OVER (
                    PARTITION BY paciente_id, data_atendimento, codigo_tuss
                    ORDER BY hora_inicial ASC
                ) AS ordem
            FROM agenda_com_tuss
            WHERE codigo_tuss IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public.fila_autorizacoes fa
                  WHERE fa.paciente_id::bigint = agenda_com_tuss.paciente_id
                    AND fa.data_atendimento    = agenda_com_tuss.data_atendimento
                    AND fa.horario             = agenda_com_tuss.hora_inicial
                    AND fa.avulsa              = false   -- <<< avulsa não representa esta sessão
              )
        ),
        guias_sem_fila AS (
            SELECT
                aa.*,
                ROW_NUMBER() OVER (
                    PARTITION BY aa.paciente_id, aa.data_execucao::date, aa.codigo_tuss
                    ORDER BY aa.guia ASC
                ) AS ordem
            FROM public.autorizacoes_assim aa
            WHERE aa.codigo_tuss IS NOT NULL
              AND aa.data_execucao::date = p_data
              -- (2) exclusão escopada por data: o número da guia recicla
              AND NOT EXISTS (
                  SELECT 1 FROM public.fila_autorizacoes fa
                  WHERE fa.numero_autorizacao = aa.guia
                    AND fa.data_atendimento BETWEEN (aa.data_execucao::date - 7)
                                                AND (aa.data_execucao::date + 7)
              )
        )
        SELECT
            (substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),1,8)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),9,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),13,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),17,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),21,12))::uuid  AS id,
            NULL::uuid                AS agenda_id,
            s.paciente_id::text       AS paciente_id,
            s.paciente_nome,
            s.data_atendimento,
            s.hora_inicial            AS horario,
            (s.data_atendimento::text||' '::text||s.hora_inicial::text)::timestamp without time zone AS data_horario,
            'concluido'::text         AS status,
            'autorizado'::text        AS status_assim,
            NULL::text                AS tipo_falta,
            'automated'::text         AS completion_type,
            g.guia                    AS numero_autorizacao,
            -- Ver a nota do gêmeo acima: sem linha na fila, a guia veio do portal.
            'relatorio'::text         AS numero_autorizacao_origem,
            NULL::text                AS machine_id,
            NULL::text                AS error_message,
            NULL::integer             AS execution_time_ms,
            g.data_autorizacao        AS created_at,
            g.updated_at,
            g.updated_at              AS assim_updated_at,
            g.data_autorizacao        AS horario_autorizacao,
            s.terapia_exibicao_id,
            s.terapia_nome            AS classificacao_terapia,
            'automatico'::text        AS forma_autorizacao,
            s.hora_inicial,
            s.hora_final,
            s.profissional_nome,
            s.profissional_id,
            s.terapia_nome,
            s.terapia_exibicao_nome,
            s.sala_nome,
            s.clinica_nome,
            s.convenio_nome,
            s.responsavel_nome,
            s.responsavel_telefone,
            s.numero_carteirinha,
            s.sala_nome               AS unidade,
            s.convenio_nome           AS convenio,
            NULL::text                AS usuario_nome,
            'autorizado'::text        AS status_operacional,
            ctrl.profissional_substituto_nome,
            COALESCE(ctrl.profissional_substituto_nome, s.profissional_nome) AS profissional_realizou_nome,
            (ctrl.profissional_substituto_id IS NOT NULL) AS is_substituicao,
            ctrl.status               AS controle_status,
            ctrl.confirmado_em,
            NULL::text                AS criado_por,
            ctrl.confirmado_por_nome
        FROM slots_sem_fila s
        INNER JOIN guias_sem_fila g
            ON  g.paciente_id       = s.paciente_id
            AND g.data_execucao::date = s.data_atendimento
            AND g.codigo_tuss       = s.codigo_tuss
            AND g.ordem             = s.ordem
        LEFT JOIN LATERAL (
            SELECT ct.status, ct.profissional_substituto_id, ct.profissional_substituto_nome, ct.confirmado_em, ct.confirmado_por_nome
            FROM public.controle_terapeutico ct
            WHERE ct.tita_agendamento_id = s.tita_agendamento_id
            ORDER BY ct.updated_at DESC NULLS LAST
            LIMIT 1
        ) ctrl ON true
    ) p2
)

$$;

GRANT EXECUTE ON FUNCTION public.listar_central_pacientes(date) TO anon, authenticated, service_role;
