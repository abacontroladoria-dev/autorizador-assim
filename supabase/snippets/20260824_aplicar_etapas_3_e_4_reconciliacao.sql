-- =============================================================================
-- Roteiro: fazer o vínculo chegar na aba Auditoria (Etapas 3 e 4)
-- =============================================================================
--
-- DIAGNÓSTICO MEDIDO EM 2026-08-24
--   ledger: só `20260824010000` registrado dos quatro da reconciliação;
--   `get_auditoria_assim_periodo`: le_a_tabela_de_vinculos = FALSE;
--   vínculo real (guia 118001 -> bloco de Luana Calixto) devolvendo
--     situacao='GLOSA', possui_autorizacao=false, observacao sem rastro.
--
--   Mas `autorizacoes_vinculos` EXISTE e `get_guias_orfas` funciona — ou seja, a
--   Etapa 1 (20260821000000) foi aplicada à mão e nunca registrada. O livro-caixa
--   mente para menos; é o `prosrc` que vale (reference_db_push_blast_radius).
--
-- POR QUE NÃO `supabase db push`
--   Ele não seleciona arquivo: empurraria o pendente INTEIRO, incluindo migration
--   de outra frente que ainda não foi revisada. Aplicar à mão, na ordem, e
--   registrar depois.
--
-- É SEGURO APLICAR A 030000 AGORA?
--   Sim. Ela é a ÚLTIMA migration do repositório que redefine
--   `get_auditoria_assim_periodo` (a anterior é 20260820170000, que é a base
--   declarada no cabeçalho dela). Não há versão mais nova para reverter.
--
-- ORDEM — as duas primeiras na MESMA janela, é requisito do cabeçalho da 030000
--   1) 20260821030000_conferencia_consome_vinculo.sql
--        a RPC passa a ler o vínculo: GLOSA_RESOLVIDA / LIBERADA,
--        possui_autorizacao, "Coberta pela guia N" na observação, e a guia
--        vinculada sai do pool posicional (isto corrige o pareamento de OUTRAS
--        sessões do mesmo dia, não só a coberta).
--   2) 20260821050000_alertas_glosa_resolvida_encerra.sql
--        sem ela a sessão reconciliada cai no `else` do CASE de classe e vira
--        'pendente_sem_desfecho': o alerta não fecha, TROCA de motivo. A tela
--        diria "glosa resolvida" e o sino seguiria apontando o mesmo
--        atendimento, com o rótulo errado.
--   3) 20260821040000_orfas_mesmo_pool_da_conferencia.sql — SÓ SE a sonda
--        abaixo disser que falta. Ver o passo 0.
--
-- =============================================================================
-- PASSO 0 — a 040000 já está viva?
-- =============================================================================
-- Ela move a exclusão de guia triada do WHERE externo para a CTE `guias`. Em
-- Postgres o WHERE roda ANTES do row_number(), então no lugar errado ela tira a
-- guia do RESULTADO sem tirar da NUMERAÇÃO — e a Reconciliação passa a oferecer
-- para vincular uma guia que a Conferência já considera casada, criando
-- cobertura dupla.
--
-- CORRIGIDO EM 2026-08-24. A primeira versão desta sonda comparava a POSIÇÃO de
-- `autorizacoes_vinculos` contra a de `row_number` e dava FALSO POSITIVO: nas
-- DUAS versões a exclusão aparece textualmente depois do `row_number()`, porque
-- as duas moram na mesma CTE e o `over (...)` é escrito antes do `where`.
--
-- O que de fato separa é o ALIAS que a exclusão referencia:
--   versão nova (040000): `v.guia = aa.guia`  -> dentro da CTE, sobre
--                                                `autorizacoes_assim aa`,
--                                                então afeta a NUMERAÇÃO;
--   versão antiga:        `v.guia = g.guia`   -> no WHERE externo, sobre a CTE
--                                                já numerada, então só tira do
--                                                RESULTADO.
select
  p.proname,
  (p.prosrc like '%v.guia = aa.guia%') as exclui_dentro_da_cte,
  (p.prosrc like '%v.guia = g.guia%')  as exclui_so_no_where_externo,
  case
    when p.prosrc like '%v.guia = aa.guia%' then 'OK — 040000 viva'
    when p.prosrc like '%v.guia = g.guia%'  then 'VERSAO ANTIGA — aplicar 040000'
    else 'NAO EXCLUI TRIADA — aplicar 040000'
  end as veredito,
  obj_description(p.oid, 'pg_proc') as comentario  -- a nova diz "Numera sobre o mesmo pool"
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_guias_orfas';


-- =============================================================================
-- PASSO 1 — aplicar
-- =============================================================================
-- No SQL Editor, colar e rodar o CONTEÚDO de cada arquivo, um por vez, na ordem
-- acima. Não rodar este snippet no lugar deles — ele não contém as funções.


-- =============================================================================
-- PASSO 2 — conferir que pegou
-- =============================================================================
-- Repetir supabase/snippets/20260824_vinculo_chegou_na_auditoria.sql.
-- Esperado na query 2: t / t / t.
-- Esperado na query 3, para a guia 118001:
--   situacao            = 'GLOSA_RESOLVIDA'
--   possui_autorizacao  = true
--   guia_na_linha       = '109797'   <- continua a ANTIGA, e está certo:
--                                       o vínculo não reescreve a autorização
--                                       que o pareamento casou com o bloco
--   observacao          = 'Glosa: 1013 - CADASTRO ... · Coberta pela guia
--                          118001 de DD/MM/AAAA HH24:MI — vínculo por Luana Calixto'


-- =============================================================================
-- PASSO 3 — parar de mentir no livro-caixa
-- =============================================================================
-- Rodar SÓ depois do passo 2 dar certo, e SÓ para as que de fato estão vivas.
-- Registrar uma migration que não está aplicada é pior que não registrar: o
-- próximo `db push` a pula em silêncio.
--
-- Tire da lista qualquer version que o passo 0/2 tenha mostrado como ausente.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20260821000000', 'reconciliacao_autorizacoes_vinculos'),
  ('20260821030000', 'conferencia_consome_vinculo'),
  ('20260821040000', 'orfas_mesmo_pool_da_conferencia'),
  ('20260821050000', 'alertas_glosa_resolvida_encerra')
on conflict (version) do nothing;

-- Confirmação final do livro-caixa.
select version, name
from supabase_migrations.schema_migrations
where version like '202608%'
order by version;


-- =============================================================================
-- PASSO 4 — os alertas fecham sozinhos?
-- =============================================================================
-- A Etapa 4 não fecha nada na hora: quem encerra é o laço de reconciliação da
-- própria função, no ciclo seguinte do cron `alertas-assim-avaliar`. Contar
-- antes e depois — nenhum `assim_sem_desfecho` novo deve nascer, e os
-- `assim_glosa` das sessões vinculadas devem fechar com resolucao='automatico'.
-- `public.alertas` não tem coluna `classe` — esse é o nome da variável DENTRO de
-- fn_alertas_avaliar_assim. Na tabela a classe é `regra_codigo`, e o recorte do
-- módulo é `modulo = 'assim'`.
select regra_codigo, status, resolucao, count(*)
from public.alertas
where modulo = 'assim'
group by 1, 2, 3
order by 1, 2, 3;
