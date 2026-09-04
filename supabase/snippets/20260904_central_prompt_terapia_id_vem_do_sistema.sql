-- ============================================================================
-- A seção 4 deixa de parecer suficiente para agendar
--
-- NÃO é migration: `central.agent_settings.system_prompt` é DADO.
--
-- Terceiro ajuste de prompt do dia. Sucede:
--   20260904_central_prompt_unidade_por_parametro.sql   (filtro de unidade)
--   20260904_central_prompt_nao_deduzir_ausencia.sql    (período + terapiaId)
--
-- O CASO (04/09/2026, no rastro de tool calls)
--
--   17:30:42  terapiaId: 2259  dataInicio: 2026-09-04  -> 3 itens   correto
--   17:31:50  terapiaId: 1     dataInicio: 2026-09-14  -> recusado  inventado
--
-- Psicologia é 2259, e a IA usara o id certo um minuto antes. Ao consultar a
-- partir do dia 14 mandou `1`, e a resposta ao responsável foi "não encontrei
-- horários" — uma negativa que parecia legítima.
--
-- POR QUE O PROMPT CONTRIBUI PARA ISSO
--
-- A seção 4 lista 16 terapias POR NOME e nenhum id. Os ids só existem no
-- retorno de consultar_especialidades_disponiveis. O modelo então sabe que
-- "Psicologia" existe (leu aqui), sabe que a ferramenta pede um `terapiaId`, e
-- não tem de onde tirá-lo a não ser da memória da conversa. Quando essa memória
-- escorrega, ele preenche com um número plausível.
--
-- A lista continua útil — é ela que permite responder "a clínica tem
-- fonoaudiologia?" sem consultar o sistema. O que faltava era dizer que ela NÃO
-- serve para agendar: nome não é id, e "a clínica oferece X" não é "X tem vaga".
--
-- A DEFESA REAL NÃO É ESTE ARQUIVO
--
-- ferramentas.ts passou a RECUSAR terapiaId que não esteja entre as terapias com
-- vaga no período, devolvendo `erro_interno` (não `sem_vaga`) e a lista de ids
-- válidos. Isso impede o dano independentemente de o modelo obedecer ao prompt.
-- Este snippet fecha a porta de entrada; a validação é a rede embaixo.
--
-- ROLLBACK: backup em central.agent_settings_backup_20260904_c.
-- ============================================================================

begin;

create table if not exists central.agent_settings_backup_20260904_c as
  select id, organization_id, inbox_id, system_prompt, now() as salvo_em
    from central.agent_settings;

comment on table central.agent_settings_backup_20260904_c is
  'Backup do system_prompt antes de 20260904_central_prompt_terapia_id_vem_do_sistema.sql (a IA inventou terapiaId 1 para psicologia, que é 2259).';

-- ----------------------------------------------------------------------------
-- Âncora: a frase que fecha a seção 4, antes do bloco de MODALIDADES.
-- Conferida no prompt real — "### MODALIDADES DO APLICADOR ABA".
-- ----------------------------------------------------------------------------
update central.agent_settings
   set system_prompt = replace(
         system_prompt,
         '### MODALIDADES DO APLICADOR ABA',
         'Esta lista serve para você responder o que a clínica ATENDE — "vocês têm fonoaudiologia?", por exemplo. '
         || 'Ela NÃO serve para agendar, por dois motivos: nome de terapia não é `terapiaId`, e "a clínica atende X" '
         || 'não significa "X tem vaga agora". '
         || E'\n\n'
         || '**O `terapiaId` vem SEMPRE do sistema, nunca da sua memória.** Pegue-o em '
         || '`consultar_especialidades_disponiveis`, ou reaproveite exatamente o id que já funcionou nesta conversa. '
         || 'Nunca invente um número, nunca chute um valor pequeno como 1 ou 2, e nunca altere um id que deu certo antes. '
         || 'Na dúvida, chame `consultar_especialidades_disponiveis` de novo — é barato, e um id errado faz o sistema '
         || 'responder "sem vaga" para uma terapia que TEM vaga.'
         || E'\n\n'
         || '### MODALIDADES DO APLICADOR ABA'
       )
 where system_prompt like '%### MODALIDADES DO APLICADOR ABA%'
   and system_prompt not like '%O `terapiaId` vem SEMPRE do sistema%';

-- ----------------------------------------------------------------------------
-- CONTRAPROVA — replace() que não casa reporta sucesso e não muda nada
-- ----------------------------------------------------------------------------
do $$
declare
  v_total int;
  v_com   int;
  v_dup   int;
begin
  select count(*) into v_total from central.agent_settings where system_prompt is not null;
  select count(*) into v_com   from central.agent_settings
   where system_prompt like '%O `terapiaId` vem SEMPRE do sistema%';

  -- Reexecução não pode duplicar o bloco.
  select coalesce(max(
           (length(system_prompt) - length(replace(system_prompt, 'terapiaId` vem SEMPRE', '')))
           / length('terapiaId` vem SEMPRE')
         ), 0) into v_dup
    from central.agent_settings;

  raise notice 'agent_settings com prompt: %  |  com a regra do terapiaId: %  |  ocorrências: %',
    v_total, v_com, v_dup;

  if v_total > 0 and v_com = 0 then
    raise exception
      'Nenhum agent_settings recebeu a regra do terapiaId. A âncora "### MODALIDADES DO APLICADOR ABA" não foi encontrada — confira a grafia com: select substring(system_prompt from position(''MODALIDADES'' in system_prompt) for 200) from central.agent_settings;';
  end if;

  if v_dup > 1 then
    raise exception 'A regra entrou % vezes — o replace duplicou. Restaure de central.agent_settings_backup_20260904_c.', v_dup;
  end if;
end $$;

commit;

-- ============================================================================
-- VERIFICAÇÃO
--
-- Repetir a conversa que expôs o defeito:
--   "psicologia em Realengo"  → oferece horários
--   "e a partir do dia 14?"   → deve MANTER terapiaId 2259
--
-- No rastro, a segunda chamada precisa ter o MESMO terapiaId da primeira:
--
--   select created_at,
--          payload->'argumentos'->>'terapiaId'  as terapia_id,
--          payload->'argumentos'->>'dataInicio' as data_inicio,
--          payload->>'motivo'                   as motivo
--   from central.conversation_events
--   where event_type = 'ai.tool_call'
--     and payload->>'nome' = 'consultar_horarios_disponiveis'
--     and created_at > now() - interval '15 minutes'
--   order by created_at desc;
--
-- Se aparecer `motivo: erro_internal` com id estranho, a validação de
-- ferramentas.ts pegou o chute — o dano foi impedido, mas o modelo ainda está
-- inventando, e vale reforçar o prompt.
-- ============================================================================
