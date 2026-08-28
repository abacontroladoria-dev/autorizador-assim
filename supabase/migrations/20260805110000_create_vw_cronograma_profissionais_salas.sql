-- listarTodosProfissionaisSalas() (salas.service.ts) alimenta o dropdown de
-- "Alocar sessão livre" em Ocupação de Salas. Antes buscava TODAS as linhas
-- de csv_grades_profissionais (54 mil+ linhas, crescendo sem expurgo — ver
-- comentário em sync-grade-csv/index.ts) paginando 1000 por vez só para
-- deduplicar no navegador e chegar a ~120 profissionais distintos — 55+
-- round-trips sequenciais ao Supabase, deixando o modal lento para abrir.
--
-- Move o DISTINCT pro banco: a view devolve só as linhas já deduplicadas
-- (1 SELECT, ~120 linhas, em vez de 54 mil). Mesmo padrão de
-- vw_remuneracao_profissionais_roster (20260707180000), mas inclui
-- profissional_id — necessário aqui pra gravar a alocação pelo ID estável,
-- não só pelo nome (ver comentário em ProfissionalOpcao/salasTypes.ts).
CREATE OR REPLACE VIEW public.vw_cronograma_profissionais_salas
WITH (security_invoker = true) AS
SELECT DISTINCT ON (profissional_nome)
  profissional_id, profissional_nome
FROM csv_grades_profissionais
WHERE profissional_nome IS NOT NULL
  AND profissional_nome <> ''
  AND profissional_nome NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  AND profissional_nome NOT ILIKE 'Testes Técnicos%'
ORDER BY profissional_nome, profissional_id;

GRANT SELECT ON public.vw_cronograma_profissionais_salas TO authenticated;
