-- Acrescenta a entidade `pdi_controle_prazos` à trilha de cadastros — mesmo
-- padrão de 20260828150100_cadastros_auditoria_laudo_acompanhamento.sql
-- (que fez o mesmo para `laudo_acompanhamento`).
--
-- `registro_id` recebe o `paciente_id` (como texto) — a PK de
-- public.pdi_controle_prazos.
--
-- ⚠️ PRECEDENTE QUE ESTA MIGRATION EXISTE PARA NÃO REPETIR (ver
-- 20260828150100): se esta migration não for aplicada junto com a tela, todo
-- INSERT de trilha do PDI é rejeitado pelo CHECK em silêncio (o frontend hoje
-- avisa com toast — avisarFalhaDeTrilha — mas o aviso não substitui o CHECK
-- aplicado).
--
-- A permissão é a MESMA da tabela de estado (`terapeutico_pdi` + papel
-- admin/diretoria — ver 20260904120000): o histórico de um registro só faz
-- sentido para quem pode ver o registro em si.
--
-- IDEMPOTENTE: redefine CHECK e as duas policies com a lista final completa.
--
-- ⚠️ 04/09/2026: a primeira versão deste arquivo foi escrita a partir de
-- 20260828150100 e não conhecia 20260902100200 (que acrescentou
-- `suspensao_temporaria`, já com linha real em produção) — reescrever a
-- lista sem esse valor quebrou a aplicação com o mesmo erro que o cabeçalho
-- de 20260902100200 já documentava para `laudo_acompanhamento`: "check
-- constraint ... is violated by some row". Corrigido incluindo
-- `suspensao_temporaria` de volta. Mesmo risco vale para a PRÓXIMA migration
-- que reescrever esta lista: confira `select distinct tabela from
-- cadastros_auditoria` (ou a migration mais recente que tocou este CHECK)
-- antes de substituir a lista inteira.

-- ===== CHECK =====
alter table public.cadastros_auditoria
  drop constraint if exists cadastros_auditoria_tabela_check;

alter table public.cadastros_auditoria
  add constraint cadastros_auditoria_tabela_check
  check (tabela in (
    'paciente', 'responsavel', 'ficha_medica',
    'laudo', 'alta', 'alta_individualidade', 'suspensao_temporaria',
    'laudo_acompanhamento',
    'pdi_controle_prazos',
    'convenio', 'plano_saude'
  ));

-- ===== RLS =====
-- Os quatro primeiros ramos são idênticos a 20260902100200, byte a byte; o
-- quinto é o novo. Reescritos por inteiro porque policy não se estende.

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
    or (tabela = 'pdi_controle_prazos'
      and (
        public.usuario_tem_permissao('terapeutico_pdi')
        or public.remuneracao_has_role(array['admin','diretoria'])
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
    or (tabela = 'pdi_controle_prazos'
      and (
        public.usuario_tem_permissao('terapeutico_pdi')
        or public.remuneracao_has_role(array['admin','diretoria'])
      ))
  );

comment on column public.cadastros_auditoria.registro_id is
  'Id do registro alterado, como texto. Para paciente é id_paciente; para `laudo_acompanhamento` é o `ID Laudo` do Órbita; para `pdi_controle_prazos` é o paciente_id (a PK de public.pdi_controle_prazos); para os demais, o id da própria entidade.';
