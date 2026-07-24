-- Mesmo padrão aplicado em Indicadores (20260724210000): a rota
-- /cronograma/ocupacao tinha UMA permissão ('ocupacao_clinica', nome
-- "Aceites e Recusas") gateando as 3 abas da rota inteira (Aceites e
-- Recusas, Diferença: Laudo e Oferta, Inconsistências e Exceções) — quem
-- tinha acesso a uma, tinha a todas, batizado só com o nome da primeira.
--
-- Cria 2 permissões novas, uma por aba restante. 'ocupacao_clinica' é
-- mantida e passa a valer só pra aba "acompanhamento" (Aceites e Recusas) —
-- overrides já concedidos pra ela preservados, sem ganhar as outras 2 de
-- graça (quem tinha acesso via override individual continua só com
-- Aceites e Recusas; admin/diretoria/cronograma, que tinham acesso via
-- role default à rota inteira, ganham as 2 novas via roleDefaults em
-- frontend/lib/permissions/routes.ts, atualizado junto).

update public.permissoes
  set rota = '/cronograma/ocupacao?tab=acompanhamento'
  where codigo = 'ocupacao_clinica';

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('ocupacao_clinica_gaps', 'Diferença: Laudo e Oferta', '/cronograma/ocupacao?tab=gaps', 'Cronograma',
   'Comparativo entre laudos autorizados e sessões ofertadas'),
  ('ocupacao_clinica_inconsistencias', 'Inconsistências e Exceções', '/cronograma/ocupacao?tab=inconsistencias', 'Cronograma',
   'Registros com divergências ou exceções no cronograma')
on conflict (codigo) do nothing;
