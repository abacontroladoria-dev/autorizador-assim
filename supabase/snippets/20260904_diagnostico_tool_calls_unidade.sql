-- ============================================================================
-- DIAGNÓSTICO — o que o atendente virtual pediu às ferramentas
--
-- SÓ LEITURA. Exige o deploy do frontend com o rastro de tool calls
-- (event_type = 'ai.tool_call' em central.conversation_events).
--
-- A PERGUNTA QUE ISTO RESPONDE
--
-- "A IA ofereceu horário da unidade errada" tem duas causas possíveis, e elas
-- se consertam em lugares completamente diferentes:
--
--   argumentos.unidade = null      → DEFEITO DE PROMPT. O modelo consultou as
--                                    três unidades e filtrou de cabeça. Nenhuma
--                                    mudança de banco corrige isso; o conserto
--                                    é o system_prompt (ver
--                                    20260904_central_prompt_unidade_por_parametro.sql).
--
--   unidade certa + qtd_itens = 0  → DEFEITO DE DADOS. A ferramenta foi chamada
--                                    corretamente e o banco não tinha vaga.
--                                    Conserto: grade, sync, ou horizonte.
--
-- Antes deste rastro os dois eram indistinguíveis: as tool calls viviam só no
-- array local de executarTurno e morriam no return. É por isso que o item 3 da
-- verificação end-to-end é o mais importante — ele separa "consertado" de
-- "funcionou por acaso desta vez".
--
-- Nota de privacidade: `argumentos` passa por uma ALLOWLIST no orquestrador —
-- só chaves e parâmetros de recorte (terapiaId, unidade, datas, limite). Texto
-- livre digitado pelo responsável (observacao, motivo) NÃO é gravado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A pergunta central: o modelo está PASSANDO a unidade?
--
-- Se `sem_unidade` for alto, o prompt não está sendo obedecido — o modelo
-- consulta as três e decide sozinho. É o padrão que produziu o incidente.
-- ----------------------------------------------------------------------------
select
  date_trunc('day', e.created_at)                                    as dia,
  count(*)                                                           as consultas,
  count(*) filter (where e.payload->'argumentos'->>'unidade' is null) as sem_unidade,
  count(*) filter (where e.payload->'argumentos'->>'unidade' is not null) as com_unidade,
  round(
    100.0 * count(*) filter (where e.payload->'argumentos'->>'unidade' is not null)
    / nullif(count(*), 0)
  , 1)                                                               as pct_com_unidade
from central.conversation_events e
where e.event_type = 'ai.tool_call'
  and e.payload->>'nome' = 'consultar_horarios_disponiveis'
  and e.created_at > now() - interval '14 days'
group by 1
order by 1 desc;

-- ----------------------------------------------------------------------------
-- 2. Detalhe por chamada — para investigar uma conversa específica
-- ----------------------------------------------------------------------------
select
  e.created_at,
  e.conversation_id,
  e.payload->>'nome'                       as ferramenta,
  e.payload->>'iteracao'                   as iteracao,
  e.payload->'argumentos'->>'unidade'      as unidade_pedida,
  e.payload->'argumentos'->>'terapiaId'    as terapia_id,
  e.payload->'argumentos'->>'dataInicio'   as data_inicio,
  e.payload->'argumentos'->>'limite'       as limite,
  (e.payload->>'ok')::boolean              as ok,
  e.payload->>'motivo'                     as motivo,
  e.payload->>'qtdItens'                   as qtd_itens,
  e.payload->>'duracaoMs'                  as duracao_ms,
  -- O veredito que separa os dois defeitos.
  case
    when e.payload->>'nome' <> 'consultar_horarios_disponiveis' then null
    when e.payload->'argumentos'->>'unidade' is null
      then 'sem unidade — o modelo vai filtrar de cabeça (defeito de PROMPT)'
    when (e.payload->>'ok')::boolean is false
      then 'unidade pedida, ferramenta recusou (ver motivo)'
    when coalesce((e.payload->>'qtdItens')::int, -1) = 0
      then 'unidade pedida, zero vaga (defeito de DADOS)'
    else 'ok — unidade pedida e vagas devolvidas'
  end                                      as veredito
