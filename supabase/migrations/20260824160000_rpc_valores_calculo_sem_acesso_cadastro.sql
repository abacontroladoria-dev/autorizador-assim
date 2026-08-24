-- Bug relatado pelo usuário (2026-08-24): em relacionamento-prestador/solicitacoes
-- ?tab=simulacao, o card "Projeção financeira - Ponto de Equilíbrio (Break Even)"
-- aparece zerado (R$ 0,00 em tudo) para usuários sem o perfil admin/diretoria
-- (ex.: @diovanna-mendes, @alex-sobrinho) — mas certo para admin.
--
-- Causa: SimulacaoNovoPrestadorTab.tsx e SugestoesContratacaoPanel.tsx (mesma
-- aba) leem client-side, via useConvenioValores/useTaxasEspecialidade/
-- useParametrosGerais, as tabelas cronograma_convenio_valores(_paciente),
-- remuneracao_taxas_especialidade e remuneracao_parametros_gerais. Desde
-- 20260724200000/20260723170000, a policy de SELECT dessas tabelas exige
-- admin/diretoria (e 'rp' nas duas últimas) — mas a aba Simulação/Sugestões é
-- liberada por 'cronograma_solicitacoes', que não implica nenhuma dessas.
-- RLS não gera erro quando bloqueia, só devolve 0 linhas — e o cálculo trata
-- "sem linha" como "sem valor cadastrado", zerando toda a projeção. O mesmo
-- vale para relacionamento-prestador/indicadores?tab=previsao-receitas
-- (PrevisaoReceitasShell), liberada por 'indicadores_previsao_receitas'.
--
-- Em vez de abrir a policy de SELECT das tabelas cruas (o que reexporia valor
-- de convênio linha a linha, com observações e histórico de auditoria, para
-- quem só deveria enxergar o resultado calculado — exatamente o que
-- 20260724200000 quis impedir), cada function abaixo é uma porta estreita
-- SECURITY DEFINER: devolve só as colunas que o cálculo consome (sem
-- observações, sem timestamps), liberada para quem acessa Simulação/
-- Sugestões OU Previsão de Receitas. As policies das tabelas continuam
-- intocadas — quem edita o cadastro (cronograma_valores_convenio) continua
-- restrito a admin/diretoria.

create or replace function public.valores_calculo_convenio()
returns table (
  id uuid, convenio_nome text, terapia_id bigint, terapia_nome text,
  criterio_aba text, valor_sessao numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select v.id, v.convenio_nome, v.terapia_id, v.terapia_nome, v.criterio_aba, v.valor_sessao
  from public.cronograma_convenio_valores v
  where public.usuario_tem_permissao('cronograma_solicitacoes')
     or public.usuario_tem_permissao('indicadores_previsao_receitas')
$$;

comment on function public.valores_calculo_convenio() is
  'SECURITY DEFINER: valor de sessão por convênio/terapia, sem observações/timestamps, para quem acessa Simulação ou Previsão de Receitas mesmo sem acesso a Cadastro de Valores. Ver 20260824160000.';

revoke all on function public.valores_calculo_convenio() from public, anon;
grant execute on function public.valores_calculo_convenio() to authenticated;

create or replace function public.valores_calculo_convenio_paciente()
returns table (
  id uuid, convenio_nome text, paciente_id bigint, paciente_nome text, valor_sessao numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.convenio_nome, p.paciente_id, p.paciente_nome, p.valor_sessao
  from public.cronograma_convenio_valores_paciente p
  where public.usuario_tem_permissao('cronograma_solicitacoes')
     or public.usuario_tem_permissao('indicadores_previsao_receitas')
$$;

comment on function public.valores_calculo_convenio_paciente() is
  'SECURITY DEFINER: exceção de valor por paciente, sem observações/timestamps — ver valores_calculo_convenio()/20260824160000.';

revoke all on function public.valores_calculo_convenio_paciente() from public, anon;
grant execute on function public.valores_calculo_convenio_paciente() to authenticated;

create or replace function public.valores_calculo_pacote_avaliacao()
returns table (convenio_nome text, terapia_id bigint, valor_a_vista numeric)
language sql
security definer
stable
set search_path = public
as $$
  select a.convenio_nome, a.terapia_id, a.valor_a_vista
  from public.cronograma_convenio_pacote_avaliacao a
  where public.usuario_tem_permissao('cronograma_solicitacoes')
     or public.usuario_tem_permissao('indicadores_previsao_receitas')
$$;

comment on function public.valores_calculo_pacote_avaliacao() is
  'SECURITY DEFINER: valor do pacote de avaliação por convênio/terapia, sem observações/timestamps — ver valores_calculo_convenio()/20260824160000.';

revoke all on function public.valores_calculo_pacote_avaliacao() from public, anon;
grant execute on function public.valores_calculo_pacote_avaliacao() to authenticated;

create or replace function public.valores_calculo_taxas_especialidade()
returns table (
  especialidade text, taxa_pa numeric,
  be_custo_mensal_pj numeric, be_capacidade_manha numeric, be_capacidade_tarde numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select t.especialidade, t.taxa_pa, t.be_custo_mensal_pj, t.be_capacidade_manha, t.be_capacidade_tarde
  from public.remuneracao_taxas_especialidade t
  where public.usuario_tem_permissao('cronograma_solicitacoes')
     or public.usuario_tem_permissao('indicadores_previsao_receitas')
$$;

comment on function public.valores_calculo_taxas_especialidade() is
  'SECURITY DEFINER: taxa de PA e parâmetros de Ponto de Equilíbrio por especialidade, sem diária/timestamps — ver valores_calculo_convenio()/20260824160000.';

revoke all on function public.valores_calculo_taxas_especialidade() from public, anon;
grant execute on function public.valores_calculo_taxas_especialidade() to authenticated;

create or replace function public.valores_calculo_parametros_gerais()
returns table (
  imposto_faturamento_pct numeric, pa_capacidade_manha_padrao numeric, pa_capacidade_tarde_padrao numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select g.imposto_faturamento_pct, g.pa_capacidade_manha_padrao, g.pa_capacidade_tarde_padrao
  from public.remuneracao_parametros_gerais g
  where public.usuario_tem_permissao('cronograma_solicitacoes')
     or public.usuario_tem_permissao('indicadores_previsao_receitas')
  order by g.updated_at desc
  limit 1
$$;

comment on function public.valores_calculo_parametros_gerais() is
  'SECURITY DEFINER: imposto de faturamento e capacidade padrão de Ponto de Equilíbrio, sem os demais parâmetros de remuneração — ver valores_calculo_convenio()/20260824160000.';

revoke all on function public.valores_calculo_parametros_gerais() from public, anon;
grant execute on function public.valores_calculo_parametros_gerais() to authenticated;
