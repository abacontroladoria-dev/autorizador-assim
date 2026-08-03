-- Cruzamento por nome de terapia (terapia_nome, texto livre digitado na
-- planilha/formulário) é frágil: o mesmo profissional pode aparecer com
-- nomes diferentes pro mesmo terapia_id real ("Analista do Comportamento",
-- "Aplicador ABA (PS)", "Coordenador de Caso" já vimos coexistindo pra IDs
-- que já existem em csv_grades_profissionais). Adiciona terapia_id (mesma
-- ideia de profissional_id em 20260723000000) — o ID nunca muda, o nome pode.
--
-- terapia_nome continua sendo a fonte de verdade para exibição; terapia_id é
-- só a chave estável usada para cruzamento/validação (ex.: detectar nome
-- desatualizado comparando com o terapia_id mais frequente dessa pessoa
-- nessa sala, em csv_grades_profissionais).
--
-- Nota: aplicado direto em produção via `supabase db query --linked` (não
-- via `db push`) porque o histórico de migrations estava dessincronizado no
-- momento (8 migrations de 28-30/07 aparecendo como pendentes) — este
-- arquivo documenta a mudança já aplicada, não precisa ser reaplicado.

alter table public.cronograma_salas_alocacoes
  add column if not exists terapia_id integer;

create index if not exists idx_cronograma_salas_alocacoes_terapia_id
  on public.cronograma_salas_alocacoes (terapia_id);
