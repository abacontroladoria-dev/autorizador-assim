-- Duas correções na trilha de cadastros (20260826120000), ambas descobertas com
-- o Histórico do paciente vazio na tela.
--
-- 1) `laudo` e `alta_individualidade` faltavam no CHECK e nas policies.
--    frontend/services/pacienteLaudos.service.ts e
--    frontend/services/pacienteAltaIndividualidade.service.ts já gravam com
--    esses valores, e o modal do paciente já os pede
--    (components/cadastros/pacientes/PacienteDetalhe.tsx). Como
--    registrarAuditoria() nunca propaga erro de propósito — auditoria não pode
--    derrubar a ação principal —, cada insert era rejeitado pelo banco e morria
--    em console.error: laudo criado, trilha muda.
--
-- 2) A permissão exigida era SÓ usuario_tem_permissao(), que lê
--    usuarios_permissoes e IGNORA roleDefaults (seed do frontend, sem tabela
--    ligando papel a grupo de permissão). Quem tem a tela pelo papel
--    admin/diretoria/cronograma não gravava nem lia a própria trilha. É a mesma
--    divergência já diagnosticada em 20260818210000 e em
--    20260826100500_pacientes_rls_cadastros_pacientes.sql.
--
-- ADITIVA: o ramo por permissão continua igual, só ganha um OR por papel.
-- Ninguém perde acesso. Segue insert-only: nenhuma policy ou grant de
-- UPDATE/DELETE aqui, de propósito.

alter table public.cadastros_auditoria
  drop constraint if exists cadastros_auditoria_tabela_check;

alter table public.cadastros_auditoria
  add constraint cadastros_auditoria_tabela_check
  check (tabela in (
    'paciente', 'responsavel', 'ficha_medica',
    'laudo', 'alta_individualidade',
    'convenio', 'plano_saude'
  ));

-- ===== RLS =====
-- A permissão exigida acompanha a ENTIDADE da linha: quem só tem o cadastro de
-- pacientes não passa a enxergar o histórico de convênios de brinde.
drop policy if exists "cadastros_auditoria_select" on public.cadastros_auditoria;

create policy "cadastros_auditoria_select" on public.cadastros_auditoria
  for select to authenticated
  using (
    (tabela in ('paciente', 'responsavel', 'ficha_medica', 'laudo', 'alta_individualidade')
      and (
        public.usuario_tem_permissao('cadastros_pacientes')
        or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
      ))
    or (tabela in ('convenio', 'plano_saude')
      and (
        public.usuario_tem_permissao('cadastros_convenios')
        or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
      ))
  );

drop policy if exists "cadastros_auditoria_insert" on public.cadastros_auditoria;

create policy "cadastros_auditoria_insert" on public.cadastros_auditoria
  for insert to authenticated
  with check (
    (tabela in ('paciente', 'responsavel', 'ficha_medica', 'laudo', 'alta_individualidade')
      and (
        public.usuario_tem_permissao('cadastros_pacientes')
        or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
      ))
    or (tabela in ('convenio', 'plano_saude')
      and (
        public.usuario_tem_permissao('cadastros_convenios')
        or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
      ))
  );

comment on table public.cadastros_auditoria is
  'Trilha de auditoria dos cadastros de Pacientes, Responsáveis, Ficha Médica, Laudos, Altas/Individualidades, Convênios e Planos de Saúde. Insert-only: sem policy de UPDATE/DELETE, de propósito. Escrita pelo frontend (services de cadastro), não por trigger — ver frontend/services/cadastrosAuditoria.service.ts.';
