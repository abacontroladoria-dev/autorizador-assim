-- Laudo deixa de ter estado "excluído".
--
-- POR QUÊ: "excluir" um laudo era ação sem volta — a tela não oferecia desfazer
-- — e tentava exprimir o que a vigência já exprime sozinha. O resultado era um
-- laudo VIGENTE aparecendo apagado e sem botão de editar só porque alguém
-- clicou na lixeira, enquanto um laudo vencido, que de fato deixou de valer,
-- aparecia igual a um vigente.
--
-- A partir de agora o cartão apagado significa "fora da validade E fora de
-- uso", e volta ao normal sozinho quando um dos dois muda. Sem clique, sem
-- estado a desfazer.
--
-- ESTA MIGRATION É SÓ DADO: devolve ao normal os laudos que ficaram marcados
-- antes da mudança. O botão de excluir e a leitura de `ativo` já saíram do
-- frontend (AbaLaudo.tsx, pacienteLaudos.service.ts, types/laudos.ts).
--
-- A COLUNA `ativo` NÃO É DROPADA, de propósito:
--   1. public.vw_paciente_laudos_flat projeta pl.ativo — dropar quebraria a view
--      (e ela alimenta o Acompanhamento de Laudos);
--   2. public.cadastros_pacientes_altas usa a MESMA coluna com o significado
--      antigo, e altas seguem tendo exclusão pela tela.
-- Para laudo ela passa a ser sempre true, e o comentário abaixo registra isso.

-- ===== 1. Todo laudo volta ao normal =====
--
-- `em_uso` NÃO é restaurado junto: excluirLaudo zerava os dois de uma vez, e
-- qual laudo estava em uso antes da exclusão é informação que se perdeu ali.
-- Reativar chutando em_uso = true marcaria como laudo de referência algum que
-- talvez não fosse — quem precisar marca de novo na tela, que é uma edição
-- consciente.
update public.cadastros_pacientes_laudos
   set ativo = true
 where ativo = false;

-- ===== 2. Trilha =====
-- A reativação em massa é uma alteração de registro clínico: precisa aparecer
-- no Histórico do paciente como qualquer outra.
insert into public.cadastros_auditoria
  (tabela, registro_id, acao, paciente_id, paciente_nome, alvo_nome, depois, motivo)
select
  'laudo', l.id_laudo::text, 'reativar', l.id_paciente_pulsar, p.nome,
  'Laudo de ' || to_char(l.data_laudo, 'DD/MM/YYYY'),
  jsonb_build_object('ativo', true),
  'Estado "excluído" deixou de existir para laudos: o cartão apagado passou a significar fora de validade e fora de uso.'
from public.cadastros_pacientes_laudos l
join public.pacientes p on p.id_paciente = l.id_paciente_pulsar
where not exists (
  select 1 from public.cadastros_auditoria a
  where a.tabela = 'laudo'
    and a.registro_id = l.id_laudo::text
    and a.acao = 'reativar'
);

comment on column public.cadastros_pacientes_laudos.ativo is
  'OBSOLETA para laudo: sempre true desde 20260831130000. Laudo não tem mais '
  'estado "excluído" — o cartão apagado da tela significa fora da validade E '
  'fora de uso, calculado na hora. Mantida porque vw_paciente_laudos_flat a '
  'projeta e cadastros_pacientes_altas.ativo, que é outra coluna, segue com o '
  'significado original. Não voltar a escrever false aqui.';

-- ===== CONFERÊNCIA =====
select
  count(*)                              as laudos_total,
  count(*) filter (where ativo)         as ativos,
  count(*) filter (where not ativo)     as ainda_marcados_como_excluidos
from public.cadastros_pacientes_laudos;
-- Esperado: ainda_marcados_como_excluidos = 0.
