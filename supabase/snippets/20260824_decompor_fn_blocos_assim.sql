-- =============================================================================
-- Decompor fn_blocos_assim — os 48,9 s estão dentro dela
-- =============================================================================
-- Medido:
--   fn_blocos_assim(current_date-7, current_date)
--     actual time=48756.139..48850.892  rows=1483
--     Buffers: shared hit=54023
--     Execution Time: 49351.396 ms
--
-- Contra os 49.230 ms de get_guias_orfas inteira. Ou seja: 99,3% do tempo da RPC
-- é esta função. Tudo que a migration de ontem tocou vale ~0,4 s de 49 s.
--
-- E o número que aponta o caminho: 54.023 buffers em 48,9 s são 1.100
-- buffers/segundo. Página em cache se lê à ordem de um milhão por segundo. Então
-- o tempo NÃO está em acessar página — está em CPU por linha, repetida milhões
-- de vezes sobre poucas páginas. É laço aninhado, não varredura.
--
-- `Function Scan` não deixa ver o interior: fn_blocos_assim tem proconfig
-- (search_path=public), e proconfig impede o inlining de função SQL. Por isso
-- abaixo o corpo é reescrito inline — aí o plano aparece.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Antes de tudo: as estatísticas de agenda_tita estão 19 dias velhas
-- -----------------------------------------------------------------------------
-- Do bloco 4:
--   agenda_tita   last_autovacuum 2026-07-29 (26 dias)  last_autoanalyze 2026-08-05 (19 dias)
--                 n_live 80.980   n_dead 13.607   14,4% morto
--
-- agenda_tita é a tabela que dirige fn_blocos_assim, ela recebe sync diário, e o
-- planner está decidindo o plano com um retrato de 19 dias atrás. Estatística
-- velha é como um laço aninhado nasce: o planner estima "poucas linhas", escolhe
-- nested loop, e encontra muitas.
--
-- Isto é gratuito, roda em segundos e não muda dado nenhum. Fazer PRIMEIRO —
-- pode ser que sozinho já mude o plano.
analyze public.agenda_tita;
analyze public.fila_autorizacoes;
analyze public.autorizacoes_assim;

-- 1b. Repetir a medição do bloco 2 depois do analyze. Se cair de 48,9 s para
-- ordem de segundos, era só estatística velha e o resto deste arquivo fica sem
-- objeto.
explain (analyze, buffers, timing)
select count(*) from public.fn_blocos_assim(current_date - 7, current_date);


-- -----------------------------------------------------------------------------
-- 2. Se continuar lento: o corpo inline, com o plano à mostra
-- -----------------------------------------------------------------------------
-- Cópia literal do corpo de fn_blocos_assim (20260821000000:190-259), só que
-- como query solta — sem a função no meio, o EXPLAIN mostra cada nó.
--
-- Procurar na saída, em ordem de suspeita:
--   1. um nested loop cujo `loops=` esteja na casa dos milhares
--   2. `Seq Scan on fila_autorizacoes` com `Filter: ((paciente_id)::bigint = ...)`
--      e um `Rows Removed by Filter` gigante  ← o cast
--   3. `rows=` estimado muito diferente do `actual rows=`  ← estatística
explain (analyze, buffers, timing)
with agenda_tita_tuss as (
  select
    at.paciente_id,
    at.paciente_nome,
    at.data_atendimento,
    at.hora_inicial,
    at.terapia_nome,
    at.terapia_exibicao_nome,
    at.profissional_nome,
    at.convenio_nome,
    substring(at.numero_carteirinha, 1, 6)                         as empresa,
    substring(at.numero_carteirinha, 7, 7)                         as matricula,
    right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2) as dep,
    public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) as codigo_tuss
  from public.agenda_tita at
  where at.data_atendimento between current_date - 7 and current_date
    and at.ativo = true
    and at.convenio_nome ilike '%assim%'
    and at.paciente_nome <> all (array['Horário Administrativo','Notificação Prévia'])
),
agenda_filtrada as (
  select a.* from agenda_tita_tuss a
  where a.codigo_tuss is not null
    and not exists (
      select 1 from public.config_regras_terapias r
      where r.categoria = 'BLACKLIST_AUTORIZACAO'
        and r.ativo = true
        and a.terapia_nome ilike ('%' || r.terapia_nome || '%')
    )
),
agenda_sem_falta as (
  select a.* from agenda_filtrada a
  where not exists (
    select 1 from public.fila_autorizacoes f
    where f.paciente_id::bigint = a.paciente_id
      and f.data_atendimento = a.data_atendimento
      and f.horario = a.hora_inicial
      and (
        (f.status is distinct from 'glosa'
         and upper(coalesce(f.status_assim, '')) like '%FALTA%')
        or upper(coalesce(f.tipo_falta, '')) like '%PACIENTE%'
        or upper(coalesce(f.tipo_falta, '')) like '%TERAPEUTA%'
      )
  )
    and a.terapia_nome not ilike '%Aplicador ABA Escola%'
    and a.terapia_nome not ilike '%Aplicador ABA Casa%'
    and a.terapia_nome not ilike '%Aplicador Suporte%'
    and a.terapia_nome not ilike '%Supervisão ABA%'
)
select count(*) from agenda_sem_falta;


