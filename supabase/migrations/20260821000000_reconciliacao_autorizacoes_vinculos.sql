-- =============================================================================
-- Reconciliação de Autorizações ASSIM — ETAPA 1 (banco, aditivo e INERTE)
-- =============================================================================
--
-- O PROBLEMA
-- O match sessão↔autorização da Conferência é POSICIONAL: dentro da partição
-- (empresa, matricula, dep, dia, codigo_tuss), a n-ésima autorização por
-- data_execucao casa com a n-ésima sessão por hora_inicial
-- (20260820150000_glosa_codigos_descricao_completa.sql:294-336).
--
-- Quando a recepção solicita pelo Pulsar, a ASSIM glosa, e o setor de
-- autorização consegue a liberação DEPOIS no portal, a partição fica com uma
-- guia a mais que sessões. A glosa (ordem 1) casa com a sessão; a liberação
-- (ordem 2) fica órfã. A sessão segue GLOSA para sempre.
--
-- Caso medido em produção (2026-08-20), KOURTNEY SAVINO LOPE:
--   partição 004653 · 0029390 · 01 · 2026-08-03 · TUSS 22070435
--     ordem 1   guia  9229   11:25   "1403-NAO EXISTE INFORMACA"
--     ordem 2   guia 15032   14:39   "Liberado"          <- órfã
--   sessões na partição: 1 (11:20, Psicopedagogia)
--
-- Medição da Etapa 0 (janela real 2026-07-21..2026-08-20, 31 dias — a tabela
-- autorizacoes_assim não tem linha anterior a 21/07):
--   18 guias órfãs (0,35% das 5.169 'Liberado');
--   11 delas com candidata em GLOSA => ~19% das 58 glosas do período;
--   distância máxima observada +3,16 dias (p99 +3,15d), daí p_janela_dias = 7;
--   6 blocos de 8.743 com quantidade_sessoes > 1, todos já LIBERADA.
--
-- O QUE ESTA MIGRATION FAZ
-- Cria a camada de vínculo e as RPCs de leitura/escrita. NADA passa a consumir
-- o vínculo: get_auditoria_assim_periodo e fn_alertas_avaliar_assim não são
-- tocadas aqui (Etapas 3 e 4). Depois desta migration o sistema se comporta
-- exatamente como antes.
--
-- POR QUE TABELA NOVA, E NÃO COLUNA NAS EXISTENTES
--   1. `autorizacoes_assim` é escrita por um robô FORA deste repositório (o cron
--      sync_assim_status foi desagendado em 20260814100200:9-28 justamente por
--      não existir; quem alimenta a tabela é o robô do relatório). Não
--      controlamos o upsert dele.
--   2. Escrever em `fila_autorizacoes` é perigoso: robo_buscar_tarefa filtra por
--      `status`, e mexer nisso já causou reautorização dupla — "1601-REINCIDENCIA"
--      (20260814120000_sync_assim_conclui_pendente.sql:1-18).
--   3. Precisamos de autoria e de desfazer.
-- =============================================================================


-- =============================================================================
-- 1. A tabela do vínculo
-- =============================================================================

