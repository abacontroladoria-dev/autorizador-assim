-- =============================================================================
-- O vínculo da Reconciliação chega na aba Auditoria?
-- =============================================================================
--
-- POR QUE ESTE SNIPPET EXISTE
-- A aba Reconciliação grava em `autorizacoes_vinculos`, e quem faz esse vínculo
-- aparecer na aba Auditoria (situação GLOSA_RESOLVIDA, observação "Coberta pela
-- guia N", `possui_autorizacao` verdadeiro, guia fora do pool posicional) é UMA
-- migration: 20260821030000_conferencia_consome_vinculo.
--
-- O frontend das duas abas já está inteiro: SITUACAO_CONFIG tem GLOSA_RESOLVIDA
-- com badge próprio, `contarKpis` a desconta de `glosas` e a soma em
-- `glosas_resolvidas`, o KpiCards a mostra como dica no card de Glosas, e o
-- ModalDetalhamentoAtendimento preserva o motivo da recusa em GLOSA_RESOLVIDA.
-- Nada disso dispara se a RPC não devolver a situação.
--
-- Rodar no SQL Editor. As três perguntas são independentes; a 2 é a que decide.
-- =============================================================================

-- 1. A migration está no livro-caixa deste ambiente?
--    Vazio = nunca foi aplicada aqui.
select version, name
from supabase_migrations.schema_migrations
where version in ('20260821000000','20260821030000','20260821040000','20260824010000')
order by version;

-- 2. A FUNÇÃO viva conhece o vínculo?
--    Esta é a resposta que vale. O livro-caixa pode mentir nos dois sentidos —
--    migration registrada e depois sobrescrita por um CREATE OR REPLACE mais
--    novo, ou aplicada à mão no SQL Editor sem registro (ver
--    reference_db_push_blast_radius).
select
  p.proname,
  (p.prosrc like '%autorizacoes_vinculos%')                  as le_a_tabela_de_vinculos,
  (p.prosrc like '%GLOSA_RESOLVIDA%')                        as tem_o_ramo_glosa_resolvida,
  (p.prosrc like '%Coberta pela guia%')                      as escreve_na_observacao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_auditoria_assim_periodo','get_auditoria_assim')
order by p.proname;
-- Esperado em get_auditoria_assim_periodo: t / t / t.
-- Qualquer `f` = a aba Auditoria NÃO vai refletir vínculo nenhum, por mais que
-- a Reconciliação grave certo.

-- 3. Prova sobre um vínculo real: o que a Auditoria devolve para o bloco coberto?
--    Roda a RPC no dia da sessão vinculada mais recente e mostra a linha dela.
with alvo as (
  select v.guia, v.bloco_id, v.vinculado_por, v.vinculado_em,
         split_part(v.bloco_id, '_', 2)::date as dia
  from public.autorizacoes_vinculos v
  where v.desfeito_em is null
    and v.tipo = 'vinculo'
    and v.bloco_id is not null
  order by v.vinculado_em desc
  limit 1
)
select
  a.guia            as guia_vinculada,
  a.vinculado_por,
  a.vinculado_em,
  r.situacao,           -- esperado: GLOSA_RESOLVIDA (ou LIBERADA se não houve glosa)
  r.possui_autorizacao, -- esperado: true
  r.guia            as guia_na_linha,  -- continua a ANTIGA: o vínculo não a reescreve
  r.motivo_glosa,       -- o texto escrito à mão na aba Auditoria, se houver
  r.observacao          -- deve terminar em "· Coberta pela guia <N> de … — vínculo por …"
from alvo a
cross join lateral public.get_auditoria_assim_periodo(a.dia, a.dia) r
where r.bloco_id = a.bloco_id;
-- Zero linhas aqui e resultado `t` na 2 = o bloco saiu do recorte da auditoria
-- por outro motivo (falta lançada depois, ativo=false, terapia em blacklist).
