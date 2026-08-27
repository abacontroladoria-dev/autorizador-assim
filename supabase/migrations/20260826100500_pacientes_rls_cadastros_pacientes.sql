-- Escrita em `pacientes` também por PERMISSÃO DE TELA, não só por papel.
--
-- A tela /cadastros/pacientes é governada pelo código `cadastros_pacientes`
-- (frontend/lib/permissions/routes.ts), mas a escrita em `pacientes` hoje é
-- gated por remuneracao_has_role(['admin','diretoria','cronograma']) — papel,
-- não permissão (20260817190000, linha 311).
--
-- É exatamente a divergência diagnosticada em 20260818210000: não existe tabela
-- ligando papel a grupo de permissão (roleDefaults é seed do frontend, editável
-- depois via /admin/permissoes), então quem recebeu a tela por
-- usuarios_permissoes e não tem o `role` certo veria o formulário e levaria
-- "new row violates row-level security policy" ao salvar — erro no fim do
-- preenchimento, com o trabalho perdido.
--
-- ADITIVA, NÃO SUBSTITUTIVA: RLS é OR entre policies. `pacientes_write`
-- continua existindo, para não tirar acesso de ninguém que escreve hoje; esta
-- soma quem tem a permissão de tela. Decisão confirmada com o usuário.
--
-- `pacientes_select` NÃO É TOCADA. Cronograma, CCO, Central de Pacientes e
-- listar_central_pacientes() dependem do `using (true)`.
--
-- PRÉ-CHECAGEM antes de aplicar (convenção de 20260818210000 — registrar aqui
-- quem passa a ter escrita, para a mudança de superfície ser auditável):
--   select u.nome, u.role from public.usuarios_permissoes up
--     join public.usuarios u on u.id = up.usuario_id
--    where up.permissao_codigo = 'cadastros_pacientes' and up.permitido = true;

drop policy if exists "pacientes_write_cadastro" on public.pacientes;

create policy "pacientes_write_cadastro" on public.pacientes
  for all to authenticated
  using (public.usuario_tem_permissao('cadastros_pacientes'))
  with check (public.usuario_tem_permissao('cadastros_pacientes'));

-- Sem revoke/grant e sem FORCE ROW LEVEL SECURITY aqui, de propósito:
--   - mexer nos grants de `pacientes` afeta TODA tela que a lê;
--   - FORCE faria a RLS valer para o dono da tabela, quebrando o backfill
--     20260817190100 e qualquer rotina que rode como owner.