from central.conversation_events e
where e.event_type = 'ai.tool_call'
  and e.created_at > now() - interval '7 days'
order by e.created_at desc
limit 200;

-- ----------------------------------------------------------------------------
-- 3. Recusas por motivo — onde a conversa trava
--
-- 'sem_vaga' alto com unidade preenchida é sinal de grade curta, não de bug.
-- 'erro_interno' com mensagem de unidade inexistente significa que o modelo
-- mandou algo fora do enum (a segunda camada de guarda em ferramentas.ts).
-- ----------------------------------------------------------------------------
select
  e.payload->>'nome'                  as ferramenta,
  e.payload->>'motivo'                as motivo,
  e.payload->'argumentos'->>'unidade' as unidade_pedida,
  count(*)                            as ocorrencias,
  max(e.created_at)                   as ultima
from central.conversation_events e
where e.event_type = 'ai.tool_call'
  and (e.payload->>'ok')::boolean is false
  and e.created_at > now() - interval '14 days'
group by 1, 2, 3
order by ocorrencias desc;

-- ----------------------------------------------------------------------------
-- 4. Distribuição das unidades pedidas
--
-- Se uma unidade nunca aparece, ou o público não a pede, ou o modelo não a
-- reconhece quando o responsável a escreve. Vale cruzar com a oferta real
-- (bloco 7 da contraprova).
-- ----------------------------------------------------------------------------
select
  coalesce(e.payload->'argumentos'->>'unidade', '(nenhuma — buscou nas três)') as unidade_pedida,
  count(*)                                                    as consultas,
  count(*) filter (where (e.payload->>'ok')::boolean)         as com_resultado,
  round(avg((e.payload->>'qtdItens')::numeric), 1)            as media_de_horarios,
  round(avg((e.payload->>'duracaoMs')::numeric))              as media_ms
from central.conversation_events e
where e.event_type = 'ai.tool_call'
  and e.payload->>'nome' = 'consultar_horarios_disponiveis'
  and e.created_at > now() - interval '14 days'
group by 1
order by consultas desc;

-- ----------------------------------------------------------------------------
-- 5. Conversas escaladas, com as tool calls que as precederam
--
-- Escalar deixa ai_mode='off' + priority='high' na conversa, mas o MOTIVO
-- (loop / filtrado / erro_provider / sem_texto) só existe no log do servidor.
-- O rastro de tool calls é o que mostra o que a IA tentou antes de desistir.
-- ----------------------------------------------------------------------------
select
  c.id                                    as conversation_id,
  c.updated_at                            as escalada_em,
  count(e.id)                             as tool_calls_no_periodo,
  string_agg(
    coalesce(e.payload->>'nome', '?') ||
    '(' || coalesce(e.payload->'argumentos'->>'unidade', 'sem unidade') || ')' ||
    ' → ' || coalesce(e.payload->>'qtdItens', e.payload->>'motivo', '?'),
    E'\n' order by e.created_at
  )                                       as sequencia
from central.conversations c
left join central.conversation_events e
       on e.conversation_id = c.id
      and e.event_type      = 'ai.tool_call'
where c.ai_mode  = 'off'
  and c.priority = 'high'
  and c.updated_at > now() - interval '7 days'
group by c.id, c.updated_at
order by c.updated_at desc
limit 50;

-- ----------------------------------------------------------------------------
-- 6. Volume — checar antes de deixar o rastro ligado por muito tempo
--
-- conversation_events é append-only e sem retenção, e serve também à timeline
-- do painel. Em centenas de linhas/dia é irrelevante. Se passar de alguns
-- milhares, considere gravar só as duas ferramentas de consulta.
-- ----------------------------------------------------------------------------
select
  date_trunc('day', created_at)                              as dia,
  count(*) filter (where event_type = 'ai.tool_call')         as tool_calls,
  count(*)                                                   as eventos_totais,
  pg_size_pretty(sum(pg_column_size(payload)))               as bytes_de_payload
from central.conversation_events
where created_at > now() - interval '14 days'
group by 1
order by 1 desc;