create table if not exists public.autorizacoes_vinculos (
  id             uuid primary key default gen_random_uuid(),

  -- A guia que cobre. FK real: `guia` é a PK de autorizacoes_assim.
  -- RESTRICT e não CASCADE: se o robô do relatório algum dia apagar uma linha,
  -- é melhor o delete falhar do que a auditoria do vínculo desaparecer calada.
  guia           text not null references public.autorizacoes_assim(guia) on delete restrict,

  -- 'vinculo'    = a guia cobre o bloco em `bloco_id`.
  -- 'sem_sessao' = a guia não corresponde a nenhuma sessão (autorização extra).
  --   Este segundo tipo NÃO é enfeite: 7 das 18 órfãs medidas na Etapa 0 têm
  --   como candidata mais próxima um bloco JÁ LIBERADA. Vinculá-las seria errado,
  --   e sem uma forma de descartá-las elas poluem a fila de trabalho para sempre.
  tipo           text not null default 'vinculo',

  -- A sessão coberta. REFERÊNCIA PRINCIPAL: é por ela que a cobertura entra na
  -- Conferência (Etapa 3). Sem FK porque não existe tabela de blocos — é um
  -- derivado `pacienteId_YYYY-MM-DD_TUSS_HH:MM:SS` (20260820150000:233). Mesma
  -- limitação de auditoria_glosa_motivos, que já usa bloco_id como PK
  -- (20260522160000_add_motivo_glosa_auditoria.sql:3-7). A integridade vive nas
  -- validações de vincular_autorizacao(), não numa constraint.
  bloco_id       text,

  -- A solicitação original do Pulsar. Rastreabilidade, não cobertura. NULO no
  -- Cenário B (sessão que nunca foi solicitada pelo Pulsar).
  -- SET NULL: perder a linha da fila não deve derrubar o vínculo, que se
  -- sustenta em bloco_id.
  fila_id        uuid references public.fila_autorizacoes(id) on delete set null,

  -- A guia glosada que esta substitui, copiada da fila no momento do vínculo.
  -- Congelada de propósito: o histórico da glosa é o que dá sentido ao vínculo,
  -- e `fila_autorizacoes.numero_autorizacao` pode ser sobrescrito depois.
  guia_original  text,

  observacao     text,

  vinculado_por  text not null,
  vinculado_por_id uuid,
  vinculado_em   timestamptz not null default now(),

  -- Desfazer é soft: um vínculo errado tem de deixar rastro.
  desfeito_por   text,
  desfeito_por_id uuid,
  desfeito_em    timestamptz,
  desfeito_motivo text,

  constraint autorizacoes_vinculos_tipo_ck
    check (tipo in ('vinculo', 'sem_sessao')),

  -- O tipo define a forma da linha. Sem isto seria possível gravar um
  -- 'sem_sessao' apontando para um bloco, e a Etapa 3 leria cobertura onde o
  -- operador disse justamente que não havia sessão.
  constraint autorizacoes_vinculos_forma_ck
    check (
      (tipo = 'vinculo'    and bloco_id is not null) or
      (tipo = 'sem_sessao' and bloco_id is null and fila_id is null)
    )
);

comment on table public.autorizacoes_vinculos is
  'Reconciliação manual: guia autorizada por fora do Pulsar -> sessão que ela cobre. Aditiva e reversível; não altera fila_autorizacoes nem autorizacoes_assim.';
comment on column public.autorizacoes_vinculos.bloco_id is
  'Sessão coberta (referência principal). Formato pacienteId_YYYY-MM-DD_TUSS_HH:MM:SS, igual ao bloco_id de get_auditoria_assim_periodo.';
comment on column public.autorizacoes_vinculos.fila_id is
  'Solicitação original do Pulsar, quando existir. Rastreabilidade — a cobertura vem de bloco_id.';
comment on column public.autorizacoes_vinculos.tipo is
  'vinculo = cobre o bloco; sem_sessao = autorização extra, sem sessão correspondente (39% das órfãs medidas na Etapa 0).';

-- Uma guia ativa resolve no máximo uma coisa — vínculo OU descarte.
create unique index if not exists autorizacoes_vinculos_guia_ativa_uq
  on public.autorizacoes_vinculos (guia)
  where desfeito_em is null;

-- Uma sessão é coberta por no máximo uma guia ativa.
-- Seguro: dos 8.743 blocos medidos, 6 têm quantidade_sessoes > 1 (dois
-- aplicadores no mesmo horário e TUSS, padrão de Psicologia ABA) e todos já
-- estão LIBERADA. E a Conferência JÁ os trata como uma linha só — bloco_id não
-- os distingue —, então a constraint não estreita nada que hoje seja largo.
create unique index if not exists autorizacoes_vinculos_bloco_ativo_uq
  on public.autorizacoes_vinculos (bloco_id)
  where desfeito_em is null and tipo = 'vinculo';

create index if not exists autorizacoes_vinculos_bloco_idx
  on public.autorizacoes_vinculos (bloco_id) where desfeito_em is null;

alter table public.autorizacoes_vinculos enable row level security;

