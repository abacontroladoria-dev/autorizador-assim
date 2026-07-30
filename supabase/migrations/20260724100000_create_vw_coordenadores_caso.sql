-- View dedicada para a tela Cadastros → Capacidade: precisa listar só quem
-- atua como Coordenador de Caso (Analista do Comportamento), não todo
-- profissional da grade. terapia_exibicao_nome não serve pra esse filtro —
-- Coordenador de Caso (terapia_id 2248) faz parte do grupo de exibição que
-- sempre aparece como "Psicologia ABA" (ver TERAPIA_ID/ABA_EXIB_PSICO_IDS em
-- frontend/lib/cronograma/constants.ts) — por isso o filtro usa o
-- terapia_id bruto da sessão, não o agrupamento de exibição.
create or replace view public.vw_remuneracao_coordenadores_caso
with (security_invoker = true) as
select distinct profissional_nome
from public.csv_grades_profissionais
where profissional_nome is not null
  and profissional_nome <> ''
  and profissional_nome not in ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  and terapia_id = 2248
order by profissional_nome;

grant select on public.vw_remuneracao_coordenadores_caso to authenticated;
