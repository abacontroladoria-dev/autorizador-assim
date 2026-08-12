-- A pedido do usuário (2026-07-24): Indicadores tinha UMA permissão
-- ('ocupacao_profissionais') gateando as 5 abas da rota /cronograma/indicadores
-- inteira (Ocupação de Profissionais, Ocupação Clínica, Dashboard de
-- Pacientes, Previsão de Receitas, Comparativo de Sessões) — quem tinha
-- acesso a uma, tinha acesso a todas, sem como conceder aba a aba na tela
-- de Permissões.
--
-- Cria uma permissão por aba (o código 'ocupacao_profissionais' é mantido
-- e passa a valer só pra aba "profissionais", preservando os overrides já
-- concedidos pra ela em usuarios_permissoes — ninguém perde acesso à aba
-- que já tinha, só deixa de ganhar de graça as outras 4).
--
-- A correspondência código -> rota+aba (frontend/lib/permissions/routes.ts,
-- CODIGO_PARA_ROTAS) e o gate real server-side (frontend/proxy.ts) foram
-- atualizados junto nesta mesma mudança pra respeitar `?tab=` na checagem,
-- não só o pathname.

update public.permissoes
  set rota = '/cronograma/indicadores?tab=profissionais'
  where codigo = 'ocupacao_profissionais';

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('indicadores_ocupacao_unidades', 'Ocupação Clínica', '/cronograma/indicadores?tab=unidades', 'Cronograma',
   'Ocupação agregada de salas por unidade'),
  ('indicadores_pacientes', 'Dashboard de Pacientes', '/cronograma/indicadores?tab=pacientes', 'Cronograma',
   'Métricas de pacientes ativos: carga horária, convênio, unidade'),
  ('indicadores_previsao_receitas', 'Previsão de Receitas', '/cronograma/indicadores?tab=previsao-receitas', 'Cronograma',
   'Receita mensal projetada, cruzando sessões reais com valores cadastrados por convênio'),
  ('indicadores_comparativo_sessoes', 'Comparativo de Sessões', '/cronograma/indicadores?tab=comparativo-sessoes', 'Cronograma',
   'Compara sessões agendadas entre dois períodos: total geral, por unidade e por paciente')
on conflict (codigo) do nothing;
