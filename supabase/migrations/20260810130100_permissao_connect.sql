-- Permissão de rota para o Pulsar Connect.
--
-- O item "Pulsar Connect" aparecia no sidebar para todos os usuários, mas
-- proxy.ts deriva as rotas permitidas de CODIGO_PARA_ROTAS e '/connect' não
-- estava lá. Resultado: admin entrava (o proxy libera admin antes de consultar
-- permissão) e todos os outros caíam em /sem-permissao. Item visível levando a
-- lugar nenhum.
--
-- Esta linha faz o código aparecer em /admin/permissoes, que lê public.permissoes
-- para montar a tela. Sem ela, o código existiria só no arquivo TypeScript e não
-- haveria como conceder Connect a ninguém pela interface.
--
-- Não concede nada a ninguém: `connect` entra apenas nos defaults do role admin
-- (frontend/lib/permissions/routes.ts). Quem já era admin continua entrando;
-- quem não era continua fora, agora sem o item enganoso no menu.

insert into public.permissoes (codigo, nome, rota, grupo, descricao)
values (
  'connect',
  'Pulsar Connect',
  '/connect',
  'Atendimento',
  'Central de Atendimento e atendente virtual do WhatsApp: inbox, contatos, agendamentos e configuração do agente'
)
on conflict (codigo) do update
  set nome      = excluded.nome,
      rota      = excluded.rota,
      grupo     = excluded.grupo,
      descricao = excluded.descricao;
