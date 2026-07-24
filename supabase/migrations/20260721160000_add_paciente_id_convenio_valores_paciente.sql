-- Mesmo problema do terapia_id (ver 20260721150000): o cruzamento de exceção
-- por paciente em cronograma_convenio_valores_paciente era feito por
-- paciente_nome (texto) — frágil a typo/acento/pontuação (ex.: "Sant'Anna"
-- cadastrado vs "Santanna" na agenda real, que nunca bateram). paciente_id é a
-- chave estável (vem direto de csv_grades_profissionais.paciente_id); nome
-- continua gravado só como rótulo cosmético pra exibição no cadastro.

alter table public.cronograma_convenio_valores_paciente add column if not exists paciente_id bigint;

-- Partial index: só considera linhas com paciente_id preenchido — não conflita
-- com regras antigas ainda não resalvas pelo formulário novo (paciente_id null
-- por ora).
create unique index if not exists uq_convenio_valores_paciente_id
  on public.cronograma_convenio_valores_paciente (convenio_nome, paciente_id) where paciente_id is not null;
