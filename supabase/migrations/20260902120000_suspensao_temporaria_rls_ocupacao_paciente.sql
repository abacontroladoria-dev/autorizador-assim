-- Amplia a leitura de cadastros_pacientes_suspensoes_temporarias para quem
-- tem a permissão `cronograma_ocupacao_paciente`.
--
-- POR QUE: a Ocupação de Paciente (/cronograma/ocupacao-paciente) passou a
-- consultar esta tabela para não ofertar especialidade suspensa (ver
-- frontend/lib/cronograma/suspensaoTemporaria.ts). O acesso à TELA é
-- controlado por um código de permissão próprio, por usuário
-- (`cronograma_ocupacao_paciente`, ver 20260818210000) — INDEPENDENTE de
-- `cadastros_pacientes`/papel admin/diretoria/cronograma, que é o que a RLS
-- desta tabela hoje exige (20260902100100). Os dois coincidem hoje só por
-- causa do seed do grupo-modelo "cronograma" (20260819130000), não por
-- garantia estrutural — um usuário só com `cronograma_ocupacao_paciente`
-- leria zero linhas em silêncio, e a ferramenta continuaria ofertando a
-- especialidade suspensa pra esse usuário. Mesmo padrão de
-- 20260828150100, que abriu um ramo próprio de permissão para
-- `laudo_acompanhamento` em vez de forçar a entidade a caber na condição
-- já existente.
--
-- SÓ AMPLIA LEITURA. Não mexe em insert/update/delete — quem só tem
-- `cronograma_ocupacao_paciente` continua sem poder criar/editar/reativar
-- suspensão, só pode lê-la (o necessário para a ferramenta funcionar).

drop policy if exists cadastros_pacientes_suspensoes_temporarias_select
  on public.cadastros_pacientes_suspensoes_temporarias;

create policy cadastros_pacientes_suspensoes_temporarias_select
  on public.cadastros_pacientes_suspensoes_temporarias
  for select to authenticated
  using (
    public.usuario_tem_permissao('cadastros_pacientes')
    or public.usuario_tem_permissao('cronograma_ocupacao_paciente')
    or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
  );
