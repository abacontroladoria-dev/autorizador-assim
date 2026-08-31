-- A chamada da recepção passa a guardar QUAL SESSÃO ela chamou.
--
-- Até aqui o vínculo era `chamada_paciente.agenda_id`, escrito só pela página
-- /autorizacoes — que guardava ali o id de `fila_autorizacoes` (apesar do nome
-- da coluna dizer "agenda"). Com a /autorizacoes descontinuada, quem chama é a
-- /solicitar, e ela não tem esse id: a RPC `listar_central_autorizacoes` não
-- devolve `id` nem `agenda_id`, e no instante do "Chamar" a linha da fila
-- normalmente NEM EXISTE — o responsável é chamado justamente para que a
-- autorização possa ser feita.
--
-- Por isso o vínculo passa a ser a identidade da sessão, e não um id de linha:
-- (paciente_id, data_atendimento, horario). Essa tupla:
--
--   * existe no momento da chamada, sempre, independente da fila;
--   * é a MESMA chave que a /solicitar já usa para achar a linha da fila;
--   * tem UNIQUE (`unique_fila_agendamento`), então casa com no máximo uma
--     linha — não há "e se vierem duas";
--   * é por sessão, então paciente com duas sessões no dia não some da TV
--     quando só a primeira encerra.
--
-- `paciente_id` é TEXT de propósito, para casar direto com
-- `fila_autorizacoes.paciente_id` (que é text). Bigint aqui forçaria um cast na
-- leitura da TV e derrubaria justamente os índices que tornam essa busca barata.

ALTER TABLE public.chamada_paciente
  ADD COLUMN IF NOT EXISTS paciente_id      text,
  ADD COLUMN IF NOT EXISTS data_atendimento date,
  ADD COLUMN IF NOT EXISTS horario          time without time zone;

COMMENT ON COLUMN public.chamada_paciente.paciente_id IS
  'Sessão chamada: casa com fila_autorizacoes.paciente_id (text, sem cast).';

COMMENT ON COLUMN public.chamada_paciente.data_atendimento IS
  'Sessão chamada: parte 2 de 3 da tupla que identifica a sessão.';

COMMENT ON COLUMN public.chamada_paciente.horario IS
  'Sessão chamada: parte 3 de 3 da tupla que identifica a sessão.';

-- Nullable e sem backfill: as chamadas antigas (as que ainda estiverem dentro da
-- janela de 6h da TV quando isto subir) continuam sem sessão e simplesmente
-- expiram pela janela, como sempre fizeram. Não há o que recuperar — a
-- /autorizacoes gravava id de fila, não a tupla.
COMMENT ON COLUMN public.chamada_paciente.agenda_id IS
  'LEGADO: guardava fila_autorizacoes.id, escrito só pela /autorizacoes (removida em 2026-08-26). Nada escreve mais aqui; a leitura da TV usa a tupla de sessão.';
