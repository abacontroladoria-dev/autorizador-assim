-- Acrescenta a entidade `alta` à trilha de cadastros.
--
-- DIAGNÓSTICO (2026-08-26, corrigido depois de investigação com o usuário):
-- a princípio parecia que 'laudo' e 'alta_individualidade' nunca tinham sido
-- aceitos pelo CHECK de cadastros_auditoria em produção — havia 3 laudos
-- criados sem nenhuma linha de trilha correspondente. Inspecionado o CHECK e
-- as policies AO VIVO, os dois já continham 'laudo' e 'alta_individualidade'
-- (creditado a 20260826130000). O que resolveu o mistério foi o horário: os 3
-- laudos sem trilha foram criados às 16:52/17:18/17:47, e a PRIMEIRA linha de
-- trilha bem-sucedida no banco inteiro — de qualquer entidade — é das 18:00.
-- Ou seja, 20260826130000 foi aplicada nesse intervalo, e os 3 laudos
-- tentaram gravar ANTES disso e caíram no CHECK antigo. Depois das 18:00 o
-- fluxo já funciona normalmente; os 3 registros históricos ficam sem trilha
-- (não são recuperáveis, e fabricar uma entrada retroativa seria pior que
-- deixar o buraco visível).
--
-- O QUE CONTINUA FALTANDO, DE VERDADE: `alta`. `paciente_altas` (1:N, criada
-- em 20260826140100) e `paciente_altas_individualidades` (0-ou-1 por
-- paciente) são tabelas DIFERENTES, com sequências de id PRÓPRIAS. O código
-- até agora gravava as duas sob o mesmo rótulo `alta_individualidade` — a
-- alta nº 3 e a individualidade nº 3 ficariam indistinguíveis no filtro
-- (tabela, registro_id) do histórico. O frontend já foi corrigido para gravar
-- `criarAlta`/`excluirAlta` sob `alta`; esta migration só abre espaço para
-- esse valor no banco.
--
-- IDEMPOTENTE: redefine CHECK e as duas policies com a lista final completa,
-- então roda sem erro mesmo se já tiver sido aplicada.

-- ===== CHECK =====
alter table public.cadastros_auditoria
  drop constraint if exists cadastros_auditoria_tabela_check;

alter table public.cadastros_auditoria
  add constraint cadastros_auditoria_tabela_check
  check (tabela in (
    'paciente', 'responsavel', 'ficha_medica',
    'laudo', 'alta', 'alta_individualidade',
    'convenio', 'plano_saude'
  ));

-- ===== RLS =====
-- Mesma condição já em vigor para laudo/alta_individualidade desde
-- 20260826130000 — só estende a lista de tabela para incluir 'alta'.
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
  );

comment on column public.cadastros_auditoria.tabela is
  'Entidade do cadastro a que a linha se refere. `alta` (paciente_altas, 1:N) e `alta_individualidade` (paciente_altas_individualidades, 0-ou-1 por paciente) são tabelas DIFERENTES com sequências de id próprias — por isso entidades separadas, senão registro_id de uma colide com o da outra.';
