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
-- E O SEGUNDO ERRO, NA MESMA CONVERSA, POR OUTRO CAMINHO
--
--   Responsável: "E na segunda dia 14, tem?"
--   Atendente:   "Na segunda-feira, dia 14, não encontrei horários disponíveis
--                 para terapia de psicologia na unidade Realengo."
--
--   { unidade: 'Realengo', terapiaId: NULL,          <-- perdeu a especialidade
--     dataInicio: '2026-09-14', dataFim: '2026-09-14', limite: 20 }
--   -> qtdItens: 20
--
-- Aqui ela ACERTOU a data e perdeu a terapia: consultou "o que tem em Realengo
-- dia 14" em vez de "tem psicologia dia 14". Medido no banco:
--
--   vagas no dia 14 em Realengo:            78
--   vistas pela IA (limite 20):             20
--   posição da única vaga de psicologia:    76   <- é às 17:00, ordem é por hora
--
-- A vaga EXISTE (segunda 14/09, 17:00). Esta negativa foi FALSA — diferente da
-- terça, que calhou de estar certa porque psicologia em Realengo é
-- segunda/quarta/sexta.
--
-- O QUE OS DOIS TÊM EM COMUM, E POR QUE PROMPT NÃO BASTA
--
-- Não é "esqueceu um parâmetro". É tratar uma lista PARCIAL como se fosse a
-- agenda inteira. Com `limite` baixo, QUALQUER pergunta sobre um dia ou uma
-- especialidade recebe "não tem" a menos que aquilo caia por acaso no recorte.
-- "Dia 15?", "semana que vem?", "tem sábado?" — negativas falsas com a
-- confiança de quem consultou o sistema. O responsável desiste.
--
-- É violação direta da seção 7 do próprio prompt ("Não deduza disponibilidade a
-- partir de horários anteriores"). A regra existia; faltava dizer O QUE FAZER
-- em vez disso, e faltava o modelo ter COMO SABER que a lista era parcial.
--
-- ONDE MAIS ISSO FOI TRATADO
--
-- Este snippet é uma de três camadas, e sozinho não resolve:
--
--   1. ferramentas.ts — `consultar_horarios_disponiveis` passou a pedir uma
--      vaga a mais que o limite e devolver `listaCompleta: false` + um aviso
--      quando trunca. É a parte que NÃO depende de o modelo obedecer: ele
--      raciocinava sobre uma premissa falsa, e instrução não conserta premissa
--      falsa. EXIGE DEPLOY DO FRONTEND.
--   2. contexto.ts — a regra subiu para o INSTRUCAO_BASE hardcoded, onde edição
--      de tela não a alcança.
--   3. este arquivo — a mesma regra no prompt da clínica, em dois pontos.
--
-- A description de `dataInicio` já pedia para passá-la "quando o responsável
-- indicar preferência de data", e o caso da data explícita JÁ funcionava (o
-- rastro prova: 'dia 14' virou dataInicio correto). Description de parâmetro é
-- lida como dica de preenchimento; o que se pode AFIRMAR a partir de uma lista
-- precisa ser regra de system prompt.
--
-- ATENÇÃO À ORDEM: aplicar este arquivo ANTES do deploy do frontend deixa o
-- prompt falando de `listaCompleta`, um campo que a ferramenta ainda não
-- devolve. Não quebra nada (o modelo simplesmente não o encontra), mas a
-- instrução só fica inteira depois do deploy.
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
-- A âncora é a frase EXATA que está no prompt em produção, conferida com
-- `substring(system_prompt from position('PASSO 2' in system_prompt))` — não
-- escrita de memória. Uma primeira versão deste arquivo ancorava em "Não
-- conclua" com N maiúsculo; o texto real tem "— não conclua", minúsculo depois
-- de travessão, e o replace() não casou. A contraprova do bloco 4 pegou. É
-- exatamente para isso que ela existe, e é a razão de nunca escrever âncora sem
-- ler o valor primeiro.
update central.agent_settings
   set system_prompt = replace(
         system_prompt,
         '— não conclua por conta própria que a clínica não atende ali.',
         '— não conclua por conta própria que a clínica não atende ali.'
         || E'\n\n'
         || '**Se a família mencionar um dia, uma data ou um período — "terça", "dia 15", "semana que vem", "de manhã" — consulte a agenda DE NOVO passando esse período em `dataInicio` e `dataFim`, e mantenha o `terapiaId` da especialidade que a conversa já definiu.** A lista que a ferramenta devolve é um RECORTE limitado, não a agenda inteira: quando vier com `listaCompleta: false`, ou quando o que você procura simplesmente não aparecer, refine a busca e consulte outra vez. '
         || 'NUNCA diga que não há vaga com base numa lista que você não consultou para aquele caso exato — é o erro que faz a família desistir de uma vaga que estava disponível. '
         || 'Para um dia específico, passe a mesma data nos dois campos.'
       )
 where system_prompt like '%— não conclua por conta própria que a clínica não atende ali.%'
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
         || '**Antes de dizer isso, confirme que você CONSULTOU exatamente o caso perguntado** — o dia certo em `dataInicio`/`dataFim` E a especialidade certa em `terapiaId`. Se a última consulta não tinha os dois, você não sabe se há vaga: consulte antes de responder. Uma lista sem `terapiaId` cobre todas as especialidades e pode não conter a que a família quer, mesmo havendo vaga.'
       )
 where system_prompt like '%Posso verificar outras datas ou outra unidade.%'
   and system_prompt not like '%confirme que você CONSULTOU exatamente o caso perguntado%';

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
   where system_prompt like '%confirme que você CONSULTOU exatamente o caso perguntado%';

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
