-- =============================================================================
-- Reconciliação de Autorizações ASSIM — ETAPA 3
-- A Conferência passa a consumir o vínculo
-- =============================================================================
--
-- Até aqui a reconciliação era inerte: a aba gravava vínculos e nada os lia.
-- Esta migration é a que muda o que a clínica VÊ, e por isso é a sensível.
--
-- BASE: 20260820170000_erro_do_robo_nao_e_glosa.sql, a versão vigente — NÃO a
-- 20260820150000. A 170000 separou 'erro' de 'glosa' e criou
-- SOLICITACAO_CANCELADA; reescrever sobre a 150000 reverteria em silêncio o
-- commit de ontem. `get_auditoria_assim` (dia único) é wrapper e não muda.
--
-- CUIDADO PERMANENTE (20260813130200:68-69): esta RPC é dependência de ESCRITA
-- de fn_alertas_avaliar_assim. Mudar o que ela classifica muda quais alertas
-- nascem e quais se encerram. A Etapa 4 trata disso; nesta migration o motor de
-- alertas ainda vê GLOSA_RESOLVIDA como classe desconhecida e cai em
-- 'pendente_sem_desfecho' — ou seja, entre a Etapa 3 e a 4 a pendência muda de
-- rótulo mas NÃO fecha. Aplicar as duas na mesma janela.
--
-- ── AS CINCO MUDANÇAS ───────────────────────────────────────────────────────
-- 1. A CTE `autorizacoes` exclui guia já triada ANTES do row_number(). É o
--    ponto mais delicado: sem isso o vínculo corrige um dia e corrompe outro.
-- 2. `situacao` ganha dois ramos no topo: GLOSA_RESOLVIDA (havia glosa) e
--    LIBERADA (não havia). Nenhum ramo antigo foi alterado.
-- 3. `prioridade` passa a ser derivada da situação em vez de ser a segunda
--    escrita do mesmo CASE de 8 ramos.
-- 4. `possui_autorizacao` conta o vínculo.
-- 5. `observacao` preserva o texto da glosa e acrescenta a guia que cobriu.
--
-- O CASE de situação e o de observação foram MOVIDOS para LEFT JOIN LATERAL
-- (`sb.base`, `ob.base`) sem uma vírgula de diferença — os três consumidores
-- precisam deles agora, e três cópias divergiriam.
--
-- ── VERIFICAÇÃO (medida em 2026-08-21) ──────────────────────────────────────
-- `autorizacoes_vinculos` está VAZIA em produção. Com zero vínculos, esta
-- versão é idêntica à anterior por construção: `vin.guia` é sempre NULL, os dois
-- ramos novos nunca disparam, e o NOT EXISTS nunca exclui nada. Então o diff
-- correto NÃO é sintético — é:
--   1. antes de aplicar, guardar a contagem por situação de 30 dias;
--   2. aplicar e repetir: os números têm de ser IDÊNTICOS;
--   3. vincular a guia 15032 ao bloco 11649_2026-08-03_22070435_11:20:00;
--   4. repetir: exatamente UM bloco muda, de GLOSA para GLOSA_RESOLVIDA.
-- O snippet supabase/snippets/20260821_etapa3_diff_conferencia.sql faz os 4.
--
-- ── FRONTEND ────────────────────────────────────────────────────────────────
-- GLOSA_RESOLVIDA precisa nascer com todas as formas (SituacaoBadge.tsx:41-43):
-- SITUACAO_CONFIG, contagem no useMemo do hook descontando de `glosas`, card em
-- KpiCards e opção em FiltrosAuditoria. Sem isso o badge degrada para cinza —
-- não quebra, mas o KPI de glosas continua contando a sessão já resolvida.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_auditoria_assim_periodo(p_data_inicio date, p_data_fim date)
 RETURNS TABLE(bloco_id text, paciente_id text, paciente_nome text, empresa text, matricula text, dep text, carteirinha text, data_atendimento date, hora_inicial time without time zone, codigo_tuss text, convenio_nome text, terapias text, profissionais text, quantidade_sessoes bigint, guia text, status_assim text, codigo_erro text, descricao_erro text, data_execucao timestamp with time zone, autorizacao_updated_at timestamp with time zone, diferenca_minutos numeric, situacao text, prioridade integer, dias_atraso integer, possui_autorizacao boolean, possui_solicitacao boolean, observacao text, motivo_glosa text, teve_token boolean, token text, criado_por text, forma_autorizacao text, horario_autorizacao timestamp without time zone)
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
    END                                                   AS prioridade,    (CURRENT_DATE - b.data_atendimento)::integer          AS dias_atraso,
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
    fo.horario_autorizacao
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
  'Conferência ASSIM por período. Considera public.autorizacoes_vinculos: guia vinculada sai do pool posicional e a sessão coberta vira GLOSA_RESOLVIDA (se havia glosa) ou LIBERADA (se não havia).';
