-- Acrescenta a entidade `suspensao_temporaria` à trilha de cadastros.
--
-- Mesmo motivo de 20260826140300 para `alta`: sem o CHECK e a RLS de
-- cadastros_auditoria conhecerem o valor novo, todo insert de trilha da
-- suspensão temporária seria rejeitado pelo banco e morreria em
-- console.error — silêncio total, como já aconteceu antes.
--
-- ⚠️ Esta migration reescreve CHECK + policies por inteiro (não estendem), e
-- por isso PRECISA repetir a lista final completa que já estava em produção
-- — incluindo `laudo_acompanhamento` (20260828150100), que a primeira versão
-- deste arquivo esqueceu e quebrou a aplicação com
-- "check constraint ... is violated by some row" (havia linha existente com
-- tabela = 'laudo_acompanhamento', fora da lista antiga deste arquivo).
--
-- IDEMPOTENTE: redefine CHECK e as três policies com a lista final completa,
-- então roda sem erro mesmo se já tiver sido aplicada.

-- ===== CHECK =====
alter table public.cadastros_auditoria
  drop constraint if exists cadastros_auditoria_tabela_check;

alter table public.cadastros_auditoria
  add constraint cadastros_auditoria_tabela_check
  check (tabela in (
    'paciente', 'responsavel', 'ficha_medica',
    'laudo', 'alta', 'alta_individualidade', 'suspensao_temporaria',
    'laudo_acompanhamento',
    'convenio', 'plano_saude'
  ));

-- ===== RLS =====
-- Os ramos 'cadastros_pacientes'/'cadastros_convenios' e o de
-- laudo_acompanhamento são idênticos a 20260828150100, byte a byte; só o
-- primeiro ramo ganha 'suspensao_temporaria' na lista.
drop policy if exists "cadastros_auditoria_select" on public.cadastros_auditoria;

create policy "cadastros_auditoria_select" on public.cadastros_auditoria
  for select to authenticated
  using (
    (tabela in ('paciente', 'responsavel', 'ficha_medica', 'laudo', 'alta', 'alta_individualidade', 'suspensao_temporaria')
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
    (tabela in ('paciente', 'responsavel', 'ficha_medica', 'laudo', 'alta', 'alta_individualidade', 'suspensao_temporaria')
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
