-- Fase 1.7 — Piso de data nas duas views de roster de profissionais.
--
-- Não é otimização de performance: é correção para preservar o comportamento
-- funcional da aplicação quando o histórico de Jan–Jun/2026 entrar na tabela
-- (seed do backup XLS, ~110 mil linhas).
--
-- As duas views fazem DISTINCT ON (profissional_nome) sobre csv_grades_profissionais
-- INTEIRA, sem filtro de data. Hoje a tabela só cobre 2026-07-01 → 2026-09-30, então
-- o recorte temporal era acidental: as views devolvem 121 e 122 nomes. Com o seed,
-- sem piso de data, passariam a listar 191 — incluindo 68 profissionais que só
-- aparecem em Jan–Jun, ou seja, gente já desligada, nos dropdowns de
-- "Alocar sessão livre" (Ocupação de Salas) e Config → Capacidade do profissional.
--
-- Medido no backup, por janela (nomes distintos, já descontados os nomes de teste):
--   Jan 1 – Ago 4 .... 191   (sem piso: o problema)
--   piso  90 dias .... 138
--   piso  60 dias .... 129
--   piso  30 dias .... 122
--   Jul 1 – Ago 4 .... 123   (~ o que a view devolve hoje)
--
-- Piso adotado: 30 dias — o único que reproduz a lista de hoje. O objetivo desta
-- migration é preservar comportamento, não mudar regra de negócio: 90 dias admitiria
-- 15 nomes a mais (14 desligados + 1 pseudo-profissional), o que seria uma decisão
-- de produto disfarçada de correção técnica. Ampliar o horizonte, se for o caso,
-- fica para uma entrega própria e consciente.
-- O limite superior segue aberto — profissional escalado para setembro continua
-- aparecendo, como hoje.
--
-- Também acrescentado NOT ILIKE 'Combinar Consulta%': o filtro NOT IN existente só
-- pega o nome exato 'Combinar Consulta', e o histórico traz
-- 'Combinar Consulta c/ Responsável em Vaga Ociosa', que não é uma pessoa. Mesmo
-- padrão do NOT ILIKE 'Testes Técnicos%' que já existia em
-- vw_cronograma_profissionais_salas.
--
-- A reescrita para eliminar o full scan (índice (profissional_nome, data DESC))
-- fica para a Fase 2.

-- ─── Dropdown de "Alocar sessão livre" em Ocupação de Salas ───────────────────
-- (definição original em 20260805110000_create_vw_cronograma_profissionais_salas.sql)
CREATE OR REPLACE VIEW public.vw_cronograma_profissionais_salas
WITH (security_invoker = true) AS
SELECT DISTINCT ON (profissional_nome)
  profissional_id, profissional_nome
FROM csv_grades_profissionais
WHERE profissional_nome IS NOT NULL
  AND profissional_nome <> ''
  AND profissional_nome NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  AND profissional_nome NOT ILIKE 'Testes Técnicos%'
  AND profissional_nome NOT ILIKE 'Combinar Consulta%'
  AND ativo
  AND data >= current_date - interval '30 days'
ORDER BY profissional_nome, profissional_id;

GRANT SELECT ON public.vw_cronograma_profissionais_salas TO authenticated;

-- ─── Config → Capacidade do profissional ──────────────────────────────────────
-- (definição original em 20260708140000_add_terapia_roster_view.sql)
-- DISTINCT ON + ORDER BY data DESC continua pegando a terapia do agendamento mais
-- recente do profissional. Com o histórico na tabela isso não muda: o mais recente
-- segue sendo o mais recente.
--
-- Nota: as linhas semeadas do XLS têm terapia_exibicao_nome NULL (o backup não traz
-- essa coluna — enriquecimento é Fase 2), então quem tiver o agendamento mais recente
-- dentro da janela semeada aparece com terapia_principal NULL. Na prática isso só
-- atinge os desligados que o piso de 90 dias admite: para quem está ativo, a linha
-- mais recente vem da API e tem a exibição preenchida. Deliberadamente NÃO se usou
-- COALESCE(terapia_exibicao_nome, terapia_nome) aqui — isso mudaria o valor devolvido
-- hoje para profissionais cuja linha mais recente é um slot 'Livre' (exibição sempre
-- NULL nesses casos), e o objetivo desta migration é preservar comportamento.
CREATE OR REPLACE VIEW public.vw_remuneracao_profissionais_roster
WITH (security_invoker = true) AS
SELECT DISTINCT ON (profissional_nome)
  profissional_nome,
  terapia_exibicao_nome AS terapia_principal
FROM csv_grades_profissionais
WHERE profissional_nome IS NOT NULL
  AND profissional_nome <> ''
  AND profissional_nome NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  AND profissional_nome NOT ILIKE 'Testes Técnicos%'
  AND profissional_nome NOT ILIKE 'Combinar Consulta%'
  AND ativo
  AND data >= current_date - interval '30 days'
ORDER BY profissional_nome, data DESC;

GRANT SELECT ON public.vw_remuneracao_profissionais_roster TO authenticated;
