-- `em_uso`: qual laudo está valendo agora. Formaliza no histórico o script
-- solto MIGRATION_LAUDO_EM_USO.sql (raiz do repo), já aplicado à mão.
--
-- POR QUÊ: um paciente acumula laudos (o de 2024, a renovação de 2025, o
-- complementar de outra especialidade), e `situacao` só diz se cada um está
-- Vigente ou Vencido — pode haver dois Vigentes ao mesmo tempo. Quem preenche
-- autorização precisa saber qual é O laudo de referência, e isso é escolha
-- humana, não cálculo de data.
--
-- A exclusividade (um em_uso por paciente) é garantida pelo frontend, em
-- desmarcarOutrosLaudos() de frontend/services/pacienteLaudos.service.ts, e não
-- por constraint. Não é o ideal — um índice parcial único por paciente seria
-- mais firme —, mas fica registrado aqui como está, e não inventado nesta
-- migration de histórico.

alter table public.paciente_laudos
  add column if not exists em_uso boolean default false;

comment on column public.paciente_laudos.em_uso is
  'Define se este é o laudo principal/ativo atualmente utilizado para o paciente. Quando um laudo é marcado como em_uso, os demais devem ser desmarcados — hoje isso é feito pelo frontend (desmarcarOutrosLaudos), não por constraint.';

-- A view ganha a coluna nova. Esta é a forma que está viva em produção.
create or replace view public.vw_paciente_laudos_flat as
select
  pl.id          as id_laudo,
  pl.paciente_id as id_paciente,
  p.nome         as nome_paciente,
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
  pl.em_uso
from public.paciente_laudos pl
join public.pacientes p
  on p.id_paciente = pl.paciente_id
left join public.paciente_laudo_especialidades ple
  on ple.laudo_id = pl.id;
