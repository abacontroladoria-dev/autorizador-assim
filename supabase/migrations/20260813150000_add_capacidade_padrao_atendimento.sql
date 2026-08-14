-- Ponto de Equilíbrio pra especialidades "por atendimento" (todas exceto
-- Fonoaudiologia/Terapia Ocupacional/Musicoterapia, que já têm custo mensal
-- fixo próprio — ver 20260813120000/20260813130000/20260813140000). Essas
-- pagam o profissional por sessão (PA, já cadastrado em
-- remuneracao_taxas_especialidade), então não têm capacidade manhã/tarde
-- própria: usam um padrão único e geral (6 manhã, 7 tarde), editável em
-- Variáveis & Taxas.

alter table public.remuneracao_parametros_gerais
  add column if not exists pa_capacidade_manha_padrao numeric not null default 6,
  add column if not exists pa_capacidade_tarde_padrao numeric not null default 7;
