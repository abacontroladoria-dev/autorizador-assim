-- ============================================================================
-- Central de Alertas — infraestrutura genérica (Fase 1)
-- ----------------------------------------------------------------------------
-- Problema: atendimentos ASSIM agendados podem ficar SEM desfecho operacional
-- (ninguém solicitou autorização, ninguém registrou falta, ninguém cancelou).
-- Hoje a Luana descobre isso conferindo /auditoria-assim na mão e abre tarefa no
-- ClickUp para a Recepção — a comunicação vive fora do sistema e o histórico se
-- perde. Esta migration cria a base para o workflow acontecer dentro do Pulsar.
--
-- Escopo desta Fase 1: a infraestrutura é genérica (módulo + entidade + setor),
-- mas a IMPLEMENTAÇÃO é guiada só pela ASSIM. Colunas de extensão entram porque
-- custam uma coluna e evitam migration depois; código/UI/índice para caso de uso
-- inexistente NÃO entra. Na prática, nesta fase:
--   modulo        -> sempre 'assim'
--   entidade_tipo -> sempre 'atendimento' (entidade_id = bloco_id da auditoria)
--   responsavel_id-> sempre NULL (atribuição é por SETOR, não por pessoa)
-- Sem CHECK enumerando valores não usados: prender a lista agora só criaria uma
-- migration futura para afrouxá-la.
--
-- Deliberadamente ausente: motor/DSL de regras, atribuição individual, e-mail/
-- push, preferências de notificação, anexos, menções, SLA, escalonamento.
--
-- Ordem: esta é a 1ª de 3. Depois vêm as RPCs (…100100) e a regra ASSIM (…100200).
-- ============================================================================

-- ── Helper de role ───────────────────────────────────────────────────────────
-- SECURITY DEFINER porque public.usuarios tem RLS própria. STABLE para o
-- planner resolver uma vez por statement em vez de por linha — importa porque
-- este projeto está com aviso de Disk IO Budget ativo.
-- Mesmo padrão de central.ca_current_role() (20260701000700_create_ca_rls_helpers.sql),
-- com prefixo fn_ para não colidir com o current_role() nativo do Postgres.
create or replace function public.fn_usuario_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.usuarios where id = auth.uid() limit 1;
$$;

grant execute on function public.fn_usuario_role() to authenticated;

comment on function public.fn_usuario_role() is
  'Role do usuário autenticado (public.usuarios.role). Usado nas policies de alertas.';

