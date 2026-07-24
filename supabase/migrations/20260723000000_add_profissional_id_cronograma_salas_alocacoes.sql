-- Cruzamento por nome (profissional_nome) é frágil: o nome pode ser editado
-- na TiTa, mas o profissional_id nunca muda. Adiciona profissional_id em
-- cronograma_salas_alocacoes para permitir comparar, por profissional_id,
-- quantos turnos ele tem cadastrado aqui vs quantos aparece de fato na agenda
-- real (csv_grades_profissionais) — usado pela aba "Regularizações".
--
-- profissional_nome continua sendo a fonte de verdade para exibição (o
-- cadastro nunca depende só do ID); profissional_id é só a chave estável
-- usada para o cruzamento.

alter table public.cronograma_salas_alocacoes
  add column if not exists profissional_id bigint;

create index if not exists idx_cronograma_salas_alocacoes_profissional_id
  on public.cronograma_salas_alocacoes (profissional_id);

-- Backfill best-effort das linhas já existentes: casa profissional_nome
-- (normalizado) contra csv_grades_profissionais e pega o profissional_id mais
-- frequente encontrado para esse nome. Linhas sem nenhuma correspondência
-- ficam com profissional_id NULL — aparecem na tela de Regularizações como
-- "sem ID" para revisão manual, em vez de serem silenciosamente ignoradas.
with candidatos as (
  select
    a.id as alocacao_id,
    c.profissional_id,
    count(*) as freq,
    row_number() over (partition by a.id order by count(*) desc) as rn
  from public.cronograma_salas_alocacoes a
  join public.csv_grades_profissionais c
    on lower(trim(c.profissional_nome)) = lower(trim(a.profissional_nome))
  where c.profissional_id is not null
  group by a.id, c.profissional_id
)
update public.cronograma_salas_alocacoes a
set profissional_id = cand.profissional_id
from candidatos cand
where cand.alocacao_id = a.id and cand.rn = 1;