-- Leitura para qualquer autenticado (a Conferência inteira já é assim).
-- Escrita NÃO tem policy de propósito: só entra pelas RPCs SECURITY DEFINER
-- abaixo, que é onde as validações de integridade vivem. Um INSERT direto do
-- cliente falha, e é isso que queremos.
drop policy if exists "autorizacoes_vinculos_select" on public.autorizacoes_vinculos;
create policy "autorizacoes_vinculos_select" on public.autorizacoes_vinculos
  for select to authenticated using (true);

-- O default do Supabase dá INSERT/UPDATE/DELETE a `anon` em toda tabela nova do
-- schema public. A RLS já barra, mas privilégio que ninguém usa é privilégio a
-- menos para auditar. Aqui, diferente de glosa_codigos, o SELECT não volta: esta
-- tabela tem dado de paciente (bloco_id embute o paciente_id).
revoke all on public.autorizacoes_vinculos from anon;


-- =============================================================================
-- 2. fn_blocos_assim — os blocos da Conferência, isolados
-- =============================================================================
-- Cópia FIEL da CTE `blocos_auditoria` de get_auditoria_assim_periodo
-- (20260820150000:173-250): mesmos filtros, mesmo GROUP BY, mesmo bloco_id.
--
-- POR QUE DUPLICAR EM VEZ DE CHAMAR A RPC
-- get_auditoria_assim_periodo estoura o statement_timeout numa janela de 7 dias
-- (medido: a semana de 01–07/08/2026 falhou e teve de ser refeita dia a dia).
-- get_guias_orfas precisa varrer um mês, e só precisa CONTAR sessões por
-- partição — não precisa do join da fila, nem do match posicional, nem dos
-- LATERAL de glosa. Esta função é a parte barata.
--
-- DÍVIDA ASSUMIDA: são duas cópias dos mesmos filtros. Se a RPC mudar, esta
-- função precisa ser reconferida. A Etapa 3 deve reescrever
-- get_auditoria_assim_periodo POR CIMA desta função e matar a duplicação.
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
      where f.paciente_id::bigint = a.paciente_id
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
  'Blocos da Conferência ASSIM (cópia fiel da CTE blocos_auditoria de get_auditoria_assim_periodo). Existe porque a RPC completa estoura o statement_timeout em janelas largas e a reconciliação só precisa contar sessões por partição.';

grant execute on function public.fn_blocos_assim(date, date) to authenticated;


