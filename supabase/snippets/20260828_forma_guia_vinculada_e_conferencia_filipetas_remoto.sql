-- =============================================================================
-- Pacote: forma segue a guia vinculada + Conferência de Filipetas consome override
-- =============================================================================
-- Confirmado no SQL Editor (supabase_migrations.schema_migrations) que
-- 20260827000000/000001/000002/000003 JÁ ESTÃO aplicadas em produção. Só
-- faltam duas:
--
--   20260827000004  forma_segue_a_guia_vinculada — a 000003 sozinha não bastou
--                   (o COALESCE de forma_autorizacao ainda dava prioridade à
--                   fila antes do vínculo); esta é quem corrige de fato o caso
--                   da Kourtney Savino Lope (03/08, bloco
--                   11649_2026-08-03_22070435_11:20:00).
--   20260828170000  get_tokens_mensal passa a excluir bloco com reclassificação
--                   ativa (caso Benjamin Vilazio, glosa->falta que não saía da
--                   Conferência de Filipetas).
--
-- NÃO reaplica 000000/000001/000002/000003 — já estão no livro-caixa.
--
-- Tudo ou nada: erro em qualquer bloco desfaz o pacote inteiro.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 20260827000004 — forma_segue_a_guia_vinculada
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- A forma de validação segue a guia VINCULADA, não a linha glosada da fila
-- =============================================================================
-- Base: 20260827000003_filipeta_da_guia_vinculada.sql (aplicada em produção
-- hoje). Corpo idêntico, exceto UMA expressão: o COALESCE de
-- `forma_autorizacao`. `RETURNS TABLE` não muda, então CREATE OR REPLACE basta
-- e o frontend não muda.
--
-- POR QUE A 20260827000003 NÃO RESOLVEU
-- Ela pôs `vin` na frente de `mt` — correto, mas insuficiente. O primeiro ramo
-- do COALESCE era `fo.forma_autorizacao`, a FILA, e ela é não-nula neste caso:
-- a sessão FOI solicitada pelo Pulsar, e a ASSIM glosou. O COALESCE parava ali e
-- os ramos com `vin` nunca eram avaliados.
--
-- Medido depois de aplicar a 003 (o valor não mudou, como se vê):
--   get_auditoria_assim('2026-08-03') no bloco 11649_..._22070435_11:20:00
--     guia 9229 · GLOSA_RESOLVIDA · forma_autorizacao 'QR Code'
--
-- O DADO QUE DECIDE A ORDEM DOS RAMOS
--   fila_autorizacoes daquela sessão:
--     numero_autorizacao        9229          <- a guia GLOSADA
--     status                    glosa
--     forma_autorizacao         'QR Code'
--     forma_autorizacao_origem  'relatorio'   <- NINGUÉM respondeu o modal
--     biofacial_assim           '10-QRCODE'
--
-- `origem = 'relatorio'` é o ponto. O 'QR Code' não é resposta de atendente: é o
-- próprio sync derivando o rótulo do biofacial da 9229, a guia recusada. Não há
-- resposta humana ali para preservar, então a regra de 20260821080000 ("quem
-- respondeu o modal ganha") não está em jogo — ela protege a atendente, e a
-- atendente não falou nada neste bloco.
--
-- O que a tela mostrava era: "a presença foi validada por QR Code" a respeito de
-- uma tentativa que NÃO autorizou o atendimento. Quem autorizou foi a 15032, com
-- erro de reconhecimento facial — e é essa que deixou papel na recepção.
--
-- A CORREÇÃO
-- O vínculo passa a ser o PRIMEIRO ramo, na frente da fila. Fica:
--   1º guia vinculada (só quando existe vínculo)
--   2º fila            (todo bloco sem vínculo — regra de 20260821080000 intacta)
--   3º posicional      (fallback de sempre)
--
-- `teve_token` e `token` já ficaram certos na 003 e não são tocados: ali não há
-- `fo` no caminho, então pôr `vin` na frente de `mt` bastou.
--
-- ALCANCE
-- Só blocos com vínculo ativo mudam de valor — os demais não têm ramo 1º e
-- seguem exatamente como antes. Hoje isso é 1 bloco conhecido; a query do passo 3
-- abaixo diz quantos são no total.
--
-- VERIFICAÇÃO
--   1. O caso real:
--        SELECT guia, situacao, teve_token, token, forma_autorizacao
--          FROM get_auditoria_assim('2026-08-03')
--         WHERE bloco_id = '11649_2026-08-03_22070435_11:20:00';
--      Esperado: forma_autorizacao = 'Erro no Reconhecimento Facial'
--      (era 'QR Code'); guia 9229 e situacao GLOSA_RESOLVIDA INALTERADAS.
--      Na tela, o botão de conferência âmbar aparece.
--
--   2. Bloco SEM vínculo não mudou. Rode ANTES e DEPOIS e compare:
--        SELECT forma_autorizacao, count(*)
--          FROM get_auditoria_assim_periodo('2026-08-01','2026-08-26') a
--         WHERE NOT EXISTS (SELECT 1 FROM autorizacoes_vinculos v
--                            WHERE v.bloco_id = a.bloco_id
--                              AND v.desfeito_em IS NULL AND v.tipo = 'vinculo')
--         GROUP BY 1 ORDER BY 1;
--      As duas listas têm de ser idênticas, linha a linha.
--
--   3. Quantos blocos vinculados mudam de forma (o alcance real):
--        SELECT count(*) FROM get_auditoria_assim_periodo('2026-08-01','2026-08-26') a
--          JOIN autorizacoes_vinculos v ON v.bloco_id = a.bloco_id
--           AND v.desfeito_em IS NULL AND v.tipo = 'vinculo'
--          JOIN autorizacoes_assim aa ON aa.guia = v.guia
--         WHERE public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token)
--               IS DISTINCT FROM a.forma_autorizacao;
--      Rode ANTES de aplicar: é quantas linhas hoje descrevem a guia errada.
--      Depois de aplicar tem de ser 0.
-- =============================================================================

