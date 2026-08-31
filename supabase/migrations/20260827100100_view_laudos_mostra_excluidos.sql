-- Correção: vw_paciente_laudos_flat (20260827100000) tinha `where pl.ativo`,
-- escondendo o laudo excluído também da view — errado pelo mesmo motivo do
-- frontend (ver commit seguinte a 5520ad3): "excluir" marca ativo = false,
-- mas o registro continua visível, só sinalizado. Quem decide esconder é a
-- tela, não a consulta.
--
-- A view ganha a coluna `ativo` (antes não existia nela) para quem consumir a
-- view fora do frontend — relatório, conferência manual — também conseguir
-- distinguir excluído de ativo, em vez de simplesmente não ver a linha.

create or replace view public.vw_paciente_laudos_flat as
select
  pl.id_laudo,
  pl.id_paciente_pulsar,
  p.nome as nome_paciente,
  pl.data_laudo,
  coalesce(pl.validade, (pl.data_laudo + interval '6 months')::date) as validade,
  case
    when coalesce(pl.validade, (pl.data_laudo + interval '6 months')::date) >= current_date
      then 'Vigente'
    else 'Vencido'
  end as situacao,
  pl.autorizado_em,
  pl.comp_agressivo,
  pl.paciente_verbal,
  pl.ambiente_natural,
  pl.nivel_suporte,
  ple.especialidade,
  ple.qt_laudo,
  ple.qt_autorizacao,
  pl.alta,
  pl.data_alta,
  pl.em_uso,
  pl.ativo
from public.cadastros_pacientes_laudos pl
join public.pacientes p
  on p.id_paciente = pl.id_paciente_pulsar
left join public.cadastros_pacientes_laudo_especialidades ple
  on ple.id_laudo = pl.id_laudo;