-- -----------------------------------------------------------------------------
-- 3. Isolar o suspeito: o mesmo bloco SEM a checagem de falta
-- -----------------------------------------------------------------------------
-- Se o bloco 2 der ~48 s e este der milissegundos, o culpado é o `not exists`
-- contra fila_autorizacoes — isto é, o cast `f.paciente_id::bigint`.
--
-- Confirmado pelo bloco 3 do snippet anterior:
--   fila_autorizacoes.paciente_id  →  text
--   agenda_tita.paciente_id        →  bigint
--
-- São tipos diferentes, então o cast é obrigatório para comparar — e envolvendo
-- a COLUNA ele torna inúteis os SEIS índices que já existem sobre
-- fila_autorizacoes(paciente_id): idx_fila_paciente, fila_autorizacoes_unique,
-- unique_fila_agendamento, idx_fila_data_atend, idx_fila_autorizacoes_lookup,
-- idx_fila_autorizacoes_auditoria. Nenhum deles pode ser usado. A tabela tem só
-- 28.147 linhas, o que é irrisório para uma varredura — mas não para milhares de
-- varreduras, uma por linha da agenda.
explain (analyze, buffers, timing)
with agenda_tita_tuss as (
  select
    at.paciente_id, at.data_atendimento, at.hora_inicial,
    at.terapia_nome, at.terapia_exibicao_nome,
    public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) as codigo_tuss
  from public.agenda_tita at
  where at.data_atendimento between current_date - 7 and current_date
    and at.ativo = true
    and at.convenio_nome ilike '%assim%'
    and at.paciente_nome <> all (array['Horário Administrativo','Notificação Prévia'])
)
select count(*) from agenda_tita_tuss a where a.codigo_tuss is not null;


-- -----------------------------------------------------------------------------
-- 4. Qual seria a correção do cast
-- -----------------------------------------------------------------------------
-- NÃO RODAR AINDA — depende do que o bloco 2 mostrar. Fica aqui escrito para a
-- decisão ser sobre algo concreto.
--
-- Opção A — índice de expressão. Mínima, não mexe em schema nem em código:
--
--   create index concurrently idx_fila_paciente_id_bigint
--     on public.fila_autorizacoes ((paciente_id::bigint));
--
--   Risco: se alguma linha de fila_autorizacoes tiver paciente_id não-numérico,
--   o CREATE INDEX falha na hora (e hoje o `not exists` estaria estourando erro
--   de cast em produção, o que sugere que todas são numéricas — mas conferir):
--
--     select count(*) from public.fila_autorizacoes
--     where paciente_id !~ '^\d+$';
--
-- Opção B — inverter o cast, sem índice novo:
--
--     where f.paciente_id = a.paciente_id::text
--
--   Aí a expressão fica do lado da agenda e a coluna de fila_autorizacoes fica
--   crua, usável por idx_fila_paciente e companhia. É a correção mais barata e
--   não cria objeto nenhum. Só é equivalente se todo paciente_id de
--   fila_autorizacoes for a representação canônica do bigint (sem zero à
--   esquerda, sem espaço). O select abaixo verifica:
--
--     select count(*) from public.fila_autorizacoes
--     where paciente_id ~ '^\d+$'
--       and paciente_id <> (paciente_id::bigint)::text;
--
-- Opção C — arrumar o tipo da coluna. Correta e a mais cara; fila_autorizacoes
-- tem 12 índices e é escrita pelo robô o tempo todo. Não agora.
--
-- Preferência: B se o segundo select vier 0, senão A.