-- Sem DROP: o RETURNS TABLE é idêntico ao vigente.
CREATE OR REPLACE FUNCTION public.get_auditoria_assim_periodo(p_data_inicio date, p_data_fim date)
 RETURNS TABLE(bloco_id text, paciente_id text, paciente_nome text, empresa text, matricula text, dep text, carteirinha text, data_atendimento date, hora_inicial time without time zone, codigo_tuss text, convenio_nome text, terapias text, profissionais text, quantidade_sessoes bigint, guia text, status_assim text, codigo_erro text, descricao_erro text, data_execucao timestamp with time zone, autorizacao_updated_at timestamp with time zone, diferenca_minutos numeric, situacao text, prioridade integer, dias_atraso integer, possui_autorizacao boolean, possui_solicitacao boolean, observacao text, motivo_glosa text, teve_token boolean, token text, criado_por text, forma_autorizacao text, horario_autorizacao timestamp without time zone, guia_origem text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH blocos_auditoria AS (
    WITH agenda_tita_tuss AS (
      SELECT
        at.paciente_id,
        at.paciente_nome,
        at.data_atendimento,
        at.hora_inicial,
        at.terapia_nome,
        at.terapia_exibicao_nome,
        at.profissional_nome,
        at.convenio_nome,
        at.numero_carteirinha,
        substring(at.numero_carteirinha, 1, 6)                                   AS empresa,
        substring(at.numero_carteirinha, 7, 7)                                   AS matricula,
        right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)           AS dep,
        public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
      FROM agenda_tita at
      WHERE at.data_atendimento BETWEEN p_data_inicio AND p_data_fim
        AND at.ativo = true
        AND at.convenio_nome ILIKE '%assim%'
        AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
    ),
    agenda_filtrada AS (
      SELECT a.*
      FROM agenda_tita_tuss a
      WHERE a.codigo_tuss IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM config_regras_terapias r
          WHERE r.categoria = 'BLACKLIST_AUTORIZACAO'
            AND r.ativo = true
            AND a.terapia_nome ILIKE ('%' || r.terapia_nome || '%')
        )
    ),
    agenda_sem_falta AS (
      SELECT a.*
      FROM agenda_filtrada a
      WHERE NOT EXISTS (
        SELECT 1 FROM fila_autorizacoes f
        WHERE f.paciente_id::bigint = a.paciente_id
          AND f.data_atendimento = a.data_atendimento
          AND f.horario = a.hora_inicial
          AND (
            -- `status_assim` deixou de ser só rótulo curto: numa linha em
            -- 'glosa' ele guarda o motivo por extenso, e um motivo como
            -- "FALTA DE COBERTURA CONTRATUAL" casaria com este LIKE. A sessão
            -- inteira sumiria da auditoria — sem erro, sem linha, sem aviso —
            -- justamente quando mais precisa ser vista. Linha em glosa não é
            -- falta, então o teste de texto não se aplica a ela.
            (f.status IS DISTINCT FROM 'glosa'
             AND upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%')
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
          )
      )
        AND a.terapia_nome NOT ILIKE '%Aplicador ABA Escola%'
        AND a.terapia_nome NOT ILIKE '%Aplicador ABA Casa%'
        AND a.terapia_nome NOT ILIKE '%Aplicador Suporte%'
        AND a.terapia_nome NOT ILIKE '%Supervisão ABA%'
    )
    SELECT
      concat_ws('_', asf.paciente_id, asf.data_atendimento, asf.codigo_tuss, asf.hora_inicial) AS bloco_id,
      asf.paciente_id::text,
      asf.paciente_nome,
      asf.empresa,
      asf.matricula,
      asf.dep,
      concat_ws('.', asf.empresa, asf.matricula, asf.dep) AS carteirinha,
      asf.data_atendimento,
      asf.hora_inicial,
      asf.codigo_tuss,
      asf.convenio_nome,
      string_agg(DISTINCT asf.terapia_exibicao_nome, ' | ' ORDER BY asf.terapia_exibicao_nome) AS terapias,
      string_agg(DISTINCT asf.profissional_nome,     ' | ' ORDER BY asf.profissional_nome)     AS profissionais,
      count(*) AS quantidade_sessoes
    FROM agenda_sem_falta asf
    GROUP BY asf.paciente_id, asf.paciente_nome, asf.empresa, asf.matricula, asf.dep,
             asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss, asf.convenio_nome
  ),
  fila_operacional AS (
    SELECT DISTINCT ON (f.paciente_id, f.data_atendimento, f.horario, f.tuss)
      f.empresa, f.matricula, f.dep, f.paciente_id, f.data_atendimento, f.horario,
      f.tuss AS codigo_tuss,
      COALESCE(f.updated_at, f.created_at) AS ultimo_updated_at,
      f.criado_por,
      f.forma_autorizacao,
      f.horario_autorizacao,
      f.status,
      f.status_assim,
      f.numero_autorizacao,
      -- De onde veio a guia desta linha: 'robo' (o Pulsar capturou no recibo),
      -- 'relatorio' (o extrato da ASSIM trouxe, ou seja foi tirada no site),
      -- 'reconciliacao' (reparo à mão), NULL (histórico anterior ao registro).
      f.numero_autorizacao_origem,
      f.error_message,
      -- ── Motivo da recusa lido pelo robô no recibo do aceite ────────────────
      -- Só de linha em 'glosa': `status_assim` também guarda 'Liberado',
      -- 'Liberado *' e os rótulos de falta, e nenhum deles é motivo de recusa.
      --
      -- O robô grava "1013-CADASTRO DO BENEFICIARIO COM PROBLEMAS": código,
      -- hífen, texto. O código só é extraído quando o texto realmente começa
      -- com o padrão numérico — recusa sem código (o fallback do rpa.js) cai
      -- com código nulo e a descrição inteira preservada, em vez de virar um
      -- "código" que é a primeira palavra da frase.
      CASE
        WHEN f.status = 'glosa' AND f.status_assim ~ '^\s*\d{3,5}\s*-'
          THEN btrim(split_part(f.status_assim, '-', 1))
      END AS glosa_codigo,
      CASE
        WHEN f.status = 'glosa'
          THEN nullif(btrim(regexp_replace(f.status_assim, '^\s*\d{3,5}\s*-\s*', '')), '')
      END AS glosa_descricao
    FROM fila_autorizacoes f
    WHERE f.data_atendimento BETWEEN p_data_inicio AND p_data_fim
      AND NOT (
        -- Mesma ressalva de `agenda_sem_falta`: um motivo de recusa que contenha
        -- a palavra FALTA descartaria a própria linha que traz o motivo, e a
        -- sessão voltaria a aparecer como "Não Solicitada".
        (f.status IS DISTINCT FROM 'glosa'
         AND upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%')
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
      )
    ORDER BY f.paciente_id, f.data_atendimento, f.horario, f.tuss,
             COALESCE(f.updated_at, f.created_at) DESC
  ),
  match_temporal AS (
    WITH sessoes AS (
      SELECT
        b1.bloco_id, b1.paciente_id, b1.paciente_nome, b1.empresa, b1.matricula, b1.dep,
        b1.carteirinha, b1.data_atendimento, b1.hora_inicial, b1.codigo_tuss,
        b1.convenio_nome, b1.terapias, b1.profissionais, b1.quantidade_sessoes,
        row_number() OVER (
          PARTITION BY b1.empresa, b1.matricula, b1.dep, b1.data_atendimento, b1.codigo_tuss
          ORDER BY b1.hora_inicial
        ) AS ordem_sessao
      FROM blocos_auditoria b1
    ),
    autorizacoes AS (
      SELECT
        aa.guia, aa.matricula, aa.paciente_nome, aa.data_execucao, aa.data_autorizacao,
        aa.status, aa.codigo_tuss, aa.codigo_erro, aa.descricao_erro,
        aa.teve_token, aa.updated_at, aa.token, aa.status_tratado, aa.matricula_limpa, aa.paciente_id,
        -- Carregado para a guia tirada DIRETO NO PORTAL. Nessa, `forma_autorizacao`
        -- é NULL para sempre: sync_assim_results() escreve por UPDATE sobre a linha
        -- da fila (20260821080000:262-313) e essa sessão nunca teve linha. Sem o
        -- valor cru aqui, o erro de reconhecimento facial não chega à tela e a
        -- filipeta que está na recepção não é pedida para conferir.
        aa.biofacial,
        split_part(aa.matricula, '.', 1)               AS empresa,
        split_part(aa.matricula, '.', 2)               AS matricula_base,
        split_part(aa.matricula, '.', 3)               AS dep,
        row_number() OVER (
          PARTITION BY split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                       split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
          ORDER BY aa.data_execucao
        ) AS ordem_autorizacao
      FROM autorizacoes_assim aa
      WHERE date(aa.data_execucao) BETWEEN p_data_inicio AND p_data_fim
        -- ── A exclusão que faz a reconciliação funcionar ────────────────────
        -- Guia já triada sai do pool ANTES do row_number(). Não é detalhe de
        -- performance: `data_execucao` é o instante da autorização no portal, e
        -- o JOIN exige `date(data_execucao) = data_atendimento`. Uma guia tirada
        -- por fora dias depois da sessão fica órfã no dia da sessão E entra na
        -- fila posicional do SEU dia de execução, onde desloca o pareamento de
        -- uma sessão legítima daquele dia. Vincular sem remover daqui
        -- corrigiria um dia e corromperia outro.
        --
        -- Vale para os dois tipos: 'vinculo' porque a guia passou a pertencer a
        -- um bloco específico, e 'sem_sessao' porque o operador afirmou que ela
        -- não pertence a nenhum — em ambos os casos ela não deve mais competir
        -- por posição.
        --
        -- A RECLASSIFICAÇÃO NÃO ENTRA AQUI, e isso é deliberado: ela não diz
        -- nada sobre a guia, diz sobre a SESSÃO. Tirar a guia do pool porque a
        -- sessão foi reclassificada faria a autorização seguinte da partição
        -- subir de posição e casar com outra sessão — corromperia o pareamento
        -- do dia inteiro para corrigir uma linha.
        AND NOT EXISTS (
          SELECT 1 FROM public.autorizacoes_vinculos v
          WHERE v.guia = aa.guia AND v.desfeito_em IS NULL
        )
    )
    SELECT DISTINCT ON (s.bloco_id)
      s.bloco_id,
      a.guia, a.status, a.codigo_erro, a.descricao_erro, a.data_execucao, a.updated_at,
      a.teve_token, a.token, a.biofacial,
      EXTRACT(epoch FROM a.data_execucao::time - s.hora_inicial) / 60 AS diferenca_minutos
    FROM sessoes s
    LEFT JOIN autorizacoes a
      ON  a.empresa        = s.empresa
      AND a.matricula_base  = s.matricula
      AND a.dep            = s.dep
      AND date(a.data_execucao) = s.data_atendimento
      AND a.codigo_tuss    = s.codigo_tuss
      AND a.ordem_autorizacao = s.ordem_sessao
    ORDER BY s.bloco_id, a.updated_at DESC
  )
  SELECT
    b.bloco_id,
    b.paciente_id,
    b.paciente_nome,
    b.empresa,
    b.matricula,
    b.dep,
    b.carteirinha,
    b.data_atendimento,
    b.hora_inicial,
    b.codigo_tuss,
    b.convenio_nome,
    b.terapias,
    b.profissionais,
    b.quantidade_sessoes,
    COALESCE(mt.guia, fo.numero_autorizacao)               AS guia,
    COALESCE(mt.status, fo.status_assim)                   AS status_assim,
    er.codigo                                              AS codigo_erro,
    ed.descricao                                           AS descricao_erro,
    -- AT TIME ZONE explicito: a coluna de origem e `timestamp WITHOUT time
    -- zone` com hora de Sao Paulo, e o tipo de saida e `WITH time zone`.
    -- Sem a conversao o Postgres carimba o horario local como UTC (a sessao
    -- do Supabase roda em UTC) e o navegador subtrai 3h na exibicao.
    mt.data_execucao AT TIME ZONE 'America/Sao_Paulo'     AS data_execucao,
    mt.updated_at    AT TIME ZONE 'America/Sao_Paulo'     AS autorizacao_updated_at,
    mt.diferenca_minutos,
    CASE
      -- ── Reclassificação manual, e ela vem antes de tudo ────────────────────
      -- É o único ramo em que uma PESSOA sobrepõe a derivação. Vem no topo
      -- porque é a decisão mais recente e a mais informada: quem a tomou sabia
      -- o que a tela mostrava (a RPC valida contra a situação vigente e a
      -- congela em `situacao_anterior`) e afirmou outra coisa sobre o que
      -- aconteceu na clínica — que é justamente o que o CASE abaixo não tem
      -- como saber, porque ele só enxerga o que a ASSIM respondeu.
      --
      -- Acima do vínculo por desempate explícito: reclassificar_situacao()
      -- recusa bloco coberto por vínculo, então na prática não coexistem, mas
      -- o CASE não pode depender de uma guarda que vive noutro arquivo.
      WHEN ovr.situacao_nova IS NOT NULL               THEN ovr.situacao_nova
      -- Sessão glosada que uma autorização externa passou a cobrir. Estado
      -- próprio, e não LIBERADA, porque a glosa aconteceu e continua contando:
      -- é dela que sai o número que a clínica usa para contestar recusa.
      WHEN vin.guia IS NOT NULL AND sb.base = 'GLOSA'  THEN 'GLOSA_RESOLVIDA'
      -- Sessão que nunca foi solicitada pelo Pulsar e a autorização apareceu no
      -- relatório. Aqui não houve glosa, então chamar de "glosa resolvida"
      -- seria mentir: é liberada, com o vínculo registrado no detalhamento.
      WHEN vin.guia IS NOT NULL                        THEN 'LIBERADA'
      ELSE sb.base
    END                                                   AS situacao,
    -- Derivada da `situacao`, e não uma segunda escrita do mesmo CASE. A versão
    -- anterior mantinha os dois CASEs em paralelo, com 8 ramos cada, e o
    -- mapeamento é uma função pura da situação — 20260814120000 já pagou essa
    -- lição em `sync_assim_results` ("duplicar o CASE seria garantir que as duas
    -- cópias divergissem com o tempo"). O ELSE 1 é deliberado: situação nova sem
    -- prioridade mapeada aparece no topo da lista, onde alguém a vê, em vez de
    -- afundar em silêncio.
    CASE
      -- 7 é a faixa das faltas, que é onde o serviço já põe as linhas
      -- sintetizadas por get_faltas_auditoria_assim
      -- (auditoria-assim.service.ts:51). Uma sessão reclassificada como falta
      -- tem de ordenar junto das outras faltas, senão a mesma coisa apareceria
      -- em dois lugares da lista conforme a origem.
      WHEN ovr.situacao_nova IN ('FALTA', 'FALTA_TERAPEUTA') THEN 7
      -- CANCELADA e NAO_SOLICITADA reclassificadas herdam a prioridade da
      -- própria situação de destino, tratada pelos ramos de baixo — cair aqui
      -- com um número próprio faria a linha ordenar diferente de uma
      -- NAO_SOLICITADA derivada, que é a mesma coisa para quem trabalha a lista.
      WHEN ovr.situacao_nova = 'CANCELADA'            THEN 5
      WHEN ovr.situacao_nova = 'NAO_SOLICITADA'       THEN 1
      WHEN vin.guia IS NOT NULL AND sb.base = 'GLOSA' THEN 6
      WHEN vin.guia IS NOT NULL                       THEN 6
      WHEN sb.base = 'GLOSA'                          THEN 2
      WHEN sb.base = 'CANCELADA'                      THEN 5
      WHEN sb.base = 'LIBERADA'                       THEN 6
      WHEN sb.base = 'SOLICITACAO_CANCELADA'          THEN 1
      WHEN sb.base = 'SINCRONIZANDO'                  THEN 4
      WHEN sb.base = 'RETORNO_NAO_CONFIRMADO'         THEN 3
      WHEN sb.base = 'NAO_SOLICITADA'                 THEN 1
      ELSE 1
    END                                                   AS prioridade,
    (CURRENT_DATE - b.data_atendimento)::integer          AS dias_atraso,
    -- ── `possui_autorizacao` NÃO consulta o override, de propósito ────────────
    -- Esta coluna responde um fato verificável — existe guia liberada na ASSIM
    -- para este atendimento? — e a reclassificação não cria nem destrói guia.
    -- Reclassificar uma GLOSA como FALTA deixa isto em `false`, que é o que já
    -- era e continua sendo verdade. E o caminho inverso não existe: LIBERADA
    -- está fora do conjunto permitido justamente para que ninguém possa
    -- afirmar cobertura sem guia (ver a constraint em 20260827000000).
    ((mt.status = 'Liberado')
      OR (fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL)
      -- A cobertura por vínculo é autorização de fato: existe guia liberada na
      -- ASSIM para aquele atendimento. É esta linha que faz a sessão deixar de
      -- ser pendência de faturamento.
      OR vin.guia IS NOT NULL)                            AS possui_autorizacao,
    (fo.paciente_id IS NOT NULL)                          AS possui_solicitacao,
    CASE
      -- O texto anterior é preservado INTEIRO e a reclassificação vem depois
      -- dele, exatamente como o vínculo faz logo abaixo. É o que mantém a glosa
      -- legível na linha: quem lê precisa continuar vendo que a ASSIM recusou e
      -- por quê, senão a reclassificação vira apagamento — e a promessa desta
      -- feature é o oposto, que nada se perde.
      WHEN ovr.situacao_nova IS NOT NULL
        THEN concat(ob.base, ' · Reclassificado de ', ovr.situacao_anterior,
                    ' para ', ovr.situacao_nova, ' por ', ovr.reclassificado_por,
                    ' em ', to_char(ovr.reclassificado_em AT TIME ZONE 'America/Sao_Paulo',
                                    'DD/MM/YYYY HH24:MI'),
                    ' — ', ovr.justificativa)
      WHEN vin.guia IS NOT NULL AND sb.base = 'GLOSA'
        -- O texto da glosa é preservado inteiro e o vínculo vem DEPOIS dele. A
        -- ordem importa: quem lê a linha precisa continuar vendo por que foi
        -- recusada, senão o histórico desaparece da tela mesmo estando no banco.
        THEN concat(ob.base, ' · Coberta pela guia ', vin.guia,
                    ' de ', to_char(vin.data_execucao, 'DD/MM/YYYY HH24:MI'),
                    ' — vínculo por ', vin.vinculado_por)
      WHEN vin.guia IS NOT NULL
        THEN concat('Autorização confirmada pela ASSIM (guia ', vin.guia,
                    ', vínculo por ', vin.vinculado_por, ')')
      ELSE ob.base
    END                                                   AS observacao,
    agm.motivo_glosa,
    -- ── A evidência de validação segue a guia que de fato autorizou ──────────
    -- Havendo vínculo, é a guia vinculada que autorizou o atendimento; `mt` é a
    -- posicional, que num bloco GLOSA_RESOLVIDA é justamente a GLOSA. Ler token
    -- de `mt` ali significa ler a evidência da guia recusada.
    --
    -- `guia` acima continua sendo a de `mt`, de propósito: é dela que sai o
    -- número que a clínica usa para contestar a recusa. As duas colunas descrevem
    -- coisas diferentes — a guia mostra o que foi glosado, o token mostra como a
    -- presença foi validada — e é por isso que não seguem a mesma fonte.
    COALESCE(vin.teve_token, mt.teve_token)               AS teve_token,
    COALESCE(vin.token,      mt.token)                    AS token,
    fo.criado_por,
    -- ── A forma de validação, e de qual guia ela vem ─────────────────────
    -- TRÊS ramos, nesta ordem exata. A ordem é o conteúdo desta expressão.
    --
    -- 1º VÍNCULO. Havendo vínculo, a guia vinculada é a que AUTORIZOU o
    --    atendimento, e é dela que veio o papel para a recepção conferir. Ela
    --    passa na frente de `fo` — e isso NÃO viola a regra de 20260821080000
    --    ("quem respondeu o modal ganha"), pelo motivo medido no caso real:
    --
    --      fila_autorizacoes da sessão 11:20 de 03/08:
    --        numero_autorizacao        9229          <- a guia GLOSADA
    --        forma_autorizacao         'QR Code'
    --        forma_autorizacao_origem  'relatorio'   <- ninguém respondeu nada
    --        biofacial_assim           '10-QRCODE'
    --
    --    Origem 'relatorio' significa que o próprio sync derivou aquele rótulo do
    --    biofacial da 9229. Não há resposta de atendente ali para preservar: é um
    --    eco do relatório sobre a guia RECUSADA. Deixar `fo` na frente faz a tela
    --    descrever como a presença foi validada numa tentativa que não autorizou
    --    coisa nenhuma.
    --
    --    Onde a atendente REALMENTE respondeu (origem 'modal'), o bloco quase
    --    nunca tem vínculo — o vínculo existe para a glosa resolvida por fora. E
    --    se um dia coexistirem, a guia vinculada continua sendo a que autorizou;
    --    a resposta do modal descreve a tentativa anterior, que foi recusada.
    --
    -- 2º FILA, para todo bloco SEM vínculo: a regra de 20260821080000 intacta.
    -- 3º POSICIONAL, o fallback de sempre.
    COALESCE(
      CASE WHEN vin.guia IS NOT NULL
           THEN public.forma_validacao_do_biofacial(vin.biofacial, vin.teve_token)
      END,
      fo.forma_autorizacao,
      public.forma_validacao_do_biofacial(mt.biofacial, mt.teve_token)
    )                                                     AS forma_autorizacao,
    fo.horario_autorizacao,
    -- ── De onde veio a guia que está sendo exibida ────────────────────────────
    -- Descreve a coluna `guia` acima, que é COALESCE(mt.guia, fo.numero_autorizacao).
    -- A ordem dos ramos é o conteúdo desta expressão, não estilo:
    --
    -- 1º  A fila tem guia -> vale o que ELA registrou. `mt.guia` não pode arbitrar
    --     aqui: o relatório da ASSIM traz TODA autorização, inclusive a que o robô
    --     capturou, então "está no relatório" nunca foi prova de ter sido tirada no
    --     site. Inverter estes dois ramos rotularia de 'relatorio' quase toda guia do
    --     robô — o erro exato que esta migration existe para não cometer.
    -- 2º  A fila NÃO tem guia e o relatório tem -> ninguém no Pulsar capturou aquele
    --     número, e isso é dedução do dado, não chute. É o ramo que faz o histórico
    --     anterior a 25/08/2026 já responder certo nesta tela, sem backfill nenhum.
    -- 3º  Fila com guia e sem origem registrada (histórico) -> NULL, e a tela não
    --     mostra rótulo. Melhor calar que adivinhar.
    CASE
      WHEN fo.numero_autorizacao IS NOT NULL THEN fo.numero_autorizacao_origem
      WHEN mt.guia               IS NOT NULL THEN 'relatorio'
      ELSE NULL
    END                                                   AS guia_origem
  FROM blocos_auditoria b
  LEFT JOIN match_temporal mt        ON mt.bloco_id = b.bloco_id
  LEFT JOIN fila_operacional fo
    ON  fo.paciente_id      = b.paciente_id
    AND fo.data_atendimento = b.data_atendimento
    AND fo.codigo_tuss      = b.codigo_tuss
    AND fo.horario          = b.hora_inicial
  LEFT JOIN auditoria_glosa_motivos agm ON agm.bloco_id = b.bloco_id
  -- ── Código e descrição da recusa, resolvidos num lugar só ──────────────────
  -- `mt.codigo_erro` está nulo em 100% das linhas medidas; o código do relatório
  -- vive embutido no começo do `status` ("1013-CADASTRO DO BENEFICI") e até aqui
  -- nunca chegava a `codigo_erro`. O `\s*\*\s*$` tira o asterisco de cancelado
  -- do fim da descrição truncada — ele é marcação de estado, não parte do texto.
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        mt.codigo_erro,
        CASE WHEN mt.status ~ '^\s*\d{3,5}\s*-'
             THEN btrim(split_part(mt.status, '-', 1)) END,
        fo.glosa_codigo
      ) AS codigo,
      CASE WHEN mt.status ~ '^\s*\d{3,5}\s*-'
           THEN nullif(btrim(regexp_replace(
                  regexp_replace(mt.status, '^\s*\d{3,5}\s*-\s*', ''),
                  '\s*\*\s*$', '')), '')
      END AS descricao_relatorio
  ) er ON true
  LEFT JOIN public.glosa_codigos gc ON gc.codigo = er.codigo
  -- Ordem da resolução, e por que o de-para vem antes do recibo da própria
  -- sessão: o de-para guarda, por código, o texto MAIS LONGO já visto — é o
  -- próprio recibo que o alimenta. Então `gc.descricao` nunca é pior que
  -- `fo.glosa_descricao` do mesmo código, e pode ser melhor se um dia um recibo
  -- chegar cortado. O recibo continua logo atrás, para a recusa que veio sem
  -- código e por isso não tem chave de de-para. `error_message` fecha a lista
  -- para a linha em 'erro', que não tem motivo nenhum de convênio — e é dela
  -- que o rodapé do modal tira o que quebrou.
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      mt.descricao_erro,
      gc.descricao,
      fo.glosa_descricao,
      er.descricao_relatorio,
      fo.error_message
    ) AS descricao
  ) ed ON true
  -- ── Reconciliação ─────────────────────────────────────────────────────────
  -- A guia externa que cobre este bloco. O unique parcial
  -- autorizacoes_vinculos_bloco_ativo_uq garante no máximo uma; o LIMIT 1 é
  -- cinto de segurança para o caso de a constraint ser afrouxada um dia.
  LEFT JOIN LATERAL (
    SELECT v.guia, v.guia_original, v.vinculado_por, v.vinculado_em, aa2.data_execucao,
           -- A evidência de validação da presença vem da guia VINCULADA, não da
           -- posicional. Ver a nota no COALESCE lá embaixo: sem estes três campos
           -- o vínculo conserta a situação e deixa a filipeta invisível.
           aa2.teve_token, aa2.token, aa2.biofacial
    FROM public.autorizacoes_vinculos v
    JOIN public.autorizacoes_assim aa2 ON aa2.guia = v.guia
    WHERE v.bloco_id = b.bloco_id
      AND v.desfeito_em IS NULL
      AND v.tipo = 'vinculo'
    LIMIT 1
  ) vin ON true
  -- ── Reclassificação manual ────────────────────────────────────────────────
  -- A reclassificação ativa deste bloco. O unique parcial
  -- auditoria_situacao_overrides_bloco_ativo_uq garante no máximo uma; o LIMIT 1
  -- é o mesmo cinto de segurança do LATERAL acima.
  LEFT JOIN LATERAL (
    SELECT o.situacao_anterior, o.situacao_nova, o.justificativa,
           o.reclassificado_por, o.reclassificado_em
    FROM public.auditoria_situacao_overrides o
    WHERE o.bloco_id = b.bloco_id
      AND o.desfeito_em IS NULL
    LIMIT 1
  ) ovr ON true
  -- A situação SEM considerar vínculo — exatamente o CASE que existia antes
  -- desta migration, movido para cá sem uma vírgula de diferença. Fica num
  -- lugar só porque `situacao`, `prioridade` e `observacao` agora todos
  -- precisam dele; três cópias divergiriam. (Nem vínculo nem reclassificação:
  -- `sb.base` é a derivação pura, e é o que os dois sobrepõem.)
  LEFT JOIN LATERAL (
    SELECT
    CASE
          WHEN mt.codigo_erro IS NOT NULL
            OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
                                                              THEN 'GLOSA'
          WHEN mt.status = 'Liberado *'                      THEN 'CANCELADA'
          WHEN mt.status = 'Liberado'                        THEN 'LIBERADA'
          WHEN fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL
                                                              THEN 'LIBERADA'
          -- Recusa de verdade: a ASSIM processou o envio e devolveu
          -- "BENEFICIO REJEITADO". Único ramo da fila que é glosa.
          WHEN fo.status = 'glosa'                            THEN 'GLOSA'
          -- Quebra no processo, não decisão do convênio. 'erro' é o RPA abortando
          -- antes de qualquer desfecho (aba da ASSIM fechada no meio da
          -- identificação, dado do associado incompleto, envio que a recepção não
          -- concluiu); 'cancelado' é alguém desistindo da solicitação. Nos dois a
          -- sessão segue sem autorização e o que falta é solicitar de novo — por
          -- isso prioridade 1 e o recorte de "Não Solicitadas", não o de glosa.
          WHEN fo.status IN ('erro', 'cancelado')             THEN 'SOLICITACAO_CANCELADA'
          WHEN fo.paciente_id IS NOT NULL
            AND fo.ultimo_updated_at IS NOT NULL
            AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
                                                              THEN 'SINCRONIZANDO'
          WHEN fo.paciente_id IS NOT NULL
            AND (fo.ultimo_updated_at IS NULL
                 OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
                                                              THEN 'RETORNO_NAO_CONFIRMADO'
          ELSE                                                     'NAO_SOLICITADA'
    END AS base
  ) sb ON true
  -- A observação SEM considerar vínculo, pelo mesmo motivo.
  LEFT JOIN LATERAL (
    SELECT
    CASE
          WHEN mt.codigo_erro IS NOT NULL
            OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
            THEN concat('Glosa: ',
                   COALESCE(er.codigo, mt.status, 'Erro não identificado'),
                   CASE WHEN ed.descricao IS NOT NULL THEN concat(' - ', ed.descricao) ELSE '' END)
          WHEN mt.status = 'Liberado' AND mt.teve_token = true
            THEN concat('TOKEN - ', mt.token)
          WHEN mt.status = 'Liberado'    THEN 'Autorização confirmada pela ASSIM'
          WHEN mt.status = 'Liberado *'  THEN 'Autorização cancelada'
          WHEN fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL
            THEN 'Autorização confirmada pela ASSIM'
          -- Mesma forma do ramo do relatório ("Glosa: 1013 - CADASTRO ..."), para a
          -- legenda do card não mudar de gramática conforme a fonte da recusa.
          -- `error_message` continua como último recurso: numa glosa sem motivo
          -- identificado ele ao menos diz o que o robô viu.
          WHEN fo.status = 'glosa'
            THEN concat('Glosa: ',
                   COALESCE(
                     nullif(concat_ws(' - ', er.codigo, ed.descricao), ''),
                     fo.error_message,
                     'Erro não identificado'))
          -- Sem prefixo nenhum, e essa é a diferença que importa: aqui a mensagem
          -- do robô é o fato inteiro ("A janela da ASSIM foi fechada durante a
          -- identificação do beneficiário."). Prefixá-la de "Glosa: " era o que
          -- fazia a tela chamar de recusa uma aba que caiu.
          WHEN fo.status = 'erro'
            THEN COALESCE(fo.error_message, 'A solicitação não chegou ao fim na ASSIM.')
          WHEN fo.status = 'cancelado'
            THEN COALESCE(fo.error_message, 'Solicitação cancelada antes da conclusão.')
          WHEN fo.paciente_id IS NOT NULL
            AND fo.ultimo_updated_at IS NOT NULL
            AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
            THEN 'Solicitação enviada.'
          WHEN fo.paciente_id IS NOT NULL
            AND (fo.ultimo_updated_at IS NULL
                 OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
            THEN 'Solicitação enviada, mas o retorno da ASSIM ainda não foi confirmado.'
          ELSE 'Nenhuma solicitação encontrada'
    END AS base
  ) ob ON true
  WHERE COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY prioridade, hora_inicial
$function$
;
comment on function public.get_auditoria_assim_periodo(date, date) is
  'Conferencia ASSIM por periodo. Considera public.autorizacoes_vinculos (guia vinculada sai do pool posicional, a sessao coberta vira GLOSA_RESOLVIDA ou LIBERADA, e teve_token/token/forma_autorizacao passam a vir DELA - na frente inclusive da fila, que registrou a tentativa glosada) e public.auditoria_situacao_overrides (reclassificacao manual, que sobrepoe a situacao derivada e vem no topo do CASE). Devolve guia_origem: de onde veio a guia exibida (robo = capturada pelo Pulsar no recibo; relatorio = veio do extrato da ASSIM, logo tirada direto no site; reconciliacao = reparo a mao; NULL = nao registrado).';

GRANT EXECUTE ON FUNCTION public.get_auditoria_assim_periodo(date, date) TO anon, authenticated;

-- O wrapper de um dia nao e tocado: o RETURNS TABLE nao mudou, entao o SELECT *
-- dele continua valido e ele ja enxerga a nova definicao.

-- ─────────────────────────────────────────────────────────────────────────
-- 20260828170000 — Conferência de Filipetas consome a reclassificação
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- Conferência de Filipetas (get_tokens_mensal) passa a enxergar a reclassificação
-- =============================================================================
-- Base: 20260820100000_tokens_mensal_inclui_erro_facial.sql (a definição
-- vigente). Corpo idêntico, exceto um LEFT JOIN novo (`ovr`) e uma condição a
-- mais no WHERE final. Mesma assinatura e mesmas colunas: CREATE OR REPLACE
-- sem DROP, frontend intocado.
--
-- O BUG
-- get_auditoria_assim_periodo já consome public.auditoria_situacao_overrides
-- desde 20260827000001: uma glosa reclassificada como FALTA sai do card de
-- Glosas, sai do resumo do mês e fecha o alerta. get_tokens_mensal (esta
-- função) NUNCA foi tocada por aquela migration — ela não é um filtro sobre a
-- RPC diária, é uma reimplementação própria e independente, motivada por
-- performance (20260819150000: "calcula o mês inteiro e joga 99% fora" dava
-- timeout). Ela recalcula tudo direto de autorizacoes_assim/fila_autorizacoes/
-- agenda_tita e nunca leu auditoria_situacao_overrides.
--
-- CASO REAL (BENJAMIN VILAZIO, 26/08/2026): a glosa foi reclassificada para
-- FALTA via reclassificar_situacao(). A tela diária já mostra "Falta" — mas o
-- bloco continua na Conferência de Filipetas, porque a chave de partição ainda
-- vem do token/erro facial gravado em autorizacoes_assim/fila_autorizacoes, e
-- nada ali muda quando alguém reclassifica.
--
-- A CORREÇÃO
-- Um LATERAL novo (`ovr`) busca a reclassificação ativa do bloco, e o WHERE
-- final ganha `AND ovr.situacao_nova IS NULL`. Não há ramo condicional por
-- destino: TODO destino de reclassificação (FALTA, FALTA_TERAPEUTA, CANCELADA,
-- NAO_SOLICITADA — ver a constraint em 20260827000000) é uma pessoa afirmando
-- que a leitura original (token ou erro facial) não corresponde a uma sessão
-- que de fato aconteceu como a ASSIM registrou. Não existe destino de
-- reclassificação que devesse MANTER o bloco na lista de papel a conferir.
--
-- Feito depois do funil de partições (chaves/dias_alvo), não dentro dele: a
-- reclassificação é por bloco (paciente+dia+tuss+horário), não por partição
-- inteira (empresa+matrícula+dep+dia+tuss) — excluir cedo demais arriscaria
-- derrubar a partição inteira e desalinhar o pareamento posicional das outras
-- sessões dela. Aqui o LATERAL roda sobre `blocos_auditoria`, que já é por
-- bloco, e o filtro é por linha, no fim — o mesmo lugar onde o recorte de erro
-- facial já acontece hoje.
--
-- VERIFICAÇÃO
--   1. O caso real, que hoje aparece na Conferência de Filipetas:
--        SELECT bloco_id, guia, token, forma_autorizacao
--          FROM get_tokens_mensal('2026-08-01')
--         WHERE paciente_nome ILIKE '%Benjamin Vilazio%'
--           AND data_atendimento = '2026-08-26';
--      Esperado depois de aplicar: nenhuma linha.
--
--   2. get_auditoria_assim('2026-08-26') continua mostrando a sessão como
--      FALTA (situação inalterada — esta migration não toca a RPC diária):
--        SELECT bloco_id, situacao FROM get_auditoria_assim('2026-08-26')
--         WHERE paciente_nome ILIKE '%Benjamin Vilazio%';
--
--   3. Bloco sem reclassificação não muda — comparar contagem total antes e
--      depois de aplicar:
--        SELECT count(*) FROM get_tokens_mensal('2026-08-01');
--      Só deve cair pela exata quantidade de blocos com override ativo que
--      também tinham token/erro facial:
--        SELECT count(*) FROM public.auditoria_situacao_overrides o
--         WHERE o.desfeito_em IS NULL
--           AND o.bloco_id IN (SELECT bloco_id FROM get_tokens_mensal('2026-08-01'));
--      (rodar ANTES de aplicar — é o tamanho esperado da queda)
-- =============================================================================

-- Sem DROP: o RETURNS TABLE é idêntico ao vigente.

CREATE OR REPLACE FUNCTION public.get_tokens_mensal(p_mes date)
 RETURNS TABLE(bloco_id text, paciente_id text, paciente_nome text, data_atendimento date, hora_inicial time without time zone, codigo_tuss text, terapias text, profissionais text, guia text, token text, data_execucao timestamp with time zone, criado_por text, forma_autorizacao text)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '30s'
AS $function$
  WITH auth_mes AS (
    SELECT
      aa.guia, aa.matricula, aa.data_execucao, aa.status, aa.codigo_tuss,
      aa.codigo_erro, aa.descricao_erro, aa.teve_token, aa.token, aa.updated_at,
      split_part(aa.matricula, '.', 1) AS empresa,
      split_part(aa.matricula, '.', 2) AS matricula_base,
      split_part(aa.matricula, '.', 3) AS dep,
      date(aa.data_execucao)           AS dia
    FROM autorizacoes_assim aa
    WHERE date(aa.data_execucao) >= date_trunc('month', p_mes)::date
      AND date(aa.data_execucao) <  (date_trunc('month', p_mes) + interval '1 month')::date
  ),
  -- Semente 1: partições que tiveram filipeta.
  chaves_token AS (
    SELECT DISTINCT empresa, matricula_base, dep, dia, codigo_tuss
    FROM auth_mes
    WHERE teve_token = true
  ),
  -- Semente 2: sessões validadas com erro de reconhecimento facial. A forma
  -- vive na fila (é onde a recepção grava), e a fila não tem carteirinha —
  -- então a chave de partição vem da agenda, pela mesma derivação usada no
  -- resto da função. ILIKE por tolerância a acento/caixa da opção gravada.
  fila_facial AS (
    SELECT DISTINCT f.paciente_id, f.data_atendimento, f.tuss
    FROM fila_autorizacoes f
    WHERE f.data_atendimento >= date_trunc('month', p_mes)::date
      AND f.data_atendimento <  (date_trunc('month', p_mes) + interval '1 month')::date
      AND f.forma_autorizacao ILIKE '%reconhecimento facial%'
  ),
  chaves_facial AS (
    SELECT DISTINCT
      substring(at.numero_carteirinha, 1, 6)                         AS empresa,
      substring(at.numero_carteirinha, 7, 7)                         AS matricula_base,
      right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)  AS dep,
      at.data_atendimento                                            AS dia,
      public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
    FROM agenda_tita at
    JOIN fila_facial ff
      ON  ff.paciente_id::bigint = at.paciente_id
      AND ff.data_atendimento    = at.data_atendimento
    WHERE at.ativo = true
      AND at.convenio_nome ILIKE '%assim%'
      AND public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome)
            IS NOT DISTINCT FROM ff.tuss
  ),
  chaves AS (
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_token
    UNION
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_facial
    WHERE codigo_tuss IS NOT NULL
  ),
  dias_alvo AS (
    SELECT DISTINCT dia FROM chaves
  ),
  autorizacoes AS (
    SELECT
      a.guia, a.status, a.codigo_erro, a.descricao_erro, a.data_execucao,
      a.updated_at, a.teve_token, a.token, a.codigo_tuss,
      a.empresa, a.matricula_base, a.dep,
      row_number() OVER (
        PARTITION BY a.empresa, a.matricula_base, a.dep, a.dia, a.codigo_tuss
        ORDER BY a.data_execucao
      ) AS ordem_autorizacao
    FROM auth_mes a
    JOIN chaves k
      ON  k.empresa        = a.empresa
      AND k.matricula_base = a.matricula_base
      AND k.dep            = a.dep
      AND k.dia            = a.dia
      AND k.codigo_tuss    IS NOT DISTINCT FROM a.codigo_tuss
  ),
  blocos_auditoria AS (
    WITH agenda_tita_tuss AS (
      SELECT
        at.paciente_id,
        at.paciente_nome,
        at.data_atendimento,
        at.hora_inicial,
        at.terapia_nome,
        at.terapia_exibicao_nome,
        at.profissional_nome,
        at.convenio_nome,
        at.numero_carteirinha,
        substring(at.numero_carteirinha, 1, 6)                                   AS empresa,
        substring(at.numero_carteirinha, 7, 7)                                   AS matricula,
        right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)           AS dep,
        public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
      FROM agenda_tita at
      WHERE at.data_atendimento IN (SELECT dia FROM dias_alvo)
        AND at.ativo = true
        AND at.convenio_nome ILIKE '%assim%'
        AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
        -- Semi-join contra o conjunto de carteirinhas alvo: derruba a maior
        -- parte das linhas ANTES dos NOT EXISTS caros abaixo.
        AND EXISTS (
          SELECT 1 FROM chaves k
          WHERE k.empresa        = substring(at.numero_carteirinha, 1, 6)
            AND k.matricula_base = substring(at.numero_carteirinha, 7, 7)
            AND k.dep            = right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)
        )
    ),
    agenda_filtrada AS (
      SELECT a.*
      FROM agenda_tita_tuss a
      WHERE a.codigo_tuss IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM config_regras_terapias r
          WHERE r.categoria = 'BLACKLIST_AUTORIZACAO'
            AND r.ativo = true
            AND a.terapia_nome ILIKE ('%' || r.terapia_nome || '%')
        )
    ),
    agenda_sem_falta AS (
      SELECT a.*
      FROM agenda_filtrada a
      WHERE NOT EXISTS (
        SELECT 1 FROM fila_autorizacoes f
        WHERE f.paciente_id::bigint = a.paciente_id
          AND f.data_atendimento = a.data_atendimento
          AND f.horario = a.hora_inicial
          AND (
            upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%'
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
          )
      )
        AND a.terapia_nome NOT ILIKE '%Aplicador ABA Escola%'
        AND a.terapia_nome NOT ILIKE '%Aplicador ABA Casa%'
        AND a.terapia_nome NOT ILIKE '%Aplicador Suporte%'
        AND a.terapia_nome NOT ILIKE '%Supervisão ABA%'
    )
    SELECT
      concat_ws('_', asf.paciente_id, asf.data_atendimento, asf.codigo_tuss, asf.hora_inicial) AS bloco_id,
      asf.paciente_id::text,
      asf.paciente_nome,
      asf.empresa,
      asf.matricula,
      asf.dep,
      asf.data_atendimento,
      asf.hora_inicial,
      asf.codigo_tuss,
      string_agg(DISTINCT asf.terapia_exibicao_nome, ' | ' ORDER BY asf.terapia_exibicao_nome) AS terapias,
      string_agg(DISTINCT asf.profissional_nome,     ' | ' ORDER BY asf.profissional_nome)     AS profissionais
    FROM agenda_sem_falta asf
    -- convenio_nome entra no GROUP BY só para manter paridade exata com
    -- get_auditoria_assim_periodo: sem ele, dois convênios "assim" grafados
    -- diferente fundiriam num bloco só e mudariam a numeração do pareamento.
    GROUP BY asf.paciente_id, asf.paciente_nome, asf.empresa, asf.matricula, asf.dep,
             asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss, asf.convenio_nome
  ),
  fila_operacional AS (
    SELECT DISTINCT ON (f.paciente_id, f.data_atendimento, f.horario, f.tuss)
      f.paciente_id, f.data_atendimento, f.horario,
      f.tuss AS codigo_tuss,
      f.criado_por,
      f.forma_autorizacao
    FROM fila_autorizacoes f
    WHERE f.data_atendimento IN (SELECT dia FROM dias_alvo)
      AND NOT (
        upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
      )
    ORDER BY f.paciente_id, f.data_atendimento, f.horario, f.tuss,
             COALESCE(f.updated_at, f.created_at) DESC
  ),
  match_temporal AS (
    WITH sessoes AS (
      SELECT
        b1.*,
        row_number() OVER (
          PARTITION BY b1.empresa, b1.matricula, b1.dep, b1.data_atendimento, b1.codigo_tuss
          ORDER BY b1.hora_inicial
        ) AS ordem_sessao
      FROM blocos_auditoria b1
    )
    SELECT DISTINCT ON (s.bloco_id)
      s.bloco_id,
      a.guia, a.status, a.teve_token, a.token, a.data_execucao
    FROM sessoes s
    LEFT JOIN autorizacoes a
      ON  a.empresa        = s.empresa
      AND a.matricula_base = s.matricula
      AND a.dep            = s.dep
      AND date(a.data_execucao) = s.data_atendimento
      AND a.codigo_tuss    = s.codigo_tuss
      AND a.ordem_autorizacao = s.ordem_sessao
    ORDER BY s.bloco_id, a.updated_at DESC
  )
  SELECT
    b.bloco_id,
    b.paciente_id,
    b.paciente_nome,
    b.data_atendimento,
    b.hora_inicial,
    b.codigo_tuss,
    b.terapias,
    b.profissionais,
    mt.guia,
    mt.token,
    mt.data_execucao,
    fo.criado_por,
    fo.forma_autorizacao
  FROM blocos_auditoria b
  JOIN match_temporal mt ON mt.bloco_id = b.bloco_id
  LEFT JOIN fila_operacional fo
    ON  fo.paciente_id      = b.paciente_id
    AND fo.data_atendimento = b.data_atendimento
    AND fo.codigo_tuss      = b.codigo_tuss
    AND fo.horario          = b.hora_inicial
  -- ── Reclassificação manual ────────────────────────────────────────────────
  -- A mesma tabela que get_auditoria_assim_periodo já consome desde
  -- 20260827000001. Aqui só precisamos saber SE existe uma ativa — nenhum
  -- destino de reclassificação mantém o bloco como "papel a conferir".
  LEFT JOIN LATERAL (
    SELECT o.situacao_nova
    FROM public.auditoria_situacao_overrides o
    WHERE o.bloco_id = b.bloco_id
      AND o.desfeito_em IS NULL
    LIMIT 1
  ) ovr ON true
  WHERE (
      mt.teve_token = true
      OR fo.forma_autorizacao ILIKE '%reconhecimento facial%'
    )
    AND ovr.situacao_nova IS NULL
    AND COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY b.data_atendimento, b.hora_inicial, b.paciente_nome
