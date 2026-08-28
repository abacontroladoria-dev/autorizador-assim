-- Acrescenta a entidade `laudo_acompanhamento` à trilha de cadastros.
--
-- POR QUE REUSAR cadastros_auditoria, e não criar uma tabela de histórico nova:
-- o comentário de 20260826120000 já diz para que ela existe — "a tela de
-- histórico do paciente precisa mostrar, na mesma linha do tempo, a edição do
-- paciente, a troca do responsável e a alteração da ficha médica; com tabelas
-- separadas isso viraria três consultas e uma ordenação no cliente". O aviso da
-- recepção sobre um laudo vencido É histórico daquele paciente, e vai querer
-- aparecer nessa mesma linha do tempo. Uma quarta tabela seria a quarta consulta.
--
-- `registro_id` recebe o `ID Laudo` do Órbita — texto, que é justamente o que a
-- coluna já aceita (ver o comment dela em 20260826120000: "text e não bigint (…)
-- permite entidade com chave composta ou textual sem migrar a coluna"). É a
-- mesma PK de public.laudos_acompanhamento (20260828150000), e a única chave do
-- Órbita que sobrevive à troca de importação do robô.
--
-- ⚠️ PRECEDENTE QUE ESTA MIGRATION EXISTE PARA NÃO REPETIR: 'laudo' e
-- 'alta_individualidade' ficaram fora do CHECK em produção enquanto o frontend
-- já gravava sob eles, e TODO insert de trilha era rejeitado pelo banco em
-- silêncio (morria em console.error). Ver 20260826140300. Hoje o frontend avisa
-- com toast (avisarFalhaDeTrilha), mas o aviso não substitui o CHECK aplicado:
-- se esta migration não for aplicada junto com a tela, o histórico do
-- acompanhamento nasce vazio e a tela parece funcionar.
--
-- ─── A permissão é OUTRA, e isso é intencional ───
--
-- Os ramos existentes exigem `cadastros_pacientes`. A recepção NÃO tem esse
-- código (ver roleDefaults em frontend/lib/permissions/routes.ts) — e é a
-- recepção que opera esta tela. Por isso `laudo_acompanhamento` ganha um ramo
-- próprio, com `acompanhamento_laudos` e o papel `recepcao`, em vez de entrar na
-- lista de tabela já existente: enfiá-lo lá daria a tela a quem tem o cadastro e
-- a negaria a quem faz o trabalho.
--
-- IDEMPOTENTE: redefine CHECK e as duas policies com a lista final completa.

-- ===== CHECK =====
alter table public.cadastros_auditoria
  drop constraint if exists cadastros_auditoria_tabela_check;

alter table public.cadastros_auditoria
  add constraint cadastros_auditoria_tabela_check
  check (tabela in (
    'paciente', 'responsavel', 'ficha_medica',
    'laudo', 'alta', 'alta_individualidade',
    'laudo_acompanhamento',
    'convenio', 'plano_saude'
  ));

-- ===== RLS =====
-- Os dois primeiros ramos são idênticos a 20260826140300, byte a byte; o
-- terceiro é o novo. Reescritos por inteiro porque policy não se estende.

drop policy if exists "cadastros_auditoria_select" on public.cadastros_auditoria;

create policy "cadastros_auditoria_select" on public.cadastros_auditoria
  for select to authenticated
  using (
    (tabela in ('paciente', 'responsavel', 'ficha_medica', 'laudo', 'alta', 'alta_individualidade')
      and (
        public.usuario_tem_permissao('cadastros_pacientes')
        or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
      ))
    or (tabela in ('convenio', 'plano_saude')
      and (
        public.usuario_tem_permissao('cadastros_convenios')
        or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
      ))
    or (tabela = 'laudo_acompanhamento'
      and (
        public.usuario_tem_permissao('acompanhamento_laudos')
        or public.remuneracao_has_role(array['admin','diretoria','recepcao'])
      ))
  );

drop policy if exists "cadastros_auditoria_insert" on public.cadastros_auditoria;

create policy "cadastros_auditoria_insert" on public.cadastros_auditoria
  for insert to authenticated
  with check (
    (tabela in ('paciente', 'responsavel', 'ficha_medica', 'laudo', 'alta', 'alta_individualidade')
      and (
        public.usuario_tem_permissao('cadastros_pacientes')
        or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
      ))
    or (tabela in ('convenio', 'plano_saude')
      and (
        public.usuario_tem_permissao('cadastros_convenios')
        or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
      ))
    or (tabela = 'laudo_acompanhamento'
      and (
        public.usuario_tem_permissao('acompanhamento_laudos')
        or public.remuneracao_has_role(array['admin','diretoria','recepcao'])
      ))
  );

comment on column public.cadastros_auditoria.registro_id is
  'Id do registro alterado, como texto. Para paciente é id_paciente; para `laudo_acompanhamento` é o `ID Laudo` do Órbita (a PK de public.laudos_acompanhamento); para os demais, o id da própria entidade.';
