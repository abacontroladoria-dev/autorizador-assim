-- ─── Auditoria de agendamentos (Ocupação de Paciente) ───────────────────────
-- Trilha append-only: UMA linha imutável por gravação, carimbada com o usuário
-- autenticado e o horário no exato momento da ação. Diferente de
-- acomp_pac_bundles.atualizado_por (que é sobrescrito a cada re-sync e por isso
-- só reflete "quem tocou por último"), esta tabela NUNCA é regravada — cada
-- evento é um registro histórico permanente.
--
-- Dois tipos de evento, gravados separadamente:
--   • 'aceite'        → decisão na tela que cria/altera um bundle
--                       (confirmado, recusado, inviável, pendente). Gravado no
--                       cliente, no choke point persistPacBundles.
--   • 'escrita_tita'  → escrita EFETIVA na API da TiTa (fase de criação do
--                       agendamento). Gravado no servidor, na rota
--                       app/api/tita/confirmar-agendamento, com o resultado real
--                       por sessão (criadas/conflitos/rejeitadas).
--
-- Uma linha por SESSÃO (não por bundle): assim a consulta já traz profissional,
-- terapia, dia e hora sem precisar expandir jsonb. O campo lote_id agrupa as
-- sessões de uma mesma ação.

create table if not exists acomp_auditoria (
  id            bigint generated always as identity primary key,
  evento        text        not null check (evento in ('aceite', 'escrita_tita')),
  lote_id       text,                    -- agrupa as sessões de uma mesma ação/bundle
  bundle_id     text,                    -- id do AceitePacBundle, quando houver
  status_bundle text,                    -- confirmado | recusado | inviavel | pendente (evento=aceite)
  paciente      text        not null,
  profissional  text,
  terapia       text,
  dia           text,                    -- dia da sessão agendada (ex.: "Segunda-feira")
  hora          text,                    -- hora da sessão agendada (ex.: "08:40")
  unidade       text,
  csv_grade_id  text,                    -- origem em csv_grades_profissionais
  -- Resultado da escrita na TiTa (só evento='escrita_tita')
  resultado     text,                    -- success | partial_success | failed | erro_api
  criadas       integer,
  conflitos     integer,
  rejeitadas    integer,
  id_agenda_fav bigint,
  dados         jsonb,                   -- payload extra livre (origem, motivo, código de erro…)
  -- Autoria — carimbada no momento da escrita, imutável
  usuario_id    uuid        not null default auth.uid() references auth.users,
  usuario_email text,                    -- snapshot do e-mail no momento da ação
  criado_em     timestamptz not null default now()
);

create index if not exists idx_acomp_auditoria_criado_em on acomp_auditoria (criado_em desc);
create index if not exists idx_acomp_auditoria_evento     on acomp_auditoria (evento);
create index if not exists idx_acomp_auditoria_paciente   on acomp_auditoria (paciente);
create index if not exists idx_acomp_auditoria_usuario    on acomp_auditoria (usuario_id);
create index if not exists idx_acomp_auditoria_lote       on acomp_auditoria (lote_id);

alter table acomp_auditoria enable row level security;

-- Leitura: qualquer usuário autenticado (mesmo padrão das demais tabelas acomp_*).
drop policy if exists "acomp_auditoria select" on acomp_auditoria;
create policy "acomp_auditoria select" on acomp_auditoria
  for select to authenticated using (true);

-- Inserção: só é possível carimbando a si mesmo — usuario_id TEM de bater com
-- auth.uid(), então ninguém consegue forjar um evento em nome de outro usuário.
drop policy if exists "acomp_auditoria insert" on acomp_auditoria;
create policy "acomp_auditoria insert" on acomp_auditoria
  for insert to authenticated with check (usuario_id = auth.uid());

-- SEM políticas de UPDATE/DELETE: como o RLS nega por padrão o que não tem
-- política, a tabela é imutável para o papel 'authenticated' (append-only).
-- Correções eventuais só via role de serviço/admin (que ignora RLS).

-- ─── View de consulta (formato BR, hora em coluna separada) ──────────────────
-- Pronta para o SQL Editor / relatórios: data em DD/MM/AAAA e horário de
-- Brasília, uma linha por sessão, já com o usuário real de cada evento.
create or replace view vw_acomp_auditoria as
select
  a.id,
  a.evento,
  to_char(a.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as data,
  to_char(a.criado_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as hora_registro,
  a.usuario_email                                                     as usuario,
  a.paciente,
  a.profissional,
  a.terapia,
  a.dia                                                               as dia_sessao,
  a.hora                                                              as hora_sessao,
  a.unidade,
  a.status_bundle,
  a.resultado,
  a.criadas,
  a.conflitos,
  a.rejeitadas,
  a.id_agenda_fav,
  a.bundle_id,
  a.lote_id,
  a.usuario_id,
  a.criado_em
from acomp_auditoria a
order by a.criado_em desc;

grant select on vw_acomp_auditoria to authenticated;
