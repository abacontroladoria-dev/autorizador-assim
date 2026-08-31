-- =============================================================================
-- Correção: get_candidatas_vinculo lia o motivo da glosa do lugar errado
-- =============================================================================
-- 20260821000000 extraía código e descrição de `motivo_glosa` por regex,
-- supondo que ali estivesse o texto do relatório no formato "1403-TEXTO".
-- Está errado: `motivo_glosa` é o LEFT JOIN com auditoria_glosa_motivos
-- (20260820150000_glosa_codigos_descricao_completa.sql:448) — a anotação MANUAL
-- que o operador digita no modal da Conferência. Na prática vem NULL quase
-- sempre, e a tela de reconciliação mostraria o motivo em branco justamente no
-- campo que o operador usa para decidir.
--
-- Medido em produção no bloco da Kourtney (2026-08-03 11:20, TUSS 22070435):
--   status_assim   = "1403-NAO EXISTE INFORMACA"
--   codigo_erro    = "1403"                  <- o código, já resolvido
--   descricao_erro = "NAO EXISTE INFORMACA"  <- a descrição, já resolvida
--   motivo_glosa   = null                    <- anotação manual, inexistente
--   observacao     = "Glosa: 1403 - NAO EXISTE INFORMACA"
--
-- A RPC já resolve código e descrição pelos LATERAL er/ed, com a precedência
-- relatório > de-para glosa_codigos > recibo da fila > texto truncado
-- (20260820150000:454-484). Reextrair por regex era refazer, pior, o que já
-- estava feito. Agora só lemos as colunas.
--
-- Aproveita para expor a anotação manual como campo próprio (`nota_manual`):
-- é informação real e útil para o operador escolher a sessão, só não é o motivo.
--
-- Muda o RETURNS TABLE, então precisa de DROP antes do CREATE.
-- =============================================================================

drop function if exists public.get_candidatas_vinculo(text, integer);

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
  nota_manual        text,
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
      a.codigo_erro    as mg_cod,   -- já resolvido pelos LATERAL er/ed da RPC
      a.descricao_erro as mg_desc,
      a.motivo_glosa   as nota_manual,
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
    c.nota_manual,
    c.observacao,
    fa.id as fila_id,
    round(extract(epoch from (v_g.data_execucao - (c.data_atendimento + c.hora_inicial))) / 3600.0, 2) as distancia_horas,
    (vin.guia is not null) as ja_vinculado,
    -- LIBERADA fica visível de propósito, marcada como não-elegível: é o que faz
    -- o operador perceber que a guia é extra e usar "sem sessão correspondente"
    -- (39% das órfãs medidas na Etapa 0 caem nesse caso).
    (vin.guia is null and c.situacao <> 'LIBERADA') as elegivel
  from cand c
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
  'Sessões candidatas a receber a cobertura de uma guia órfã: mesmo beneficiário, mesmo TUSS, janela retroativa (default 7 dias, medido na Etapa 0). Código e descrição da glosa vêm de codigo_erro/descricao_erro (já resolvidos pela RPC); nota_manual é a anotação de auditoria_glosa_motivos. Nunca vincula.';

revoke all on function public.get_candidatas_vinculo(text, integer) from public;
grant execute on function public.get_candidatas_vinculo(text, integer) to authenticated;
