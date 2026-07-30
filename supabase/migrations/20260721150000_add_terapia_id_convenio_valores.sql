-- O cruzamento de "regra por terapia" em cronograma_convenio_valores era feito
-- por terapia_nome (texto) — frágil, porque o nome de exibição da terapia pode
-- ser renomeado a qualquer momento no TITA sem o ID mudar. terapia_id é a
-- chave estável (vem direto de csv_grades_profissionais.terapia_id); nome
-- continua gravado só como rótulo cosmético pra exibição no cadastro.

alter table public.cronograma_convenio_valores add column if not exists terapia_id bigint;

-- Partial index: só considera linhas com terapia_id preenchido — não conflita
-- com as linhas de "regra geral" (terapia_id null) nem com regras antigas
-- ainda não resalvas pelo formulário novo (também terapia_id null por ora).
create unique index if not exists uq_convenio_valores_terapia_id
  on public.cronograma_convenio_valores (convenio_nome, terapia_id) where terapia_id is not null;
