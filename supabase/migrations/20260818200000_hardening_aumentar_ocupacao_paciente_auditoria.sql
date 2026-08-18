-- Pedido do usuário (2026-08-18): "totalmente segura contra invasões" para
-- aumentar_ocupacao_paciente_auditoria.
--
-- O que essa tabela já tinha, por desenho (ver 20260818170000): RLS ligada,
-- só authenticated (anon já não tinha acesso nenhum via policy), e SEM
-- policy de UPDATE/DELETE — ou seja, mesmo um usuário autenticado não
-- consegue alterar nem apagar uma linha da trilha, só inserir e ler.
--
-- O que NÃO fizemos aqui (de propósito): restringir SELECT/INSERT a papéis
-- específicos (admin/diretoria/cronograma/terapeutico, convenção de
-- cronograma_salas_auditoria). O sistema de permissão desta tela
-- (permissoes/usuarios_permissoes, por usuário) é independente do papel
-- (usuarios.role, usado por remuneracao_has_role) — usuários reais que já
-- gravam nesta tabela (Juliana, Victoria França, Júlia Souza, etc.) podem não
-- ter um dos 4 papéis acima, e travar por papel quebraria o acesso deles em
-- silêncio (RLS filtra, não dá erro). Fica pendente de confirmação do usuário
-- depois de checar o `role` real dessas contas na tabela `usuarios`.
--
-- O que este arquivo reforça — proteção contra acesso indevido/externo,
-- sem tocar em quem já tem acesso legítimo hoje:
--   1. Remove qualquer grant residual de PUBLIC/anon a nível de tabela —
--      mesmo que uma policy futura seja mal escrita, a permissão de tabela
--      (GRANT) continua bloqueando anon antes da RLS ser avaliada.
--   2. Garante que nem authenticated tenha grant de UPDATE/DELETE — reforço
--      redundante com "não existe policy de UPDATE/DELETE", mas em duas
--      camadas (GRANT + RLS) em vez de uma só.
--   3. FORCE ROW LEVEL SECURITY — RLS vale até para o dono da tabela (só
--      service_role, que faz BYPASSRLS, continua passando por cima).

revoke all on public.aumentar_ocupacao_paciente_auditoria from public;
revoke all on public.aumentar_ocupacao_paciente_auditoria from anon;

revoke all on public.aumentar_ocupacao_paciente_auditoria from authenticated;
grant select, insert on public.aumentar_ocupacao_paciente_auditoria to authenticated;

alter table public.aumentar_ocupacao_paciente_auditoria force row level security;

comment on table public.aumentar_ocupacao_paciente_auditoria is
  'Trilha de observações do paciente + histórico de implantações na TiTa de /cronograma/ocupacao-paciente. RLS: authenticated lê e insere, ninguém edita/apaga (imutável). Restrição por papel avaliada e adiada — ver 20260818200000.';
