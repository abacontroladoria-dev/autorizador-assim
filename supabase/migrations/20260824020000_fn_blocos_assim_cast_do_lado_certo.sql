-- =============================================================================
-- O cast muda de lado, e o anti-join volta a ser sondagem de índice
-- =============================================================================
-- Continuação de 20260824000000/20260824010000, que atacaram a metade errada.
-- Medido em 24/08, janela de 7 dias:
--
--   get_guias_orfas(current_date-7, current_date) .... 49.230 ms
--     └─ fn_blocos_assim, sozinha ................... 48.850 ms   (99,3%)
--
-- Um `analyze public.agenda_tita` levou fn_blocos_assim de 48.850 para 13.126 ms
-- — as estatísticas estavam 19 dias velhas. Mas os buffers não se moveram
-- (54.023 → 53.938): o plano continuou o mesmo, só deixou de disputar CPU com um
-- autovacuum de 25 minutos. Os 13 s são estruturais, e é isso que esta migration
-- trata.
--
-- ONDE OS 13 SEGUNDOS ESTÃO
-- Rodando o corpo inline, o plano aparece:
--
--   Merge Anti Join
--     Merge Cond:  (at.data_atendimento = f.data_atendimento)
--     Join Filter: ((f.horario = at.hora_inicial) AND ((f.paciente_id)::bigint = at.paciente_id))
--     Rows Removed by Join Filter: 114012
--     ->  Index Scan ... on agenda_tita          rows=1814
--     ->  Sort                                   rows=119712   ← 6.374 relidas 19x
--           ->  Seq Scan on fila_autorizacoes    rows=6374   (947 ms)
--
-- Ler isto com atenção: das três igualdades do `not exists`, só UMA virou
-- condição de junção — `data_atendimento`. As outras duas caíram em `Join
-- Filter`, isto é, viraram teste linha a linha DEPOIS do casamento. E
-- `data_atendimento` numa janela de 7 dias tem 7 valores distintos, então o
-- merge join rebobina o lado interno a cada repetição: 6.374 linhas saem do Seq
-- Scan e 119.712 entram no join. 114.012 pares são formados e descartados.
--
-- O motivo de `paciente_id` não poder ser chave de junção é o cast:
--
--     where f.paciente_id::bigint = a.paciente_id
--
-- `fila_autorizacoes.paciente_id` é text, `agenda_tita.paciente_id` é bigint —
-- comparar exige converter um dos dois. Convertendo a COLUNA de
-- fila_autorizacoes, ela deixa de ser uma coluna aos olhos do planner e passa a
-- ser uma expressão: inelegível como chave de merge ou hash, e invisível para os
-- SEIS índices que já existem sobre ela (idx_fila_paciente,
-- fila_autorizacoes_unique, unique_fila_agendamento, idx_fila_data_atend,
-- idx_fila_autorizacoes_lookup, idx_fila_autorizacoes_auditoria).
--
-- É a mesma classe de defeito que 20260824010000 tirou do outro predicado — a
-- coluna dentro de uma expressão —, sobrevivendo na função que aquela chama.
--
-- A CORREÇÃO
-- O cast vai para o outro lado:
--
--     where f.paciente_id = a.paciente_id::text
--
-- Agora a expressão está sobre `agenda_tita.paciente_id`, que é o lado externo
-- do laço e é avaliado uma vez por linha de qualquer jeito, e
-- `fila_autorizacoes.paciente_id` fica crua. As três igualdades passam a casar
-- exatamente com `unique_fila_agendamento (paciente_id, data_atendimento,
-- horario)`, e o anti-join vira uma sondagem de índice por linha da agenda —
-- 1.814 sondagens em vez de 119.712 pares descartados. O filtro de OR sobre
-- status/status_assim/tipo_falta continua onde estava, só que aplicado às pouquíssimas
-- linhas que a sondagem devolve, em vez de a 28.147.
--
-- POR QUE ISSO É EQUIVALENTE, E NÃO SÓ PARECIDO
-- Trocar o lado do cast só preserva a semântica se todo `paciente_id` de
-- fila_autorizacoes for a representação canônica de um bigint — '007' e '7'
-- casariam pelo cast antigo e não casam pelo novo. Medido antes de escrever:
--
--   select count(*) from fila_autorizacoes where paciente_id !~ '^\d+$';                    → 0
--   select count(*) from fila_autorizacoes
--    where paciente_id ~ '^\d+$' and paciente_id <> (paciente_id::bigint)::text;            → 0
--
-- Zero não-numéricos e zero não-canônicos. E, ao contrário de um índice de
-- expressão sobre `(paciente_id::bigint)`, esta correção não transforma essa
-- medição numa restrição permanente: se um dia a ASSIM mandar um paciente_id
-- estranho, ele entra na tabela e some da consulta — não derruba o INSERT do
-- robô, que escreve aqui o tempo todo.
--
-- O QUE ESTA MIGRATION NÃO FAZ
-- O mesmo cast aparece em 25 lugares da família ASSIM/auditoria
-- (get_auditoria_assim_periodo, get_tokens_mensal, sync_assim_results,
-- vw_central_autorizacoes...). É bug sistêmico, não deslize isolado. Aqui só o
-- caminho medido é tocado. O resto precisa de decisão própria — em particular
-- get_auditoria_assim_periodo, de quem esta função é cópia fiel por desenho
-- (20260821000000:156-168) e que get_candidatas_vinculo chama OITO vezes por
-- clique, ainda sob `statement_timeout = 55s`.
--
-- Todo o resto do corpo é idêntico a 20260821000000:169-260. Uma linha muda.
-- =============================================================================

