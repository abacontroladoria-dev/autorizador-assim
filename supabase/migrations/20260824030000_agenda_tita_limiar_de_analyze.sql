-- =============================================================================
-- agenda_tita analisa a cada 1.670 mudanças, não a cada 8.148
-- =============================================================================
-- Achado do diagnóstico de 24/08, independente do cast de 20260824020000.
--
-- `analyze public.agenda_tita` levou fn_blocos_assim de 48.850 para 13.126 ms —
-- 73% de queda, de graça. A estatística estava com 19 dias:
--
--   agenda_tita   last_autoanalyze 2026-08-05   n_live_tup 80.980   14,4% morto
--
-- POR QUE O AUTOANALYZE NUNCA CHEGAVA
-- Minha primeira leitura foi que o autovacuum estava ocupado com
-- grade_profissionais_tita (1.112 autoanalyzes contra 84). Errado. O
-- `n_mod_since_analyze` mostra a razão verdadeira: o gatilho padrão é
--
--     autovacuum_analyze_threshold + autovacuum_analyze_scale_factor × n_live_tup
--     50 + 0,1 × 80.980 ≈ 8.148 modificações
--
-- agenda_tita tem 80.980 linhas e muda devagar em relação ao próprio tamanho. O
-- sync diário não move 8.148 linhas, então a tabela fica semanas abaixo do
-- gatilho enquanto os dados envelhecem por baixo. Não é disputa por recurso — é
-- um limiar proporcional aplicado a uma tabela grande e estável, que é
-- exatamente onde `scale_factor` de 10% falha.
--
-- E o preço não é abstrato: é a tabela que dirige fn_blocos_assim e
-- get_auditoria_assim_periodo. Estatística velha é como um laço aninhado nasce —
-- o planner estima "poucas linhas", escolhe nested loop, e encontra muitas.
--
-- OS NÚMEROS NOVOS
--   analyze:  50 + 0,02 × 80.980 ≈ 1.670 modificações   (era ≈ 8.148)
--   vacuum:   50 + 0,05 × 80.980 ≈ 4.099 tuplas mortas  (era ≈ 16.246)
--
-- 2% é conservador para uma tabela deste tamanho — ANALYZE amostra 30.000 linhas
-- e custa segundos. O que se paga é uma amostragem a mais por semana; o que se
-- evita é planejar um mês inteiro com o retrato errado.
--
-- `alter table ... set (...)` é alteração de catálogo: instantânea, sem reescrever
-- a tabela.
--
-- NÃO MEXE em grade_profissionais_tita. Ela tem 1.112 autoanalyzes e um ANALYZE
-- foi flagrado rodando por 25min35s durante o incidente — mas 25 minutos para
-- amostrar 30.000 linhas é sintoma de estrangulamento por cost delay ou de
-- disputa, não de limiar. Mexer ali sem medir a causa seria chutar.
-- =============================================================================

alter table public.agenda_tita set (
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_scale_factor  = 0.05
);

-- Deixa a tabela em dia agora — o limiar novo só age na PRÓXIMA vez que ele for
-- cruzado, e a última estatística automática é de 05/08.
analyze public.agenda_tita;
