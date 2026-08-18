-- Musicoterapia entra no mesmo regime PJ 1x/semana de Fono/TO (ver
-- 20260813120000_add_ponto_equilibrio_pj.sql) — custo mensal fica em branco
-- de propósito, o usuário preenche em Variáveis & Taxas.

insert into public.remuneracao_taxas_especialidade (especialidade, taxa_pa, diaria, be_capacidade_diaria)
values ('Musicoterapia', 0, 0, 13)
on conflict (especialidade) do update set
  be_capacidade_diaria = excluded.be_capacidade_diaria;
