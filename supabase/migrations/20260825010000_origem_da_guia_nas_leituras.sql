-- A origem da guia chega às telas.
--
-- Par de 20260825000000_origem_da_guia.sql, que criou
-- `fila_autorizacoes.numero_autorizacao_origem` e passou a preenchê-la nos três lugares
-- que escrevem `numero_autorizacao`. Aplicar SEMPRE depois dela: aqui só há leitura, e sem
-- a coluna isto nem compila.
--
-- Três superfícies de detalhamento passam a poder dizer "Direto na ASSIM":
--   - o modal da Conferência ASSIM         -> get_auditoria_assim (via _periodo)
--   - a gaveta da aba Reconciliação        -> get_auditoria_assim_periodo
--   - a Ficha Operacional de central-pacientes -> vw_central_pacientes / listar_central_pacientes
--
-- ── UMA DECISÃO QUE NÃO É ÓBVIA ──────────────────────────────────────────────────
-- A coluna `guia` que a Conferência devolve é `COALESCE(mt.guia, fo.numero_autorizacao)`:
-- ela pode vir do match posicional contra `autorizacoes_assim` (mt) OU da linha da fila
-- (fo). Então a origem exposta tem de descrever A GUIA QUE ESTÁ NA TELA, e a ordem dos
-- ramos importa:
--
--   1. Se a linha da fila TEM guia, a origem é a que ela registrou. `mt.guia` não serve
--      de prova aqui: o relatório traz TODA autorização, inclusive as que o robô
--      capturou, então "está no relatório" não é evidência de ter sido tirada no site.
--   2. Só quando a fila NÃO tem guia e o relatório tem é que a origem é demonstrável
--      sem registro nenhum — ninguém no Pulsar capturou aquele número. Esse ramo faz o
--      histórico anterior a 25/08 funcionar de graça nesta tela, sem backfill e sem
--      chute: é dedução do próprio dado, não heurística.
--   3. Fila com guia mas sem origem registrada (histórico) devolve NULL, e a tela não
--      mostra nada. Ver o snippet 20260825_origem_da_guia_historico.sql.
--
-- ── ORDEM E BLAST RADIUS ─────────────────────────────────────────────────────────
-- `get_auditoria_assim(p_data)` é um wrapper `SELECT *` sobre `_periodo`
-- (20260819120000:250-256). Coluna nova no `_periodo` sem mudar o wrapper = erro de
-- aridade em execução, na tela principal da Conferência. Por isso os dois estão na MESMA
-- migration, e por isso ambos precisam de DROP (muda o RETURNS TABLE).
--
-- Conferido, um por um, que nenhum outro consumidor de `_periodo` usa `SELECT *`:
-- get_tokens_mensal (20260819120000:264), get_auditoria_assim_resumo (20260824050000),
-- get_candidatas_vinculo (20260821000000:462) e candidatas_motivo_glosa
-- (20260821010000:100) listam colunas por nome. Só o wrapper precisava acompanhar.
--
-- O DROP leva os GRANTs e o COMMENT junto — os dois são refeitos no fim de cada bloco.
--
-- ── O QUE ESTA MIGRATION DELIBERADAMENTE NÃO CONSERTA ────────────────────────────
-- A view/RPC de central-pacientes é reproduzida FIEL a
-- 20260805170100_central_pacientes_guia_sem_captura.sql, defeitos inclusos: o CASE de
-- TUSS está inline em quatro cópias aqui dentro, quando o mapa único é
-- `public.tuss_da_sessao()`. Isso é dívida real e conhecida, mas consertá-la de carona
-- numa migration sobre origem de guia misturaria duas mudanças de risco muito diferente
-- na mesma aplicação. Fica para uma migration própria.
--
-- Também não são adicionados GRANTs à view: 20260805170100 fez o mesmo DROP VIEW +
-- CREATE VIEW sem re-grant e está em produção funcionando, o que indica default
-- privileges do schema. Conferir depois de aplicar:
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'vw_central_pacientes';
-- Se vier vazio, a tela responde 403 e é só grantar SELECT aos papéis que já liam.

-- =============================================================================
-- 1. Conferência ASSIM — get_auditoria_assim_periodo + o wrapper
-- =============================================================================
-- Recriada a partir de 20260821030000_conferencia_consome_vinculo.sql (a definição mais
-- recente das SETE que existem entre 19 e 21/08), com duas adições: a coluna
-- `numero_autorizacao_origem` na CTE `fila_operacional` e a saída `guia_origem`.

