-- ============================================================================
-- O system_prompt do atendente virtual para de mandar filtrar unidade de cabeça
--
-- NÃO é migration: `central.agent_settings.system_prompt` é DADO, configurado
-- pela clínica em /configuracoes (AgentSettings.tsx:288). Não entra no
-- livro-caixa de schema_migrations.
--
-- O DEFEITO
--
-- A seção "PASSO 2 — CONSULTAR A AGENDA" do prompt em produção dizia:
--
--   "O campo `unidade` vem igual para todos os horários e não serve para
--    distinguir; use o `sala`."
--   "Se a família indicou preferência de unidade, ofereça apenas horários
--    daquela unidade. Filtre você mesmo os resultados."
--
-- Isso instruía o modelo a IGNORAR o parâmetro `unidade` de
-- consultar_horarios_disponiveis — que existe, tem enum das três unidades
-- (ferramentas.ts:129) e filtra corretamente — e a separar as unidades de
-- cabeça, lendo o texto de `sala_nome`.
--
-- O prompt descrevia um retorno que já não existia: ferramentas.ts:353 devolve
-- `unidade` já resolvida em cada horário desde então. Era uma instrução que
-- contradizia a description da própria ferramenta, que diz o oposto em
-- ferramentas.ts:119-120 ("não filtre por conta própria olhando o campo
-- `sala`").
--
-- Consequência medida em diálogo real: oferta de horários em Realengo logo
-- depois de o responsável pedir Padre Miguel. Nenhuma mudança de banco corrige
-- isso — um prompt que manda filtrar de cabeça é a causa direta.
--
-- POR QUE replace() E NÃO REESCREVER A COLUNA
--
-- O prompt tem ~22 seções ajustadas pela clínica (endereços das unidades,
-- vocabulário de terapias, regras de encaminhamento). Reescrever a coluna
-- inteira daqui apagaria tudo isso. O replace() cirúrgico preserva o resto.
--
-- O PREÇO DO replace(): ELE ERRA EM SILÊNCIO
--
-- Um espaço a mais, um acento diferente, e o replace() não casa — o UPDATE
-- reporta sucesso, nada muda, e o incidente volta na próxima conversa. Por isso
-- o bloco final NÃO é opcional: ele conta as linhas que ainda têm a instrução
-- antiga e LANÇA. Sem ele, este arquivo "roda com sucesso" sem fazer nada.
--
-- ROLLBACK: não há automático — é dado, não schema. O bloco 1 salva o valor
-- anterior em central.agent_settings_backup_20260904 para poder voltar:
--   update central.agent_settings a
--      set system_prompt = b.system_prompt
--     from central.agent_settings_backup_20260904 b
--    where b.id = a.id;
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Backup do valor atual
--
-- Tabela real, não temp: precisa sobreviver ao commit para servir de rollback.
-- `if not exists` para o arquivo ser reexecutável sem sobrescrever o backup
-- ORIGINAL por um já-corrigido — que é o jeito de perder o rollback justamente
-- quando ele é necessário.
-- ----------------------------------------------------------------------------
create table if not exists central.agent_settings_backup_20260904 as
  select id, organization_id, inbox_id, system_prompt, now() as salvo_em
    from central.agent_settings;

comment on table central.agent_settings_backup_20260904 is
  'Backup do system_prompt antes de 20260904_central_prompt_unidade_por_parametro.sql (a instrução que mandava o modelo filtrar unidade de cabeça olhando sala_nome). Descartável depois de confirmado o comportamento novo em produção.';

-- ----------------------------------------------------------------------------
-- 2. Troca 1 — "use o `sala`" → "use o campo `unidade`"
-- ----------------------------------------------------------------------------
update central.agent_settings
   set system_prompt = replace(
         system_prompt,
         '**Sempre diga a unidade de cada horário.** A unidade aparece no campo `sala` do resultado — por exemplo, "Unid. Realengo - Sala 20" significa unidade Realengo. O campo `unidade` vem igual para todos os horários e não serve para distinguir; use o `sala`.',
         '**Sempre diga a unidade de cada horário.** Cada horário devolvido traz o campo `unidade` com o nome da unidade daquele horário — use esse campo. Não interprete o campo `sala` para descobrir a unidade.'
       )
 where system_prompt like '%não serve para distinguir; use o `sala`%';

-- ----------------------------------------------------------------------------
-- 3. Troca 2 — "filtre você mesmo" → "passe no parâmetro `unidade`"
--
-- Esta é a troca que importa: é a frase que fazia o modelo ignorar o parâmetro.
-- ----------------------------------------------------------------------------
update central.agent_settings
   set system_prompt = replace(
         system_prompt,
         '**Se a família indicou preferência de unidade, ofereça apenas horários daquela unidade.** Filtre você mesmo os resultados.',
         '**Se a família já disse em qual unidade quer ser atendida, passe esse nome no parâmetro `unidade`** — Realengo, Fazendinha ou Padre Miguel. Não filtre a lista por conta própria: a ferramenta já devolve somente a unidade pedida. Se ela responder que não há vaga naquela unidade, diga isso à família e ofereça o que a própria ferramenta indicar (outra unidade ou outra especialidade) — não conclua por conta própria que a clínica não atende ali.'
       )
 where system_prompt like '%Filtre você mesmo os resultados%';

-- ----------------------------------------------------------------------------
-- 4. Rede de segurança para variação de formatação
--
-- Os dois updates acima casam o texto COM os asteriscos de negrito, como está
-- no prompt conferido. Se a clínica tiver editado a formatação, o casamento
-- exato falha. Estes replaces pegam as frases-núcleo sem depender do negrito.
-- São idempotentes: se os blocos 2 e 3 já resolveram, não há o que casar.
-- ----------------------------------------------------------------------------
update central.agent_settings
   set system_prompt = replace(
         system_prompt,
         'O campo `unidade` vem igual para todos os horários e não serve para distinguir; use o `sala`.',
         'Cada horário traz o campo `unidade` com o nome da unidade daquele horário — use esse campo, não o `sala`.'
       )
 where system_prompt like '%não serve para distinguir%';

update central.agent_settings
   set system_prompt = replace(
         system_prompt,
         'Filtre você mesmo os resultados.',
         'Passe a unidade no parâmetro `unidade` da ferramenta — não filtre a lista por conta própria.'
       )
 where system_prompt like '%Filtre você mesmo os resultados%';

-- ----------------------------------------------------------------------------
-- 5. CONTRAPROVA — o bloco que não é opcional
--
-- replace() que não casa devolve o texto original e o UPDATE reporta sucesso.
-- Sem este raise, o arquivo inteiro é um no-op silencioso e o incidente volta.
-- ----------------------------------------------------------------------------
do $$
declare
  v_antigas int;
  v_novas   int;
  v_total   int;
begin
  select count(*) into v_total from central.agent_settings
   where system_prompt is not null;

  select count(*) into v_antigas from central.agent_settings
   where system_prompt ilike '%Filtre você mesmo os resultados%'
      or system_prompt ilike '%não serve para distinguir%';

  select count(*) into v_novas from central.agent_settings
   where system_prompt ilike '%no parâmetro `unidade`%';

  raise notice 'agent_settings com prompt: %  |  com instrução nova: %  |  com instrução antiga: %',
    v_total, v_novas, v_antigas;

  if v_antigas > 0 then
    raise exception
      '% agent_settings ainda mandam o modelo filtrar unidade de cabeça. O replace() não casou — provavelmente a formatação difere. Edite pela UI (/configuracoes → Agente) colando o prompt inteiro, ou ajuste o texto-fonte deste snippet.',
      v_antigas;
  end if;

  -- Prompt existente que não ganhou a instrução nova = seção PASSO 2 ausente ou
  -- reescrita. Não é erro (a clínica pode ter outro texto), mas precisa ser
  -- VISTO: sem a instrução, o modelo volta a decidir sozinho o que fazer com a
  -- unidade.
  if v_total > 0 and v_novas = 0 then
    raise warning
      'Nenhum agent_settings ficou com a instrução de passar a unidade no parâmetro. Confira a seção "PASSO 2 — CONSULTAR A AGENDA" do prompt à mão.';
  end if;
end $$;

commit;

-- ============================================================================
-- DEPOIS DE APLICAR — a verificação que separa "consertado" de "deu sorte"
--
-- 1. Conversa de teste: "quero marcar fono em Padre Miguel".
-- 2. A resposta deve trazer SÓ horários de Padre Miguel, cada um nomeando a
--    unidade.
-- 3. Passo 3 acima não prova nada por si: o filtro TypeScript já funciona hoje
--    (ferramentas.ts:311), então o resultado pode vir certo mesmo com o modelo
--    tendo consultado as três unidades e filtrado de cabeça. O que distingue os
--    dois casos é O ARGUMENTO que o modelo passou — e ele não é gravado em
--    lugar nenhum ainda. É exatamente para isso que existe o rastro de tool
--    calls do Passo 7 do plano ('ai.tool_call' em central.conversation_events).
--
--    Até o rastro existir, o proxy possível é conferir no log do servidor
--    (Coolify) o console.warn de argumentos descartados, ou rodar uma conversa
--    pedindo terapia que só existe em Realengo mas dizendo Padre Miguel: a
--    resposta certa é "não em Padre Miguel, mas temos em Realengo", que só sai
--    do ramo de recusa da ferramenta (ferramentas.ts:318-329) — o modelo não a
--    produz filtrando de cabeça.
-- ============================================================================
