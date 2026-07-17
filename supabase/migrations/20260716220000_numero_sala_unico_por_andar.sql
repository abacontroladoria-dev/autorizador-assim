-- A trava anterior (uq_cronograma_salas_unidade_numero) impedia o número de
-- sala se repetir em toda a unidade, mesmo entre andares diferentes. Na
-- prática a numeração é por andar (Sala 1 do 1º andar e Sala 1 do 2º andar da
-- mesma unidade são salas físicas distintas) — então a unicidade passa a ser
-- por (unidade, andar, número). `coalesce(andar, '')` garante que salas sem
-- andar preenchido ainda conflitem corretamente entre si (NULL não seria
-- comparável a outro NULL numa unique index comum).

drop index if exists public.uq_cronograma_salas_unidade_numero;

create unique index if not exists uq_cronograma_salas_unidade_andar_numero
  on public.cronograma_salas (unidade_nome, (coalesce(andar, '')), numero_sala);