DROP FUNCTION IF EXISTS public.get_auditoria_assim(date);
DROP FUNCTION IF EXISTS public.get_auditoria_assim_periodo(date, date);

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
        AND NOT EXISTS (
          SELECT 1 FROM public.autorizacoes_vinculos v
          WHERE v.guia = aa.guia AND v.desfeito_em IS NULL
        )
    )
    SELECT DISTINCT ON (s.bloco_id)
      s.bloco_id,
      a.guia, a.status, a.codigo_erro, a.descricao_erro, a.data_execucao, a.updated_at,
      a.teve_token, a.token,
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
    ((mt.status = 'Liberado')
      OR (fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL)
      -- A cobertura por vínculo é autorização de fato: existe guia liberada na
      -- ASSIM para aquele atendimento. É esta linha que faz a sessão deixar de
      -- ser pendência de faturamento.
      OR vin.guia IS NOT NULL)                            AS possui_autorizacao,
    (fo.paciente_id IS NOT NULL)                          AS possui_solicitacao,
    CASE
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
    mt.teve_token,
    mt.token,
    fo.criado_por,
    fo.forma_autorizacao,
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
    SELECT v.guia, v.guia_original, v.vinculado_por, v.vinculado_em, aa2.data_execucao
    FROM public.autorizacoes_vinculos v
    JOIN public.autorizacoes_assim aa2 ON aa2.guia = v.guia
    WHERE v.bloco_id = b.bloco_id
      AND v.desfeito_em IS NULL
      AND v.tipo = 'vinculo'
    LIMIT 1
  ) vin ON true
  -- A situação SEM considerar vínculo — exatamente o CASE que existia antes
  -- desta migration, movido para cá sem uma vírgula de diferença. Fica num
  -- lugar só porque `situacao`, `prioridade` e `observacao` agora todos
  -- precisam dele; três cópias divergiriam.
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
  'Conferência ASSIM por período. Considera public.autorizacoes_vinculos: guia vinculada sai do pool posicional e a sessão coberta vira GLOSA_RESOLVIDA (se havia glosa) ou LIBERADA (se não havia). Devolve guia_origem: de onde veio a guia exibida (robo = capturada pelo Pulsar no recibo; relatorio = veio do extrato da ASSIM, logo tirada direto no site; reconciliacao = reparo a mao; NULL = nao registrado).';

GRANT EXECUTE ON FUNCTION public.get_auditoria_assim_periodo(date, date) TO anon, authenticated;

-- O wrapper de um dia. `SELECT *` só continua válido porque o RETURNS TABLE abaixo
-- ganhou a mesma coluna nova — é por isso que os dois vivem na mesma migration.
CREATE OR REPLACE FUNCTION public.get_auditoria_assim(p_data date)
 RETURNS TABLE(bloco_id text, paciente_id text, paciente_nome text, empresa text, matricula text, dep text, carteirinha text, data_atendimento date, hora_inicial time without time zone, codigo_tuss text, convenio_nome text, terapias text, profissionais text, quantidade_sessoes bigint, guia text, status_assim text, codigo_erro text, descricao_erro text, data_execucao timestamp with time zone, autorizacao_updated_at timestamp with time zone, diferenca_minutos numeric, situacao text, prioridade integer, dias_atraso integer, possui_autorizacao boolean, possui_solicitacao boolean, observacao text, motivo_glosa text, teve_token boolean, token text, criado_por text, forma_autorizacao text, horario_autorizacao timestamp without time zone, guia_origem text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT * FROM public.get_auditoria_assim_periodo(p_data, p_data)
$function$
;

GRANT EXECUTE ON FUNCTION public.get_auditoria_assim(date) TO anon, authenticated;

-- =============================================================================
-- 2. central-pacientes — a view e a RPC gêmeas
-- =============================================================================
-- Recriadas FIÉIS a 20260805170100_central_pacientes_guia_sem_captura.sql, com a coluna
-- nova em três pontos por gêmeo:
--
--   Parte 1 (linhas que passaram pela fila)  -> fa.numero_autorizacao_origem
--   Parte 2 (repasse do subselect p2)        -> p2.numero_autorizacao_origem
--   Parte 3 (guias SEM linha na fila)        -> 'relatorio'::text, literal
--
-- O literal da Parte 3 não é chute: aquele ramo sintetiza linha a partir de
-- `autorizacoes_assim` justamente para a guia que NÃO TEM linha na fila. Se não há linha,
-- não houve solicitação pelo Pulsar, e a guia só pode ter sido tirada no portal. É o mesmo
-- raciocínio do `'automatico'::text AS forma_autorizacao` que já mora ali ao lado — e
-- combina com o `criado_por` NULL logo abaixo, que sempre disse a mesma coisa sem que
-- ninguém pudesse ler.

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