create or replace function public.fn_blocos_assim(p_de date, p_ate date)
returns table (
  bloco_id           text,
  paciente_id        bigint,
  paciente_nome      text,
  empresa            text,
  matricula          text,
  dep                text,
  data_atendimento   date,
  hora_inicial       time without time zone,
  codigo_tuss        text,
  convenio_nome      text,
  terapias           text,
  profissionais      text,
  quantidade_sessoes bigint
)
language sql
stable
security invoker
set search_path = public
as $$
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
    where at.data_atendimento between p_de and p_ate
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
      -- O cast está sobre a coluna da AGENDA, não sobre a da fila. Invertido, o
      -- planner perde `paciente_id` como chave de junção, sobra só
      -- `data_atendimento` (7 valores distintos numa semana), e o merge join
      -- rebobina o lado interno 19 vezes — 119.712 linhas para descartar 114.012.
      -- Deste lado, as três igualdades casam com unique_fila_agendamento.
      where f.paciente_id = a.paciente_id::text
        and f.data_atendimento = a.data_atendimento
        and f.horario = a.hora_inicial
        and (
          -- Linha em 'glosa' não é falta: o motivo por extenso pode conter a
          -- palavra FALTA ("FALTA DE COBERTURA CONTRATUAL") e a sessão sumiria
          -- da tela justamente quando mais precisa ser vista. Guarda idêntica à
          -- da RPC (20260820150000:211-218).
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
  select
    concat_ws('_', asf.paciente_id, asf.data_atendimento, asf.codigo_tuss, asf.hora_inicial) as bloco_id,
    asf.paciente_id,
    asf.paciente_nome,
    asf.empresa,
    asf.matricula,
    asf.dep,
    asf.data_atendimento,
    asf.hora_inicial,
    asf.codigo_tuss,
    asf.convenio_nome,
    string_agg(distinct asf.terapia_exibicao_nome, ' | ' order by asf.terapia_exibicao_nome) as terapias,
    string_agg(distinct asf.profissional_nome,     ' | ' order by asf.profissional_nome)     as profissionais,
    count(*) as quantidade_sessoes
  from agenda_sem_falta asf
  group by asf.paciente_id, asf.paciente_nome, asf.empresa, asf.matricula, asf.dep,
           asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss, asf.convenio_nome
$$;

comment on function public.fn_blocos_assim(date, date) is
  'Blocos da Conferência ASSIM (cópia fiel da CTE blocos_auditoria de get_auditoria_assim_periodo). Existe porque a RPC completa estoura o statement_timeout em janelas largas e a reconciliação só precisa contar sessões por partição. A checagem de falta compara paciente_id com o cast do lado da agenda (a.paciente_id::text), e não sobre f.paciente_id: assim as três igualdades casam com unique_fila_agendamento e o anti-join vira sondagem de índice.';
