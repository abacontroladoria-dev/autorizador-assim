-- Ponto de Equilíbrio (Break Even) para contratação PJ de 1 dia/semana —
-- começa por Fonoaudiologia e Terapia Ocupacional (ver PDF "Regra de
-- alocação mínima — Fono e TO", Bernardo Salotto, 12/08/2026 v2). Demais
-- especialidades usam um modelo diferente (remuneração por atendimento) e
-- entram depois, sem tocar nestas colunas.
--
-- imposto_faturamento_pct é geral (alíquota da clínica sobre faturamento,
-- não varia por especialidade); be_custo_mensal_pj/be_capacidade_diaria são
-- por especialidade, como taxa_pa/diaria já são. Ambos numeric nullable —
-- só Fono/TO recebem valor por enquanto; qualquer outra especialidade fica
-- null e a tela de Simulação de Novo Prestador simplesmente não mostra o
-- bloco de Break Even pra ela.

alter table public.remuneracao_parametros_gerais
  add column if not exists imposto_faturamento_pct numeric not null default 20;

alter table public.remuneracao_taxas_especialidade
  add column if not exists be_custo_mensal_pj numeric,
  add column if not exists be_capacidade_diaria numeric;

insert into public.remuneracao_taxas_especialidade (especialidade, taxa_pa, diaria, be_custo_mensal_pj, be_capacidade_diaria)
values
  ('Fonoaudiologia', 0, 0, 2400, 13),
  ('Terapia Ocupacional', 0, 0, 2600, 13)
on conflict (especialidade) do update set
  be_custo_mensal_pj = excluded.be_custo_mensal_pj,
  be_capacidade_diaria = excluded.be_capacidade_diaria;
