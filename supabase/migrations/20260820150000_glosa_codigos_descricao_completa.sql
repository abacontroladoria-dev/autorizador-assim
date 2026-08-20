-- ─────────────────────────────────────────────────────────────────────────────
-- Motivo de glosa por extenso: de-para de códigos + aprendizado pelo recibo.
--
-- MEDIDO em produção (2026-08-20, tabela inteira): 66 linhas com status
-- diferente de 'Liberado', 9 textos distintos, 6 códigos — 1013, 1014, 1018,
-- 1403, 1601, 3036. E o achado que motiva esta migration:
--
--   count | tam | status
--   ------+-----+---------------------------
--      47 | 25  | "1013-CADASTRO DO BENEFICI"
--       6 | 25  | "3036-PACIENTE EM TRATAMEN"
--       3 | 25  | "1403-NAO EXISTE INFORMACA"
--       3 | 25  | "1601-REINCIDENCIA NO ATEN"
--       1 | 25  | "1018-EMPRESA DO BENEFICIA"
--       1 | 25  | "1014-BENEFICIARIO COM DAT"
--       1 | 18  | "1601-REINCIDENCI *"
--       1 | 18  | "1013-CADASTRO DO *"
--
-- TODOS têm exatamente 25 caracteres (ou 18 + " *", onde o asterisco marca
-- cancelado, como em 'Liberado *'). Não é corte nosso: a ASSIM trunca a coluna
-- do relatório na origem, e `autorizacoes_assim.codigo_erro` /
-- `.descricao_erro` estão NULAS em 100% das linhas — o robô do relatório
-- (robo-assim/robo-v3.3.js, transformarParaSupabase) sempre gravou null ali. O
-- texto completo simplesmente não existe naquela tela.
--
-- ONDE ELE EXISTE: no recibo do envio, que o robô autorizador já lê —
-- "(1013) CADASTRO DO BENEFICIARIO COM PROBLEMAS" (rpa.js, lerConfirmacao).
-- Completo, mas só para a recusa que passa pelo nosso robô, no ato.
--
-- SOLUÇÃO, em duas partes:
--
--   (1) `glosa_codigos` — de-para código → descrição completa. Seis códigos em
--       todo o histórico: é vocabulário, não volume de dados, e cabe numa
--       tabela que uma pessoa mantém.
--
--   (2) O de-para se completa sozinho. Um trigger em `fila_autorizacoes`
--       aprende o texto do recibo toda vez que o robô registra uma glosa, e só
--       substitui o que já existe quando a descrição nova for MAIS LONGA — um
--       texto truncado nunca sobrescreve um completo.
--
-- A auditoria passa a resolver a descrição nesta ordem: recibo da própria
-- sessão > de-para > texto truncado do relatório. E o código do relatório, que
-- até aqui ficava embutido no meio do `status` e nunca chegava a `codigo_erro`,
-- passa a ser extraído.
--
-- DEPOIS DE APLICAR: os outros cinco códigos precisam ser escritos à mão uma
-- vez — o bloco no fim deste arquivo tem o INSERT pronto. Enquanto não forem,
-- eles seguem aparecendo truncados, exatamente como hoje; nada regride.
--
-- Esta migration substitui a definição de `get_auditoria_assim_periodo` deixada
-- por 20260820140000 e é cumulativa com ela.
-- ─────────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 1. De-para
-- =============================================================================

create table if not exists public.glosa_codigos (
  codigo        text primary key,
  descricao     text not null,
  -- 'recibo' = aprendido do recibo do aceite; 'manual' = escrito por uma pessoa.
  origem        text not null default 'manual',
  atualizado_em timestamptz not null default now()
);

comment on table public.glosa_codigos is
  'Código de glosa da ASSIM -> motivo por extenso. Existe porque o relatório da ASSIM trunca o texto em 25 caracteres; o recibo do envio o traz inteiro.';

alter table public.glosa_codigos enable row level security;

drop policy if exists "glosa_codigos_all" on public.glosa_codigos;
create policy "glosa_codigos_all" on public.glosa_codigos
  for all to authenticated using (true) with check (true);

-- O default do Supabase dá INSERT/UPDATE/DELETE a `anon` em toda tabela nova do
-- schema public. A RLS já barra (não há policy para anon), mas um privilégio que
-- ninguém precisa é um privilégio a menos para auditar depois. O trigger de
-- aprendizado não depende disto: roda SECURITY DEFINER.
revoke all on public.glosa_codigos from anon;

-- O SELECT volta, e de propósito. `get_auditoria_assim_periodo` é SECURITY
-- INVOKER e passa a fazer LEFT JOIN nesta tabela: sem o grant, qualquer chamada
-- que chegue como `anon` morreria com 42501 (permission denied) em vez de
-- devolver a linha. Com o grant e sem policy para anon, a RLS entrega zero
-- linhas e o COALESCE cai no texto truncado — degrada, não quebra. Ler não
-- expõe nada: a tabela é vocabulário de códigos, sem dado de paciente.
grant select on public.glosa_codigos to anon;

-- =============================================================================
-- 2. Aprendizado pelo recibo
-- =============================================================================

create or replace function public.aprender_codigo_glosa()
returns trigger
language plpgsql
security definer
as $$
declare
  v_codigo    text;
  v_descricao text;