-- ── Catálogo de regras ───────────────────────────────────────────────────────
-- Existe para a tolerância ser calibrável por UPDATE, sem deploy nem migration.
-- Toda coluna aqui é lida por fn_alertas_avaliar_assim ou pela tag de origem no
-- frontend — nenhuma entra "para o futuro".
create table if not exists public.alertas_regras (
  codigo              text primary key,
  modulo              text    not null,
  nome                text    not null,
  setor_destino       text,
  prioridade          text    not null default 'media',
  tolerancia_minutos  integer not null,
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

comment on table public.alertas_regras is
  'Regras que geram alertas automáticos. Fase 1 tem duas, ambas do módulo assim.';
comment on column public.alertas_regras.tolerancia_minutos is
  'Minutos após hora_inicial para virar alerta. 50 = fim da sessão (40min) + ~2 ciclos do robô (que consulta a ASSIM a cada 5min). ZERO = alerta imediato, sem esperar a hora da sessão — usado pela glosa, que é resposta do convênio e pode chegar antes do atendimento. Calibrar por UPDATE.';

insert into public.alertas_regras
  (codigo, modulo, nome, setor_destino, prioridade, tolerancia_minutos)
values
  -- Ninguém solicitou, faltou registrar falta, não cancelou: o caso "esqueceram".
  ('assim_sem_desfecho', 'assim', 'Atendimento sem desfecho operacional', 'recepcao', 'media', 50),
  -- A ASSIM respondeu RECUSANDO. Não é guia válida, então o atendimento continua
  -- pendente — mas a ação é outra (contestar, refazer, contatar o convênio), então
  -- é regra própria com prioridade alta e tolerância zero.
  ('assim_glosa', 'assim', 'Autorização recusada pela ASSIM (glosa)', 'recepcao', 'alta', 0)
on conflict (codigo) do nothing;

-- ── Alertas ──────────────────────────────────────────────────────────────────
create table if not exists public.alertas (
  id             uuid primary key default gen_random_uuid(),
  modulo         text not null,
  regra_codigo   text references public.alertas_regras(codigo) on delete set null,
  origem         text not null,
  entidade_tipo  text not null,
  entidade_id    text not null,
  entidade_ref   jsonb not null default '{}',
  titulo         text not null,
  descricao      text,
  prioridade     text not null default 'media',
  status         text not null default 'aberto',
  setor_destino  text,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  criado_por     uuid references public.usuarios(id) on delete set null,
  resolvido_em   timestamptz,
  resolvido_por  uuid references public.usuarios(id) on delete set null,
  resolucao      text,
  fingerprint    text not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint ck_alertas_origem   check (origem in ('sistema', 'manual')),
  constraint ck_alertas_status   check (status in ('aberto', 'em_andamento', 'resolvido')),
  constraint ck_alertas_resolucao check (resolucao is null or resolucao in ('automatico', 'manual'))
);

comment on table public.alertas is
  'Alertas operacionais. Genérica por módulo/entidade; Fase 1 usa só modulo=assim e entidade_tipo=atendimento.';
comment on column public.alertas.origem is
  'sistema = criado por regra automática; manual = criado por usuário de gestão. Definido SEMPRE pela RPC, nunca pelo cliente — não existe caminho para nascer ambíguo ou falsificado.';
comment on column public.alertas.entidade_id is
  'Chave da entidade como text. Para entidade_tipo=atendimento é o bloco_id de get_auditoria_assim (paciente_id_data_tuss_hora) — chave determinística com paciente_id numérico, não hash de nome.';
comment on column public.alertas.entidade_ref is
  'Snapshot desnormalizado (paciente_nome, data, hora, terapia, tuss) para a lista renderizar sem join. Escolha consciente por causa do aviso de Disk IO Budget.';
comment on column public.alertas.responsavel_id is
  'Atribuição individual. Fase 1 mantém sempre NULL — a atribuição é por setor_destino.';

-- Idempotência COM reabertura: unique PARCIAL, não unique simples.
-- Enquanto o alerta está aberto, o cron pode dar `on conflict do nothing`. Se a
-- condição voltar DEPOIS de resolvida (a recepção disse que solicitou e o robô
-- nunca achou), nasce linha NOVA — o histórico da tentativa anterior fica
-- preservado em vez de sobrescrito.
create unique index if not exists uq_alertas_fingerprint_aberto
  on public.alertas (fingerprint)
  where status <> 'resolvido';

-- Único índice de consulta desta tabela: serve a lista da recepção, a lista da
-- Luana e os contadores do sino. Não crio índice para responsavel_id (sempre
-- NULL na Fase 1) nem para modulo (só existe um) — índice sem consulta é custo
-- de escrita e de disco.
create index if not exists idx_alertas_status_setor
  on public.alertas (status, setor_destino);

-- ── Eventos (histórico append-only) ──────────────────────────────────────────
-- alerta_id é NULLABLE de propósito: permite observação administrativa numa
-- entidade sem alerta aberto, e faz a linha do tempo do ATENDIMENTO atravessar
-- vários alertas ao longo do tempo (requisito de "histórico permanente").
-- A RPC que escreve evento sem alerta não entra na Fase 1 — só a capacidade.
create table if not exists public.alertas_eventos (
  id            bigserial primary key,
  alerta_id     uuid references public.alertas(id) on delete cascade,
  entidade_tipo text not null,
  entidade_id   text not null,
  tipo          text not null,
  autor_tipo    text not null,
  autor_id      uuid references public.usuarios(id) on delete set null,
  autor_nome    text,
  descricao     text not null,
  metadata      jsonb not null default '{}',
  criado_em     timestamptz not null default now(),
  constraint ck_alertas_eventos_autor_tipo
    check (autor_tipo in ('sistema', 'usuario', 'robo'))
);

comment on table public.alertas_eventos is
  'Histórico cronológico append-only. Sem policy de UPDATE/DELETE para authenticated — imutável por construção.';
comment on column public.alertas_eventos.autor_nome is
  'Snapshot do nome no momento do evento. Um join em usuarios não sobreviveria a troca de nome, mudança de setor ou desativação — e o histórico precisa ser legível seis meses depois.';
comment on column public.alertas_eventos.tipo is
  'deteccao | comentario | atribuicao | status | robo | encerramento | observacao';

-- Serve a timeline por entidade, que é como o detalhe consulta.
create index if not exists idx_alertas_eventos_entidade
  on public.alertas_eventos (entidade_tipo, entidade_id, criado_em);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.alertas_regras  enable row level security;
alter table public.alertas         enable row level security;
alter table public.alertas_eventos enable row level security;

-- Regras: leitura para todos (o frontend exibe o nome da regra na tag de
-- origem); escrita só admin.
drop policy if exists alertas_regras_select on public.alertas_regras;
create policy alertas_regras_select on public.alertas_regras
  for select to authenticated using (true);

drop policy if exists alertas_regras_write_admin on public.alertas_regras;
create policy alertas_regras_write_admin on public.alertas_regras
  for all to authenticated
  using      (public.fn_usuario_role() = 'admin')
  with check (public.fn_usuario_role() = 'admin');

-- Alertas: gestão vê tudo; os demais veem só o do seu setor (ou atribuído a si).
drop policy if exists alertas_select on public.alertas;
create policy alertas_select on public.alertas
  for select to authenticated
  using (
    public.fn_usuario_role() in ('admin', 'diretoria', 'autorizacao')
    or setor_destino  = public.fn_usuario_role()
    or responsavel_id = auth.uid()
  );

-- SEM policy de insert/update/delete para authenticated — em NENHUMA das duas
-- tabelas. Toda mutação passa por RPC SECURITY DEFINER, porque cada mudança
-- precisa gravar o evento correspondente na mesma transação. Com UPDATE direto
-- daria para mudar status sem deixar rastro, e é justamente o rastro que
-- substitui o ClickUp. É também o que torna alertas_eventos append-only de fato.

-- Eventos: mesma visibilidade do alerta pai. Eventos sem alerta (observação
-- administrativa) ficam visíveis à gestão.
drop policy if exists alertas_eventos_select on public.alertas_eventos;
create policy alertas_eventos_select on public.alertas_eventos
  for select to authenticated
  using (
    case
      when alerta_id is not null then exists (
        select 1 from public.alertas a where a.id = alertas_eventos.alerta_id
      )
      else public.fn_usuario_role() in ('admin', 'diretoria', 'autorizacao')
    end
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Só `alertas`: o sino precisa saber que ALGO mudou e então busca o detalhe sob
-- demanda. Publicar alertas_eventos dobraria o tráfego de replicação sem ganho —
-- relevante com o aviso de Disk IO Budget (realtime já consumia ~26%).
-- O bloco condicional evita erro se a tabela já estiver na publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'alertas'
  ) then
    alter publication supabase_realtime add table public.alertas;
  end if;
end $$;