-- =============================================================================
-- 3. get_guias_orfas — o lado esquerdo da tela
-- =============================================================================
-- Órfã = guia 'Liberado' EXCEDENTE da partição posicional, ainda não triada.
--
-- NÃO usamos `not exists (fa.numero_autorizacao = aa.guia)` cru. Esse é o
-- critério do ramo `guias_sem_fila` de vw_match_autorizacoes_assim
-- (20260805124824_remote_schema.sql:1784-1803) e é inseguro: o número da guia
-- RECICLA — 4.652 repetidos em 12.883 linhas (20260805170300:99-107). Toda
-- comparação por número aqui é qualificada por uma janela de ±5 min.
create or replace function public.get_guias_orfas(p_de date, p_ate date)
returns table (
  guia                text,
  carteirinha         text,
  paciente_id         bigint,
  paciente_nome       text,
  data_execucao       timestamp without time zone,
  codigo_tuss         text,
  status              text,
  teve_token          boolean,
  token               text,
  biofacial           text,
  ordem_autorizacao   bigint,
  sessoes_na_particao bigint
)
language sql
stable
security definer
set search_path = public
set statement_timeout = '55s'
as $$
  with n_sessoes as (
    select b.empresa, b.matricula, b.dep, b.data_atendimento, b.codigo_tuss,
           count(*) as n
    from public.fn_blocos_assim(p_de, p_ate) b
    group by 1,2,3,4,5
  ),
  guias as (
    select
      aa.guia,
      aa.matricula as carteirinha,
      aa.paciente_id,
      aa.paciente_nome,
      aa.data_execucao,
      aa.codigo_tuss,
      aa.status,
      aa.teve_token,
      aa.token,
      aa.biofacial,
      split_part(aa.matricula, '.', 1) as empresa,
      split_part(aa.matricula, '.', 2) as matricula_base,
      split_part(aa.matricula, '.', 3) as dep,
      row_number() over (
        partition by split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                     split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
        order by aa.data_execucao
      ) as ordem_autorizacao
    from public.autorizacoes_assim aa
    -- ATENÇÃO: nada de filtro de `status` AQUI. O WHERE roda antes da função de
    -- janela, então filtrar aqui removeria a glosa da partição e a liberação
    -- posterior viraria ordem 1 — deixando de ser excedente. O caso da Kourtney
    -- desapareceria: 9229 fora, 15032 vira ordem 1, 1 > 1 é falso.
    -- A CTE `autorizacoes` da RPC também numera TODAS as guias do dia
    -- (20260820150000:306-321); o status só entra depois. `status` e
    -- `codigo_tuss` são filtrados no WHERE final.
    where aa.data_execucao is not null      -- há 2 linhas de teste em produção
                                            -- (TESTE123/TESTE999) com tudo nulo
      and date(aa.data_execucao) between p_de and p_ate
  )
  select
    g.guia, g.carteirinha, g.paciente_id, g.paciente_nome, g.data_execucao,
    g.codigo_tuss, g.status, g.teve_token, g.token, g.biofacial,
    g.ordem_autorizacao, coalesce(ns.n, 0) as sessoes_na_particao
  from guias g
  left join n_sessoes ns
    on  ns.empresa          = g.empresa
    and ns.matricula        = g.matricula_base
    and ns.dep              = g.dep
    and ns.data_atendimento = date(g.data_execucao)
    and ns.codigo_tuss      = g.codigo_tuss
  where g.status = 'Liberado'        -- 'Liberado *' = cancelada; o resto é glosa
    and g.codigo_tuss is not null
    and g.ordem_autorizacao > coalesce(ns.n, 0)
    -- já triada (vinculada ou descartada)
    and not exists (
      select 1 from public.autorizacoes_vinculos v
      where v.guia = g.guia and v.desfeito_em is null
    )
    -- e não é guia que o próprio Pulsar capturou
    and not exists (
      select 1 from public.fila_autorizacoes fa
      where fa.numero_autorizacao = g.guia
        and fa.horario_autorizacao is not null
        and abs(extract(epoch from (fa.horario_autorizacao - g.data_execucao))) <= 300
    )
  order by g.data_execucao desc, g.guia
$$;

comment on function public.get_guias_orfas(date, date) is
  'Guias ASSIM liberadas que sobraram do match posicional e ainda não foram triadas. Lado esquerdo da aba Reconciliação.';


-- =============================================================================
-- 4. get_candidatas_vinculo — o lado direito da tela
-- =============================================================================
-- Sessões do MESMO beneficiário e MESMO TUSS numa janela RETROATIVA a partir da
-- data da autorização.
--
-- POR QUE RETROATIVA
-- A Etapa 0 mediu, sobre as 18 órfãs reais: distância máxima +3,16 dias; 11 das
-- 18 no mesmo dia; zero adiantadas entre as que têm candidata em GLOSA. Janela
-- de 3 dias perderia o lote de +3,16d (5 guias reautorizadas em bloco, ENZO
-- GABRIEL, 23/07 16:19–16:52); 5 e 7 dias dão resultado idêntico. 7 é o platô,
-- cobre o máximo observado com o dobro de folga, e casa com "na mesma semana".
-- RESSALVA: 1 das 18 é adiantada (−4,94d) e uma janela retroativa não a alcança.
-- Com 31 dias de dados não há como dizer se é exceção ou padrão raro.
--
-- POR QUE CHAMAR A RPC EM FATIAS DE UM DIA
-- A `situacao` que o operador vê aqui TEM de ser a mesma da Conferência, senão a
-- tela discorda da tela ao lado. Reimplementar o CASE seria criar a segunda
-- cópia divergente — o erro que tuss_da_sessao() já corrigiu neste repo. Mas
-- get_auditoria_assim_periodo estoura o statement_timeout numa janela de 7 dias.
-- Chamada dia a dia ela sempre respondeu (medido). Daí o generate_series +
-- CROSS JOIN LATERAL: <=8 execuções de um dia cada, dentro de um só statement.
-- Custo: alguns segundos numa tela manual de ~18 casos/mês. Etapa 3 pode otimizar.
create or replace function public.get_candidatas_vinculo(
  p_guia         text,
  p_janela_dias  integer default 7
)
returns table (
  bloco_id           text,
  paciente_id        text,
  paciente_nome      text,
  data_atendimento   date,
  hora_inicial       time without time zone,
  codigo_tuss        text,
  terapias           text,
  profissionais      text,
  quantidade_sessoes bigint,
  situacao           text,
  guia_atual         text,
  status_assim       text,
  motivo_glosa_codigo    text,
  motivo_glosa_descricao text,
  observacao         text,
  fila_id            uuid,
  distancia_horas    numeric,
  ja_vinculado       boolean,
  elegivel           boolean
)
language plpgsql
stable
security definer
set search_path = public
-- Abaixo do limite do gateway REST do Supabase. O caso típico são ~8 fatias de
-- 1-3s; o teto existe para a fatia patológica não pendurar a tela.
set statement_timeout = '55s'
as $$
declare
  v_g       record;
  v_empresa text;
  v_matric  text;
  v_dep     text;
  v_de      date;
  v_ate     date;
