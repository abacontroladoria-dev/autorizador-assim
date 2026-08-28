-- ============================================================================
-- Limpeza de relações mortas + remoção das páginas /agenda/* e /guias-digitais
-- ============================================================================
-- Levantamento em supabase/snippets/20260817_inventario_limpeza.sql e
-- _rodada2.sql. Cada DROP abaixo passou por QUATRO provas independentes:
--   1. nenhuma view a consome        (pg_depend / pg_rewrite)
--   2. nenhuma função a lê           (corpo inspecionado À MÃO, ver nota)
--   3. nenhum job de cron a cita     (cron.job)
--   4. zero acesso no código do app  (.from()/REST, varredura do repo)
--
-- NOTA sobre a prova 2: a busca por regex no corpo das funções produz falso
-- positivo, porque um CTE chamado `terapeutas` é textualmente idêntico à
-- tabela `terapeutas`. Três candidatos caíram nessa armadilha e só foram
-- liberados depois de ler o trecho:
--   . autorizacoes  em get_auditoria_assim      -> é CTE (lê autorizacoes_assim)
--   . autorizacoes  em log_authorization_access -> é string literal
--   . autorizacoes  em robo_concluir_tarefa     -> é comentário citando
--                                                  /api/fila-autorizacoes/...
--                                                  (o hífen quebra \m\M)
--   . sessions      em count_test_data          -> é rótulo; FROM real é
--                                                  cco.atendimentos
--   . terapeutas    em refresh_dashboard_kpis   -> é CTE (lê
--                                                  grade_profissionais_tita)
-- Em compensação `auditoria_glosa_motivos` PARECIA morta (0 linhas) e é uso
-- real (LEFT JOIN em get_auditoria_assim) — por isso NÃO está aqui.
--
-- RESTRICT (padrão) de propósito: se sobrou dependência que não enxerguei,
-- quero o DROP falhando alto, não levando coisa junto com CASCADE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. PREFLIGHT — recusa rodar se houver FK que eu não previ
-- ----------------------------------------------------------------------------
-- Contexto: a checagem de FK do levantamento estava ERRADA. Usava
-- `confrelid::regclass::text in ('autorizacoes', ...)` e, sem `public` no
-- search_path, o regclass rende 'public.autorizacoes' — a query voltou vazia
-- EM SILÊNCIO e eu concluí que não havia FK nenhuma. Havia:
-- logs_autorizacao_id_fkey, que fez o primeiro DROP bater no RESTRICT.
--
-- Em vez de confiar que a segunda versão da query cobriu tudo, este bloco
-- confere dentro da própria transação, comparando relname por join (sem cast
-- para texto). Qualquer FK apontando para um alvo — exceto a única que trato
-- explicitamente na seção 1 — aborta a migration com o nome na tela.
-- A regra: uma FK só atrapalha se a tabela FILHA sobreviver à migration. Se a
-- filha também está na lista de DROP, a amarra morre junto com ela — basta a
-- filha cair antes da mãe, o que a seção 3 já faz (guia_terapias antes de
-- terapeutas). Minha primeira versão deste bloco liberava só uma FK nomeada e
-- teria abortado uma migration correta por causa desse par.
do $$
declare
  v_alvos text[] := array[
    'autorizacoes', 'sessions', 'terapeutas', 'guia_terapias',
    'logs_execucao', 'agenda_terapias', 'remuneracao_historico',
    'acomp_auditoria', 'guias_processadas',
    'EM DESUSO - remuneracao_contratos_atuais',
    'EM DESUSO - remuneracao_contratos_antigos'
  ];
  v_pendentes text;
begin
  select string_agg(
           format('%s -> %s (%s)', src.relname, tgt.relname, con.conname),
           E'\n  ' order by tgt.relname, src.relname)
    into v_pendentes
  from pg_constraint con
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_class src on src.oid = con.conrelid
  where con.contype = 'f'
    and tgt.relnamespace = 'public'::regnamespace
    and tgt.relname = any (v_alvos)
    -- filha sobrevive? entao a FK precisa de tratamento explicito
    and not (src.relname = any (v_alvos))
    -- a unica filha sobrevivente prevista: tratada na secao 1
    and not (src.relname = 'logs' and con.conname = 'logs_autorizacao_id_fkey');

  if v_pendentes is not null then
    raise exception
      E'FK de tabela SOBREVIVENTE apontando para alvo do DROP:\n  %\n\nTrate cada uma explicitamente antes de rodar. NAO use CASCADE.',
      v_pendentes;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Relações mortas há meses
-- ----------------------------------------------------------------------------
-- Par fechado: a tabela só alimentava esta view, e a view ninguém lê.
-- A view cai primeiro, senão o RESTRICT da tabela barra (corretamente).
drop view  if exists public.vw_acomp_auditoria;
drop table if exists public.acomp_auditoria;

-- Zero linhas desde sempre, nenhum insert na história das estatísticas
-- (acumuladas desde 2026-03-30).
drop table if exists public.logs_execucao;
drop table if exists public.remuneracao_historico;

-- 5 ins / 5 upd / 5 del em 140 dias: um teste, e nada mais.
drop table if exists public.agenda_terapias;

-- Último write em 2026-04-16. Sucedida por autorizacoes_assim + fila_autorizacoes.
-- Os 3 triggers (set_updated_at, log_authorization_access, update_updated_at_column)
-- caem junto com a tabela — não precisam de DROP próprio.
--
-- MAS `logs` tem FK para cá (logs_autorizacao_id_fkey), e `logs` está viva
-- (46 mil linhas, escrita por robo_registrar_log). A primeira tentativa deste
-- arquivo bateu no RESTRICT por causa dela — de propósito, é para isso que o
-- RESTRICT existe. Solto a amarra explicitamente, em vez de usar CASCADE:
-- assim o que cai está escrito aqui, e qualquer OUTRA dependência que eu não
-- tenha visto continua barrando o DROP.
alter table public.logs drop constraint if exists logs_autorizacao_id_fkey;

-- A coluna fica órfã: apontava só para esta tabela. A FK exigia linha
-- existente e autorizacoes está zerada desde abril, então o esperado é que
-- esteja 100% nula. Confiro antes de remover em vez de assumir — se houver
-- valor, aborto a migration inteira e a coluna fica para análise.
do $$
declare
  v_preenchidos bigint;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'logs' and column_name = 'autorizacao_id'
  ) then
    select count(autorizacao_id) into v_preenchidos from public.logs;

    if v_preenchidos > 0 then
      raise exception
        'logs.autorizacao_id tem % linha(s) preenchida(s); esperado 0. Migration abortada — investigue antes de dropar a coluna.',
        v_preenchidos;
    end if;

    alter table public.logs drop column autorizacao_id;
  end if;
end $$;

drop table if exists public.autorizacoes;

-- Nunca teve linha. Só era citada por count_test_data, como rótulo de texto.
drop table if exists public.sessions;

-- ----------------------------------------------------------------------------
-- 2. As duas "EM DESUSO -"
-- ----------------------------------------------------------------------------
-- O nome já anunciava. A fonte viva de contrato é remuneracao_contratos_itens.
-- Bloco J confirmou: nenhuma função, view ou cron as cita.
drop table if exists public."EM DESUSO - remuneracao_contratos_atuais";
drop table if exists public."EM DESUSO - remuneracao_contratos_antigos";

-- ----------------------------------------------------------------------------
-- 3. Fluxo /guias-digitais — a feature saiu do código nesta mesma mudança
-- ----------------------------------------------------------------------------
-- guia_terapias e terapeutas estavam vazias porque a tela nunca funcionou
-- (carimbo sempre vazio); guias_processadas tem 14 linhas de tentativa.
-- Únicos leitores eram a página, a rota /api/guias-digitais/processar e a
-- Edge Function processar-guias — todos removidos agora.
--
-- ORDEM IMPORTA: guia_terapias.terapeuta_id tem FK para terapeutas
-- (guia_terapias_terapeuta_id_fkey). A filha cai primeiro e leva a FK consigo;
-- invertendo as duas linhas, o RESTRICT barra terapeutas. Não reordene.
drop table if exists public.guia_terapias;   -- filha (FK -> terapeutas)
drop table if exists public.terapeutas;      -- mãe
drop table if exists public.guias_processadas;

-- ----------------------------------------------------------------------------
-- 4. Permissões órfãs das páginas removidas
-- ----------------------------------------------------------------------------
-- Sem isso as telas somem mas o código de permissão continua listado em
-- /admin/permissoes, oferecendo acesso a rota que devolve 404.
--
-- As concessões em usuarios_permissoes caem sozinhas: a FK
-- permissao_codigo -> permissoes(codigo) é ON DELETE CASCADE.
--
-- Atenção ao homônimo: existe um ROLE de usuário chamado 'cronograma' (setor),
-- que NÃO tem relação com este código de permissão e continua válido. E as
-- rotas /cronograma/* vivas usam códigos próprios (cronograma_solicitacoes,
-- cronograma_saida_profissional, ocupacao_clinica, ...) — nenhuma delas é
-- afetada por este delete.
delete from public.permissoes
where codigo in ('cronograma', 'agenda_terapeutica', 'salas', 'guias_digitais');

commit;
