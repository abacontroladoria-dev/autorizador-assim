-- csv_reposicao_faltas teve RLS habilitada na criação (remote_schema 20260701135826)
-- mas nenhuma policy de SELECT foi criada — resultado: RLS nega tudo por padrão para
-- anon/authenticated (só service_role, que ignora RLS, conseguia ler). A view
-- vw_reposicao_faltas (criada sobre essa tabela) sempre funcionou porque roda com o
-- privilégio de quem a criou, não de quem consulta — por isso as sugestões de
-- reposição nunca pararam de funcionar, mas uma leitura direta da tabela (necessária
-- para recuperar profissional/sala originais de uma FALTA) retornava sempre 0 linhas.
--
-- csv_grades_profissionais, tabela irmã de mesma sensibilidade (snapshot da grade da
-- clínica), não tem RLS habilitada — está totalmente aberta hoje. Esta policy só
-- equipara o nível de acesso de csv_reposicao_faltas ao que a irmã já tem.

create policy "csv_reposicao_faltas_select_all"
  on public.csv_reposicao_faltas
  for select
  to anon, authenticated
  using (true);