begin
  if p_janela_dias is null or p_janela_dias < 0 or p_janela_dias > 60 then
    raise exception 'Janela inválida: % (esperado 0..60)', p_janela_dias
      using errcode = '22023';
  end if;

  select aa.guia, aa.matricula, aa.data_execucao, aa.codigo_tuss, aa.status
    into v_g
  from public.autorizacoes_assim aa
  where aa.guia = p_guia;

  if not found then
    raise exception 'Guia % não existe em autorizacoes_assim', p_guia
      using errcode = 'P0002';
  end if;
  if v_g.data_execucao is null or v_g.codigo_tuss is null then
    raise exception 'Guia % sem data_execucao ou TUSS — não é reconciliável', p_guia
      using errcode = '22023';
  end if;

  v_empresa := split_part(v_g.matricula, '.', 1);
  v_matric  := split_part(v_g.matricula, '.', 2);
  v_dep     := split_part(v_g.matricula, '.', 3);
  v_ate     := date(v_g.data_execucao);
  v_de      := v_ate - p_janela_dias;

  return query
  with cand as (
    select
      a.bloco_id, a.paciente_id, a.paciente_nome, a.data_atendimento,
      a.hora_inicial, a.codigo_tuss, a.terapias, a.profissionais,
      a.quantidade_sessoes, a.situacao,
      a.guia         as guia_atual,
      a.status_assim,
      -- motivo_glosa da RPC já vem resolvido pelo de-para glosa_codigos; aqui só
      -- separamos código e texto com a mesma regra de frontend/lib/glosa.ts:27-40
      nullif(btrim(substring(coalesce(a.motivo_glosa, a.descricao_erro, '') from '^\s*(\d{3,5})\s*-')), '') as mg_cod,
      nullif(btrim(regexp_replace(coalesce(a.motivo_glosa, a.descricao_erro, ''), '^\s*\d{3,5}\s*-\s*', '')), '') as mg_desc,
      a.observacao
    from generate_series(v_de, v_ate, interval '1 day') g(dia)
    cross join lateral public.get_auditoria_assim_periodo(g.dia::date, g.dia::date) a
    where a.empresa     = v_empresa
      and a.matricula   = v_matric
      and a.dep         = v_dep
      and a.codigo_tuss = v_g.codigo_tuss
  )
  select
    c.bloco_id,
    c.paciente_id,
    c.paciente_nome,
    c.data_atendimento,
    c.hora_inicial,
    c.codigo_tuss,
    c.terapias,
    c.profissionais,
    c.quantidade_sessoes,
    c.situacao,
    c.guia_atual,
    c.status_assim,
    c.mg_cod,
    c.mg_desc,
    c.observacao,
    fa.id as fila_id,
    round(extract(epoch from (v_g.data_execucao - (c.data_atendimento + c.hora_inicial))) / 3600.0, 2) as distancia_horas,
    (vin.guia is not null) as ja_vinculado,
    -- Elegível = ainda não coberta e ainda não vinculada. LIBERADA fica visível
    -- de propósito, marcada como não-elegível: é a informação que faz o operador
    -- perceber que a guia é extra e usar "sem sessão correspondente" (39% das
    -- órfãs medidas caem nesse caso).
    (vin.guia is null and c.situacao <> 'LIBERADA') as elegivel
  from cand c
  -- a linha da fila daquela sessão, pelos 4 campos naturais que a RPC usa
  -- (20260820150000:443-447)
  left join lateral (
    select f.id
    from public.fila_autorizacoes f
    where f.paciente_id      = c.paciente_id
      and f.data_atendimento = c.data_atendimento
      and f.tuss             = c.codigo_tuss
      and f.horario          = c.hora_inicial
    order by coalesce(f.updated_at, f.created_at) desc
    limit 1
  ) fa on true
  left join public.autorizacoes_vinculos vin
    on vin.bloco_id = c.bloco_id and vin.desfeito_em is null and vin.tipo = 'vinculo'
  order by
    case c.situacao
      when 'GLOSA'                  then 1
      when 'NAO_SOLICITADA'         then 2
      when 'RETORNO_NAO_CONFIRMADO' then 3
      when 'SINCRONIZANDO'          then 4
      when 'CANCELADA'              then 5
      else 6
    end,
    abs(extract(epoch from (v_g.data_execucao - (c.data_atendimento + c.hora_inicial)))),
    c.hora_inicial;