begin
  -- Blindagem: aprender vocabulário JAMAIS pode derrubar a conclusão de uma
  -- tarefa do robô. Qualquer erro aqui é engolido e o UPDATE segue — a linha da
  -- fila é o dado que importa, o de-para é conveniência.
  begin
    if new.status is distinct from 'glosa' or new.status_assim is null then
      return new;
    end if;

    -- Só a forma "1013-TEXTO". Sem código não há chave de de-para.
    if new.status_assim !~ '^\s*\d{3,5}\s*-' then
      return new;
    end if;

    v_codigo    := btrim(split_part(new.status_assim, '-', 1));
    v_descricao := nullif(btrim(regexp_replace(new.status_assim, '^\s*\d{3,5}\s*-\s*', '')), '');

    if v_descricao is null then
      return new;
    end if;

    insert into public.glosa_codigos as g (codigo, descricao, origem, atualizado_em)
    values (v_codigo, v_descricao, 'recibo', now())
    on conflict (codigo) do update
       set descricao     = excluded.descricao,
           origem        = excluded.origem,
           atualizado_em = now()
     -- O guarda que impede o de-para de piorar: só troca por texto mais longo.
     -- Se um dia chegar aqui um texto truncado, ele não apaga o completo.
     where length(excluded.descricao) > length(g.descricao);
  exception when others then
    return new;
  end;

  return new;
end;
$$;

-- `SET search_path` declarado DENTRO da função: posto por ALTER FUNCTION, ele
-- morreria calado no próximo CREATE OR REPLACE.
alter function public.aprender_codigo_glosa() set search_path = public, pg_temp;

drop trigger if exists trg_aprender_codigo_glosa on public.fila_autorizacoes;
create trigger trg_aprender_codigo_glosa
  after insert or update of status_assim on public.fila_autorizacoes
  for each row
  when (new.status = 'glosa' and new.status_assim is not null)
  execute function public.aprender_codigo_glosa();

-- =============================================================================
-- 3. Semente
-- =============================================================================
-- Único código com texto completo comprovado (recibo fotografado em
-- 2026-08-13). Os outros cinco estão no bloco do fim do arquivo, à espera do
-- texto real — preencher com suposição seria pior do que mostrar truncado.
insert into public.glosa_codigos (codigo, descricao, origem)
values ('1013', 'CADASTRO DO BENEFICIARIO COM PROBLEMAS', 'manual')
on conflict (codigo) do nothing;

-- =============================================================================
-- 4. A auditoria passa a resolver a descrição completa
-- =============================================================================
-- Corpo idêntico a 20260820140000_motivo_glosa_do_recibo_auditoria.sql, exceto:
--   - dois LEFT JOIN LATERAL + o join do de-para, que resolvem código e
--     descrição num lugar só;
--   - `codigo_erro` / `descricao_erro` / `observacao` passam a ler de lá.

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
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
                                                          THEN 'GLOSA'
      WHEN mt.status = 'Liberado *'                      THEN 'CANCELADA'
      WHEN mt.status = 'Liberado'                        THEN 'LIBERADA'
      WHEN fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL
                                                          THEN 'LIBERADA'
      WHEN fo.status IN ('erro', 'glosa')                 THEN 'GLOSA'
      WHEN fo.paciente_id IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
                                                          THEN 'SINCRONIZANDO'
      WHEN fo.paciente_id IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
                                                          THEN 'RETORNO_NAO_CONFIRMADO'
      ELSE                                                     'NAO_SOLICITADA'
    END                                                   AS situacao,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *'])) THEN 2
      WHEN mt.status = 'Liberado *'                      THEN 5
      WHEN mt.status = 'Liberado'                        THEN 6
      WHEN fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL THEN 6
      WHEN fo.status IN ('erro', 'glosa')                 THEN 2
      WHEN fo.paciente_id IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes' THEN 4
      WHEN fo.paciente_id IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes') THEN 3
      ELSE 1
    END                                                   AS prioridade,
    (CURRENT_DATE - b.data_atendimento)::integer          AS dias_atraso,
    ((mt.status = 'Liberado')
      OR (fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL))
                                                          AS possui_autorizacao,
    (fo.paciente_id IS NOT NULL)                          AS possui_solicitacao,
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
      -- `error_message` continua como último recurso: em 'erro' ele é o que
      -- existe, e numa glosa sem motivo identificado ele ao menos diz o que o
      -- robô viu.
      WHEN fo.status IN ('erro', 'glosa')
        THEN concat('Glosa: ',
               COALESCE(
                 nullif(concat_ws(' - ', er.codigo, ed.descricao), ''),
                 fo.error_message,
                 'Erro não identificado'))
      WHEN fo.paciente_id IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
        THEN 'Solicitação enviada.'
      WHEN fo.paciente_id IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
        THEN 'Solicitação enviada, mas o retorno da ASSIM ainda não foi confirmado.'
      ELSE 'Nenhuma solicitação encontrada'
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
  -- para a linha em 'erro', que não tem motivo nenhum de convênio.
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      mt.descricao_erro,
      gc.descricao,
      fo.glosa_descricao,
      er.descricao_relatorio,
      fo.error_message
    ) AS descricao
  ) ed ON true
  WHERE COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY prioridade, hora_inicial
$function$
;

-- =============================================================================
-- 5. Os cinco códigos que faltam
-- =============================================================================
-- Descomentar e completar com o texto REAL de cada recusa (o que aparece ao lado
-- do código na tela de status da autorização). O que está entre <> é o pedaço
-- que a ASSIM cortou e que ninguém aqui viu — não preencher por dedução.
--
-- insert into public.glosa_codigos (codigo, descricao, origem) values
--   ('1014', 'BENEFICIARIO COM DAT<...>', 'manual'),
--   ('1018', 'EMPRESA DO BENEFICIA<...>', 'manual'),
--   ('1403', 'NAO EXISTE INFORMACA<...>', 'manual'),
--   ('1601', 'REINCIDENCIA NO ATEN<...>', 'manual'),
--   ('3036', 'PACIENTE EM TRATAMEN<...>', 'manual')
-- on conflict (codigo) do update
--    set descricao = excluded.descricao, origem = 'manual', atualizado_em = now();