$function$
;

comment on function public.get_tokens_mensal(date) is
  'Conferência de Filipetas: sessões do mês com token ou erro de reconhecimento facial, exceto as cobertas por reclassificação manual ativa (public.auditoria_situacao_overrides) — reclassificar sempre significa que a leitura original não corresponde a uma sessão a conferir.';

-- ─────────────────────────────────────────────────────────────────────────
-- LIVRO-CAIXA — só as duas que faltavam.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260827000004', 'forma_segue_a_guia_vinculada'),
  ('20260828170000', 'conferencia_filipetas_consome_reclassificacao')
ON CONFLICT (version) DO NOTHING;

commit;

-- Confirmação: as duas têm de aparecer.
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260827000004','20260828170000')
ORDER BY version;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO DOS DOIS CASOS REAIS (rodar depois do commit)
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Kourtney Savino Lope, 03/08 — esperado: forma_autorizacao ='Erro no
--    Reconhecimento Facial' (era 'QR Code'), guia e situação INALTERADAS.
SELECT guia, situacao, teve_token, token, forma_autorizacao
  FROM get_auditoria_assim('2026-08-03')
 WHERE bloco_id = '11649_2026-08-03_22070435_11:20:00';

-- 2) Benjamin Vilazio, 26/08 — esperado: nenhuma linha na Conferência de
--    Filipetas do mês, mas a situação diária continua 'FALTA'.
SELECT bloco_id, guia, token, forma_autorizacao
  FROM get_tokens_mensal('2026-08-01')
 WHERE paciente_nome ILIKE '%Benjamin Vilazio%'
   AND data_atendimento = '2026-08-26';

SELECT bloco_id, situacao
  FROM get_auditoria_assim('2026-08-26')
 WHERE paciente_nome ILIKE '%Benjamin Vilazio%';
