-- ============================================================================
-- O prompt passa a exigir consulta por período antes de negar um dia
--
-- NÃO é migration: `central.agent_settings.system_prompt` é DADO. Não entra no
-- livro-caixa de schema_migrations.
--
-- Sucede 20260904_central_prompt_unidade_por_parametro.sql (mesmo dia). Aquele
-- consertou o filtro de unidade e FUNCIONOU — medido no rastro de tool calls:
-- 100% das consultas de horário passaram `unidade`. Este conserta o defeito
-- seguinte, que só ficou visível depois.
--
-- O CASO, REGISTRADO NO RASTRO (04/09/2026, conversa de teste)
--
--   Responsável: "não tem nada na terça?"
--   Atendente:   "Não encontrei horários disponíveis para terapia de psicologia
--                 na unidade Realengo na terça-feira."
--
-- A tool call que produziu essa resposta (central.conversation_events,
-- event_type 'ai.tool_call', 14:44:31):
--
--   { nome: 'consultar_horarios_disponiveis',
--     argumentos: { unidade: 'Realengo', terapiaId: 2259,
--                   dataInicio: null,          <-- o defeito
--                   limite: 3 },
--     ok: true, qtdItens: 3 }
--
-- Ela NUNCA CONSULTOU TERÇA. Com `dataInicio: null` recebeu as 3 primeiras
-- vagas da agenda inteira (sexta 04/09, segunda 07/09, quarta 09/09), não viu
-- terça entre elas, e concluiu que terça não tem. Deduziu ausência a partir de
-- uma amostra de 3, numa unidade com milhares de vagas ofertáveis.
--
-- POR QUE ISSO É GRAVE E NÃO É UM CASO DE BORDA
--
-- Com `limite` baixo e sem recorte de data, QUALQUER pergunta sobre um dia
-- específico recebe "não tem" a menos que aquele dia caia por acaso nas
-- primeiras vagas. "Dia 15?", "semana que vem?", "tem sábado?" — todas
-- respondidas com negativa falsa, e com a confiança de quem consultou o
-- sistema. O responsável desiste.
--
-- É também violação direta da seção 7 do próprio prompt ("Não deduza
-- disponibilidade a partir de horários anteriores"). A regra existia; faltava
-- dizer O QUE FAZER em vez disso — passar o período à ferramenta.
--
-- ONDE MAIS ISSO FOI TRATADO
--
-- A regra subiu também para o INSTRUCAO_BASE hardcoded (contexto.ts), onde
-- edição de tela não a alcança, e a description do parâmetro `dataInicio` foi
-- endurecida (ferramentas.ts). A description ANTIGA já pedia para passar a data
-- "quando o responsável indicar preferência de data" — e foi ignorada.
-- Description de parâmetro pesa menos que regra de system prompt; por isso os
-- três lugares, e não só um.
--
-- ROLLBACK: o bloco 1 salva o valor anterior em
-- central.agent_settings_backup_20260904_b.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Backup
--
-- Nome diferente do backup do snippet anterior de propósito: aquele guarda o
-- prompt ANTES da correção de unidade. Sobrescrevê-lo perderia o ponto de
-- retorno original.
-- ----------------------------------------------------------------------------
create table if not exists central.agent_settings_backup_20260904_b as
  select id, organization_id, inbox_id, system_prompt, now() as salvo_em
    from central.agent_settings;

comment on table central.agent_settings_backup_20260904_b is
  'Backup do system_prompt antes de 20260904_central_prompt_nao_deduzir_ausencia.sql (a IA negava um dia sem tê-lo consultado). Descartável depois de confirmado o comportamento novo.';

-- ----------------------------------------------------------------------------
-- 2. A instrução nova, ancorada no fim do PASSO 2
--
-- Ancorada na frase que o snippet anterior instalou — se ela não estiver lá,
-- o replace não casa e a contraprova do bloco 4 lança.
-- ----------------------------------------------------------------------------
update central.agent_settings
   set system_prompt = replace(
         system_prompt,
         'Se a ferramenta responder que não há vaga na unidade pedida, diga isso à família e ofereça o que a própria ferramenta indicar (outra unidade ou outra especialidade). Não conclua por conta própria que a clínica não atende ali.',
         'Se a ferramenta responder que não há vaga na unidade pedida, diga isso à família e ofereça o que a própria ferramenta indicar (outra unidade ou outra especialidade). Não conclua por conta própria que a clínica não atende ali.'
         || E'\n\n'
         || '**Se a família mencionar um dia, uma data ou um período — "terça", "dia 15", "semana que vem", "de manhã" — consulte a agenda DE NOVO passando esse período em `dataInicio` e `dataFim`.** A lista que a ferramenta devolve é um RECORTE limitado, não a agenda inteira: um horário não aparecer nela não significa que não exista. '
         || 'NUNCA diga que um dia não tem vaga sem ter consultado esse dia — é o erro que faz a família desistir de uma agenda que estava disponível. '
         || 'Para um dia específico, passe a mesma data nos dois campos.'
       )
 where system_prompt like '%Não conclua por conta própria que a clínica não atende ali.%'
   and system_prompt not like '%consulte a agenda DE NOVO passando esse período%';

-- ----------------------------------------------------------------------------
-- 3. Reforço na seção 9, que é onde a negativa é redigida
--
-- A seção 9 ("QUANDO NÃO HOUVER DISPONIBILIDADE") ensina a FRASE da negativa,
-- e é lida no momento exato em que o modelo está prestes a negar. Sem o reforço
-- aqui, a instrução do PASSO 2 fica longe do ponto de decisão.
-- ----------------------------------------------------------------------------
update central.agent_settings
   set system_prompt = replace(
         system_prompt,
         '"Não encontrei horários disponíveis nesse período. Posso verificar outras datas ou outra unidade."',
         '"Não encontrei horários disponíveis nesse período. Posso verificar outras datas ou outra unidade."'
         || E'\n\n'
         || '**Antes de dizer isso, confirme que você CONSULTOU o período em questão.** Se a família perguntou por um dia específico e sua última consulta não passou esse dia em `dataInicio`/`dataFim`, você não sabe se há vaga — consulte antes de responder.'
       )
 where system_prompt like '%Posso verificar outras datas ou outra unidade.%'
   and system_prompt not like '%confirme que você CONSULTOU o período%';

-- ----------------------------------------------------------------------------
-- 4. CONTRAPROVA — sem isto o arquivo é um no-op silencioso
-- ----------------------------------------------------------------------------
do $$
declare
  v_total  int;
  v_passo2 int;
  v_secao9 int;
begin
  select count(*) into v_total  from central.agent_settings where system_prompt is not null;
  select count(*) into v_passo2 from central.agent_settings
   where system_prompt like '%consulte a agenda DE NOVO passando esse período%';
  select count(*) into v_secao9 from central.agent_settings
   where system_prompt like '%confirme que você CONSULTOU o período%';

  raise notice 'agent_settings com prompt: %  |  com a regra no PASSO 2: %  |  com o reforço na seção 9: %',
    v_total, v_passo2, v_secao9;

  if v_total > 0 and v_passo2 = 0 then
    raise exception
      'Nenhum agent_settings recebeu a regra do PASSO 2. O replace() não casou — a âncora depende de 20260904_central_prompt_unidade_por_parametro.sql ter sido aplicado antes. Verifique se o texto da âncora bate, ou edite pela UI.';
  end if;

  if v_total > 0 and v_secao9 = 0 then
    raise warning
      'A regra do PASSO 2 entrou, mas o reforço da seção 9 não. A seção "QUANDO NÃO HOUVER DISPONIBILIDADE" pode ter outro texto — confira à mão: é ela que é lida na hora de negar.';
  end if;
end $$;

commit;

-- ============================================================================
-- VERIFICAÇÃO — repetir a conversa que expôs o defeito
--
-- 1. "quero psicologia em Realengo"  → deve oferecer 3 horários
-- 2. "não tem nada na terça?"        → a resposta certa é oferecer horários DE
--                                      TERÇA, ou dizer que terça não tem DEPOIS
--                                      de tê-la consultado.
--
-- O que decide é o rastro, não a resposta. Rodar depois:
--
--   select
--     created_at,
--     payload->'argumentos'->>'unidade'    as unidade,
--     payload->'argumentos'->>'dataInicio' as data_inicio,   -- ← precisa vir preenchido
--     payload->'argumentos'->>'dataFim'    as data_fim,
--     payload->>'qtdItens'                 as itens
--   from central.conversation_events
--   where event_type = 'ai.tool_call'
--     and payload->>'nome' = 'consultar_horarios_disponiveis'
--     and created_at > now() - interval '1 hour'
--   order by created_at desc;
--
-- `data_inicio` nulo depois de a família ter pedido um dia = a regra não pegou,
-- e a resposta está certa por sorte.
-- ============================================================================