end;
$$;

comment on function public.get_candidatas_vinculo(text, integer) is
  'Sessões candidatas a receber a cobertura de uma guia órfã: mesmo beneficiário, mesmo TUSS, janela retroativa (default 7 dias, medido na Etapa 0). Nunca vincula — só ordena por relevância.';


-- =============================================================================
-- 5. vincular_autorizacao — a escrita, com as validações
-- =============================================================================
-- Toda validação vive AQUI, não no frontend: o vínculo muda o que o faturamento
-- considera coberto (Etapa 3), então errar aqui é errar dinheiro.
create or replace function public.vincular_autorizacao(
  p_guia        text,
  p_bloco_id    text,
  p_fila_id     uuid    default null,
  p_observacao  text    default null,
  p_janela_dias integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
set statement_timeout = '55s'
as $$
declare
  v_role   text := public.fn_usuario_role();
  v_uid    uuid := auth.uid();
  v_nome   text;
  v_g      record;
  v_b      record;
  v_pac    bigint;
  v_data   date;
  v_tuss   text;
  v_hora   time;
  v_gorig  text;
  v_id     uuid;
begin
  if v_role is null or v_role not in ('admin', 'autorizacao', 'recepcao') then
    raise exception 'Sem permissão para vincular autorizações'
      using errcode = '42501';
  end if;
  select nome into v_nome from public.usuarios where id = v_uid;

  -- 1) a guia existe, está liberada e não foi triada
  select aa.guia, aa.matricula, aa.data_execucao, aa.codigo_tuss, aa.status
    into v_g
  from public.autorizacoes_assim aa where aa.guia = p_guia;
  if not found then
    raise exception 'Guia % não existe em autorizacoes_assim', p_guia using errcode = 'P0002';
  end if;
  if v_g.status is distinct from 'Liberado' then
    raise exception 'Guia % não está liberada (status: %). Só autorização liberada cobre sessão.',
      p_guia, coalesce(v_g.status, '(nulo)') using errcode = '22023';
  end if;
  if v_g.data_execucao is null or v_g.codigo_tuss is null then
    raise exception 'Guia % sem data_execucao ou TUSS', p_guia using errcode = '22023';
  end if;
  if exists (select 1 from public.autorizacoes_vinculos v
             where v.guia = p_guia and v.desfeito_em is null) then
    raise exception 'Guia % já foi triada. Desfaça o vínculo atual antes de refazer.', p_guia
      using errcode = '23505';
  end if;

  -- 2) o bloco_id é bem formado. Formato: pacienteId_YYYY-MM-DD_TUSS_HH:MM:SS
  begin
    v_pac  := split_part(p_bloco_id, '_', 1)::bigint;
    v_data := split_part(p_bloco_id, '_', 2)::date;
    v_tuss := split_part(p_bloco_id, '_', 3);
    v_hora := split_part(p_bloco_id, '_', 4)::time;
  exception when others then
    raise exception 'bloco_id malformado: % (esperado pacienteId_YYYY-MM-DD_TUSS_HH:MM:SS)', p_bloco_id
      using errcode = '22023';
  end;

  -- 3) o bloco existe de fato na Conferência daquele dia
  select * into v_b
  from public.fn_blocos_assim(v_data, v_data) b
  where b.bloco_id = p_bloco_id;
  if not found then
    raise exception 'Bloco % não existe na Conferência de % (sessão inativa, reagendada ou fora do recorte ASSIM)',
      p_bloco_id, v_data using errcode = 'P0002';
  end if;

  -- 4) mesmo beneficiário
  if v_b.empresa   is distinct from split_part(v_g.matricula, '.', 1)
  or v_b.matricula is distinct from split_part(v_g.matricula, '.', 2)
  or v_b.dep       is distinct from split_part(v_g.matricula, '.', 3) then
    raise exception 'Beneficiário divergente: guia % é de %, bloco é de %.%.%',
      p_guia, v_g.matricula, v_b.empresa, v_b.matricula, v_b.dep using errcode = '22023';
  end if;

  -- 5) mesmo TUSS. A v.1 não reconcilia entre TUSS diferentes.
  if v_b.codigo_tuss is distinct from v_g.codigo_tuss then
    raise exception 'TUSS divergente: guia % é %, bloco é %',
      p_guia, v_g.codigo_tuss, v_b.codigo_tuss using errcode = '22023';
  end if;

  -- 6) dentro da janela retroativa permitida
  if v_b.data_atendimento > date(v_g.data_execucao)
  or v_b.data_atendimento < date(v_g.data_execucao) - p_janela_dias then
    raise exception 'Sessão de % fora da janela de % dias da autorização (%)',
      v_b.data_atendimento, p_janela_dias, date(v_g.data_execucao) using errcode = '22023';
  end if;

  -- 7) o bloco ainda não está coberto por outra guia
  if exists (select 1 from public.autorizacoes_vinculos v
             where v.bloco_id = p_bloco_id and v.desfeito_em is null and v.tipo = 'vinculo') then
    raise exception 'Sessão % já está coberta por outra guia', p_bloco_id
      using errcode = '23505';
  end if;

  -- 8) se veio fila_id, ela tem de ser a linha DAQUELE bloco. Sem esta guarda o
  --    rastro apontaria para a solicitação de outra sessão.
  if p_fila_id is not null then
    if not exists (
      select 1 from public.fila_autorizacoes f
      where f.id = p_fila_id
        and f.paciente_id::bigint = v_pac
        and f.data_atendimento    = v_data
        and f.tuss                = v_tuss
        and f.horario             = v_hora
    ) then
      raise exception 'fila_id % não corresponde ao bloco %', p_fila_id, p_bloco_id
        using errcode = '22023';
    end if;
  end if;

  -- guia_original: congelada agora, porque é o histórico da glosa que dá sentido
  -- ao vínculo e numero_autorizacao pode ser sobrescrito depois pelo sync.
  select f.numero_autorizacao into v_gorig
  from public.fila_autorizacoes f
  where f.paciente_id::bigint = v_pac
    and f.data_atendimento    = v_data
    and f.tuss                = v_tuss
    and f.horario             = v_hora
  order by coalesce(f.updated_at, f.created_at) desc
  limit 1;

  insert into public.autorizacoes_vinculos
    (guia, tipo, bloco_id, fila_id, guia_original, observacao,
     vinculado_por, vinculado_por_id)
  values
    (p_guia, 'vinculo', p_bloco_id, p_fila_id, v_gorig, nullif(btrim(p_observacao), ''),
     coalesce(v_nome, 'Usuário'), v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.vincular_autorizacao(text, text, uuid, text, integer) is
  'Vincula uma guia ASSIM órfã à sessão que ela cobre. Valida beneficiário, TUSS, janela e unicidade no servidor. Não escreve em fila_autorizacoes nem em autorizacoes_assim.';


-- =============================================================================
-- 6. marcar_guia_sem_sessao — o descarte
-- =============================================================================
-- 7 das 18 órfãs medidas na Etapa 0 têm como candidata mais próxima um bloco JÁ
-- LIBERADA: são autorizações genuinamente extras. Sem esta ação elas voltariam à
-- fila de trabalho todo dia, para sempre.
create or replace function public.marcar_guia_sem_sessao(
  p_guia       text,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.fn_usuario_role();
  v_uid  uuid := auth.uid();
  v_nome text;
  v_id   uuid;
begin
  if v_role is null or v_role not in ('admin', 'autorizacao', 'recepcao') then
    raise exception 'Sem permissão para triar autorizações' using errcode = '42501';
  end if;
  select nome into v_nome from public.usuarios where id = v_uid;

  if not exists (select 1 from public.autorizacoes_assim where guia = p_guia) then
    raise exception 'Guia % não existe em autorizacoes_assim', p_guia using errcode = 'P0002';
  end if;
  if exists (select 1 from public.autorizacoes_vinculos v
             where v.guia = p_guia and v.desfeito_em is null) then
    raise exception 'Guia % já foi triada', p_guia using errcode = '23505';
  end if;

  insert into public.autorizacoes_vinculos
    (guia, tipo, bloco_id, fila_id, observacao, vinculado_por, vinculado_por_id)
  values
    (p_guia, 'sem_sessao', null, null, nullif(btrim(p_observacao), ''),
     coalesce(v_nome, 'Usuário'), v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.marcar_guia_sem_sessao(text, text) is
  'Marca uma guia órfã como sem sessão correspondente (autorização extra). Tira da fila de trabalho sem afirmar cobertura.';


-- =============================================================================
-- 7. desvincular_autorizacao — desfazer, sem apagar
-- =============================================================================
create or replace function public.desvincular_autorizacao(
  p_vinculo_id uuid,
  p_motivo     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.fn_usuario_role();
  v_uid  uuid := auth.uid();
  v_nome text;
begin
  if v_role is null or v_role not in ('admin', 'autorizacao', 'recepcao') then
    raise exception 'Sem permissão para desfazer vínculos' using errcode = '42501';
  end if;
  select nome into v_nome from public.usuarios where id = v_uid;

  update public.autorizacoes_vinculos set
    desfeito_por    = coalesce(v_nome, 'Usuário'),
    desfeito_por_id = v_uid,
    desfeito_em     = now(),
    desfeito_motivo = nullif(btrim(p_motivo), '')
  where id = p_vinculo_id
    and desfeito_em is null;

  if not found then
    raise exception 'Vínculo % não existe ou já foi desfeito', p_vinculo_id
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.desvincular_autorizacao(uuid, text) is
  'Desfaz um vínculo por soft delete, preservando autoria e motivo. A guia volta a aparecer em get_guias_orfas.';


-- =============================================================================
-- 8. Grants — explícitos, nunca a PUBLIC
-- =============================================================================
-- O GRANT EXECUTE implícito a PUBLIC é a causa-raiz de 47 dos 55 avisos de
-- advisor deste projeto. O padrão certo é revogar e conceder por role.
revoke all on function public.get_guias_orfas(date, date) from public;
revoke all on function public.get_candidatas_vinculo(text, integer) from public;
revoke all on function public.vincular_autorizacao(text, text, uuid, text, integer) from public;
revoke all on function public.marcar_guia_sem_sessao(text, text) from public;
revoke all on function public.desvincular_autorizacao(uuid, text) from public;

grant execute on function public.get_guias_orfas(date, date) to authenticated;
grant execute on function public.get_candidatas_vinculo(text, integer) to authenticated;
grant execute on function public.vincular_autorizacao(text, text, uuid, text, integer) to authenticated;
grant execute on function public.marcar_guia_sem_sessao(text, text) to authenticated;
grant execute on function public.desvincular_autorizacao(uuid, text) to authenticated;
