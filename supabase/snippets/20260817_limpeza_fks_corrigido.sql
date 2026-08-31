-- ============================================================================
-- Correção: checagem de FK dos alvos da limpeza  —  2026-08-17
-- ============================================================================
-- A versão anterior (bloco F) usava:
--     confrelid::regclass::text in ('autorizacoes', ...)
-- e voltou VAZIA em silêncio. Motivo: sem `public` no search_path, o regclass
-- renderiza 'public.autorizacoes' e a comparação falha. Conclusão errada:
-- "não há FK apontando para os alvos". Havia — logs_autorizacao_id_fkey.
--
-- Aqui comparo relname via join, sem cast para texto. Também pega os nomes
-- com espaço/hífen, que o cast quotearia ("EM DESUSO - ...").
-- ============================================================================

with alvos(nome) as (
  values ('autorizacoes'), ('sessions'), ('terapeutas'), ('guia_terapias'),
         ('logs_execucao'), ('agenda_terapias'), ('remuneracao_historico'),
         ('acomp_auditoria'), ('guias_processadas'),
         ('EM DESUSO - remuneracao_contratos_atuais'),
         ('EM DESUSO - remuneracao_contratos_antigos')
)
select
  tgt.relname  as alvo_do_drop,
  src.relname  as tabela_que_depende,
  con.conname  as constraint_nome,
  pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
join pg_class tgt on tgt.oid = con.confrelid
join pg_class src on src.oid = con.conrelid
join alvos a      on a.nome = tgt.relname
where con.contype = 'f'
  and tgt.relnamespace = 'public'::regnamespace
order by tgt.relname, src.relname;


-- ----------------------------------------------------------------------------
-- A coluna logs.autorizacao_id ainda aponta para alguma coisa?
-- autorizacoes está com 0 linhas vivas desde 2026-04-16, e a FK exige linha
-- existente — então o esperado é 0 preenchidos. Confirme antes de dropar a
-- coluna (a migration faz isso de forma defensiva, mas veja o número).
-- ----------------------------------------------------------------------------
select count(*)                                as total_logs,
       count(autorizacao_id)                   as com_autorizacao_id,
       count(*) - count(autorizacao_id)        as nulos
from public.logs;
