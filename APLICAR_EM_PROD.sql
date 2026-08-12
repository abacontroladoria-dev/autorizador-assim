-- =============================================================================
-- Central de Alertas + Pendencias ASSIM -- aplicar em PRODUCAO
-- Consolidado das 3 migrations. Rode TUDO de uma vez no SQL Editor.
-- Idempotente: pode reaplicar por cima de uma instalacao anterior.
-- AS REGRAS NASCEM DESATIVADAS (ultima instrucao).
-- =============================================================================

BEGIN;


-- ###########################################################################
-- 20260730100000_create_alertas_infra.sql
-- ###########################################################################

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

-- ###########################################################################
-- 20260730100100_alertas_rpcs.sql
-- ###########################################################################

-- ============================================================================
-- Central de Alertas — RPCs de leitura e mutação (Fase 1)
-- ----------------------------------------------------------------------------
-- Depende de 20260730100000_create_alertas_infra.sql.
--
-- Divisão de responsabilidade:
--   LEITURA  -> SECURITY INVOKER (default). A RLS de public.alertas já filtra
--               por setor/gestão; a função não precisa repetir a regra.
--   MUTAÇÃO  -> SECURITY DEFINER, porque cada mudança tem que gravar o evento
--               correspondente na MESMA transação. As tabelas não têm policy de
--               insert/update para `authenticated`, então este é o único caminho
--               de escrita — é o que garante que não existe mudança sem rastro.
--
-- Como DEFINER ignora a RLS, cada função de mutação revalida a visibilidade à
-- mão via fn_alerta_pode_ver(). Não dá para confiar na policy aqui.
--
-- São 3 de leitura e 3 de mutação — todas com consumidor na Fase 1. Não entra
-- fn_alerta_observar (observação em atendimento SEM alerta aberto): o schema já
-- suporta (alertas_eventos.alerta_id é nullable), mas sem tela que use seria
-- função morta. Os casos do documento original — portal indisponível,
-- autorização recusada, solicitação refeita — são comentários em alerta aberto.
-- ============================================================================

-- ── Helper de visibilidade ───────────────────────────────────────────────────
-- Espelha a policy alertas_select. Existe para as funções DEFINER não
-- duplicarem a regra em três lugares.
create or replace function public.fn_alerta_pode_ver(p_alerta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.alertas a
    where a.id = p_alerta_id
      and (
        public.fn_usuario_role() in ('admin', 'diretoria', 'autorizacao')
        or a.setor_destino  = public.fn_usuario_role()
        or a.responsavel_id = auth.uid()
      )
  );
$$;

grant execute on function public.fn_alerta_pode_ver(uuid) to authenticated;

-- ============================================================================
-- LEITURA
-- ============================================================================

-- Lista de alertas. Serve a aba Pendências e o painel do sino.
-- p_status aceita 'abertos' como atalho para (aberto, em_andamento) — é o filtro
-- que as duas telas usam por padrão, e evita o cliente montar array.
drop function if exists public.get_alertas(text, text, integer);
create or replace function public.get_alertas(
  p_modulo text    default null,
  p_status text    default 'abertos',
  p_limit  integer default 100
)
returns table (
  id             uuid,
  modulo         text,
  regra_codigo   text,
  regra_nome     text,
  origem         text,
  entidade_tipo  text,
  entidade_id    text,
  entidade_ref   jsonb,
  titulo         text,
  descricao      text,
  prioridade     text,
  status         text,
  setor_destino  text,
  criado_por     uuid,
  criado_por_nome text,
  criado_em      timestamptz,
  resolvido_em   timestamptz,
  resolucao      text,
  total_eventos  bigint
)
language sql
stable
as $$
  select
    a.id, a.modulo, a.regra_codigo, r.nome, a.origem,
    a.entidade_tipo, a.entidade_id, a.entidade_ref,
    a.titulo, a.descricao, a.prioridade, a.status, a.setor_destino,
    a.criado_por, u.nome, a.criado_em, a.resolvido_em, a.resolucao,
    (select count(*) from public.alertas_eventos e where e.alerta_id = a.id)
  from public.alertas a
  left join public.alertas_regras r on r.codigo = a.regra_codigo
  left join public.usuarios       u on u.id     = a.criado_por
  where (p_modulo is null or a.modulo = p_modulo)
    and (
      p_status is null
      or (p_status = 'abertos' and a.status in ('aberto', 'em_andamento'))
      or a.status = p_status
    )
  order by
    case a.prioridade
      when 'critica' then 0 when 'alta' then 1
      when 'media'   then 2 else 3
    end,
    a.criado_em desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

grant execute on function public.get_alertas(text, text, integer) to authenticated;

comment on function public.get_alertas(text, text, integer) is
  'Lista de alertas visíveis ao usuário (RLS aplica). p_status=''abertos'' cobre aberto+em_andamento.';

-- Contadores do badge do sino. Só agregados — nunca trazer as linhas só para
-- contar (aviso de Disk IO Budget ativo neste projeto).
-- p_modulo existe porque os contadores têm DOIS consumidores com escopos
-- diferentes: o sino é global (null = todos os módulos) e os KPIs da aba
-- Pendências são do módulo da aba. Sem o parâmetro, o KPI da aba passaria a
-- mostrar número de outros módulos assim que o segundo existisse.
drop function if exists public.get_alertas_contadores();
drop function if exists public.get_alertas_contadores(text);
create or replace function public.get_alertas_contadores(p_modulo text default null)
returns table (
  abertos          bigint,
  em_andamento     bigint,
  criticos         bigint,
  total_pendente   bigint,
  conferidas_hoje  bigint
)
language sql
stable
as $$
  select
    count(*) filter (where status = 'aberto'),
    count(*) filter (where status = 'em_andamento'),
    count(*) filter (where status <> 'resolvido' and prioridade in ('alta', 'critica')),
    count(*) filter (where status <> 'resolvido'),
    -- Registro do trabalho do dia: a Luana precisa saber que "conferiu tudo", e
    -- total_pendente=0 sozinho não distingue "fechei 12" de "nunca teve nada".
    -- Escopo em HOJE (hora local, não UTC) para não crescer indefinidamente.
    count(*) filter (
      where status = 'resolvido'
        and (resolvido_em at time zone 'America/Sao_Paulo')::date
            = (now() at time zone 'America/Sao_Paulo')::date
    )
  from public.alertas
  where p_modulo is null or modulo = p_modulo;
$$;

grant execute on function public.get_alertas_contadores(text) to authenticated;

-- Histórico cronológico da ENTIDADE, não do alerta: atravessa todos os alertas
-- que aquele atendimento já teve, incluindo eventos sem alerta. É o requisito de
-- "histórico permanente disponível para consultas futuras".
-- Os nomes de coluna created_at/status são deliberados: o componente
-- frontend/components/central/Timeline.tsx já consome esse contrato
-- ({ id, status, descricao, created_at, erro }) e assim renderiza sem alteração.
drop function if exists public.get_alerta_historico(text, text);
create or replace function public.get_alerta_historico(
  p_entidade_tipo text,
  p_entidade_id   text
)
returns table (
  id         bigint,
  alerta_id  uuid,
  status     text,
  tipo       text,
  autor_tipo text,
  autor_nome text,
  descricao  text,
  metadata   jsonb,
  created_at timestamptz,
  erro       text
)
language sql
stable
as $$
  select
    e.id,
    e.alerta_id,
    -- Mapeia tipo de evento -> status que o Timeline (components/central/Timeline.tsx)
    -- sabe colorir: concluido=check verde, erro=alerta vermelho,
    -- processando=spinner azul, pendente=relógio cinza.
    -- Para tipo='status' o mapa desce até status_novo em vez de usar 'processando'
    -- fixo: o Timeline anima o ícone quando ele é o ÚLTIMO evento, e uma transição
    -- para 'resolvido' ficaria com spinner eterno sugerindo trabalho em curso.
    case
      when e.tipo in ('encerramento', 'robo') then 'concluido'
      when e.tipo = 'deteccao'                then 'erro'
      when e.tipo = 'status' then
        case e.metadata ->> 'status_novo'
          when 'resolvido'    then 'concluido'
          when 'em_andamento' then 'processando'
          when 'aberto'       then 'erro'
          else 'pendente'
        end
      else 'pendente'
    end,
    e.tipo, e.autor_tipo, e.autor_nome, e.descricao, e.metadata, e.criado_em,
    nullif(e.metadata ->> 'erro', '')
  from public.alertas_eventos e
  where e.entidade_tipo = p_entidade_tipo
    and e.entidade_id   = p_entidade_id
  order by e.criado_em asc, e.id asc;
$$;

grant execute on function public.get_alerta_historico(text, text) to authenticated;

-- ============================================================================
-- MUTAÇÃO
-- ============================================================================

-- Criação MANUAL. origem é forçada para 'manual' aqui dentro — o cliente não
-- escolhe, então não existe alerta com origem falsificada.
-- Fase 1: só gestão do módulo cria manualmente (a recepção tem a rota, mas não
-- o botão nem a permissão nesta função).
drop function if exists public.fn_alerta_criar(text, text, text, jsonb, text, text, text, text);
create or replace function public.fn_alerta_criar(
  p_modulo        text,
  p_entidade_tipo text,
  p_entidade_id   text,
  p_entidade_ref  jsonb,
  p_titulo        text,
  p_descricao     text,
  p_setor_destino text,
  p_prioridade    text default 'alta'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := public.fn_usuario_role();
  v_uid   uuid := auth.uid();
  v_nome  text;
  v_id    uuid;
begin
  if v_role is null or v_role not in ('admin', 'diretoria', 'autorizacao') then
    raise exception 'Sem permissão para criar alerta manual (role: %)', coalesce(v_role, 'nenhum')
      using errcode = '42501';
  end if;

  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'Título é obrigatório' using errcode = '22023';
  end if;

  select nome into v_nome from public.usuarios where id = v_uid;

  insert into public.alertas (
    modulo, regra_codigo, origem, entidade_tipo, entidade_id, entidade_ref,
    titulo, descricao, prioridade, status, setor_destino, criado_por,
    fingerprint
  ) values (
    p_modulo, null, 'manual', p_entidade_tipo, p_entidade_id,
    coalesce(p_entidade_ref, '{}'::jsonb),
    trim(p_titulo), nullif(trim(coalesce(p_descricao, '')), ''),
    coalesce(p_prioridade, 'alta'), 'aberto', p_setor_destino, v_uid,
    -- Fingerprint de alerta manual inclui o id do autor e o timestamp: dois
    -- alertas manuais no MESMO atendimento são legítimos (situações diferentes),
    -- ao contrário do automático, que é único por regra+entidade.
    concat_ws('|', p_modulo, 'manual', p_entidade_id, v_uid::text, now()::text)
  )
  returning id into v_id;

  insert into public.alertas_eventos (
    alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_id, autor_nome, descricao
  ) values (
    v_id, p_entidade_tipo, p_entidade_id, 'deteccao', 'usuario', v_uid, v_nome,
    concat(coalesce(v_nome, 'Usuário'), ' criou a pendência para ', coalesce(p_setor_destino, 'sem setor'), '.')
  );

  return v_id;
end;
$$;

grant execute on function public.fn_alerta_criar(text, text, text, jsonb, text, text, text, text) to authenticated;

-- Comentário. Permitido a quem VÊ o alerta (inclui a recepção) e em qualquer
-- status — inclusive depois de resolvido, porque o histórico é a memória do caso.
drop function if exists public.fn_alerta_comentar(uuid, text);
create or replace function public.fn_alerta_comentar(
  p_alerta_id uuid,
  p_texto     text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_nome text;
  v_ent  record;
  v_id   bigint;
begin
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'Comentário vazio' using errcode = '22023';
  end if;

  if not public.fn_alerta_pode_ver(p_alerta_id) then
    raise exception 'Alerta inexistente ou sem permissão' using errcode = '42501';
  end if;

  select entidade_tipo, entidade_id into v_ent
  from public.alertas where id = p_alerta_id;

  select nome into v_nome from public.usuarios where id = v_uid;

  insert into public.alertas_eventos (
    alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_id, autor_nome, descricao
  ) values (
    p_alerta_id, v_ent.entidade_tipo, v_ent.entidade_id,
    'comentario', 'usuario', v_uid, v_nome, trim(p_texto)
  )
  returning id into v_id;

  update public.alertas set atualizado_em = now() where id = p_alerta_id;

  return v_id;
end;
$$;

grant execute on function public.fn_alerta_comentar(uuid, text) to authenticated;

-- Transição de status + evento, atômicos.
-- Recepção (e qualquer setor destinatário): aberto -> em_andamento -> resolvido.
-- Gestão: qualquer transição, incluindo reabrir.
drop function if exists public.fn_alerta_status(uuid, text, text);
create or replace function public.fn_alerta_status(
  p_alerta_id uuid,
  p_status    text,
  p_texto     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.fn_usuario_role();
  v_uid      uuid := auth.uid();
  v_gestao   boolean := v_role in ('admin', 'diretoria', 'autorizacao');
  v_nome     text;
  v_alerta   record;
begin
  if p_status not in ('aberto', 'em_andamento', 'resolvido') then
    raise exception 'Status inválido: %', p_status using errcode = '22023';
  end if;

  if not public.fn_alerta_pode_ver(p_alerta_id) then
    raise exception 'Alerta inexistente ou sem permissão' using errcode = '42501';
  end if;

  select * into v_alerta from public.alertas where id = p_alerta_id;

  if v_alerta.status = p_status then
    return; -- idempotente: clique duplo não gera evento duplicado
  end if;

  -- Reabrir é ação de gestão.
  if p_status = 'aberto' and not v_gestao then
    raise exception 'Apenas a gestão pode reabrir um alerta' using errcode = '42501';
  end if;

  -- Reabrir colidiria com o unique parcial se já houver outro alerta aberto para
  -- a mesma fingerprint. Erro explícito em vez de violação de constraint crua.
  if p_status <> 'resolvido' and v_alerta.status = 'resolvido' then
    if exists (
      select 1 from public.alertas
      where fingerprint = v_alerta.fingerprint
        and status <> 'resolvido'
        and id <> p_alerta_id
    ) then
      raise exception 'Já existe um alerta aberto para este atendimento' using errcode = '23505';
    end if;
  end if;

  select nome into v_nome from public.usuarios where id = v_uid;

  update public.alertas set
    status        = p_status,
    resolvido_em  = case when p_status = 'resolvido' then now() else null end,
    resolvido_por = case when p_status = 'resolvido' then v_uid else null end,
    resolucao     = case when p_status = 'resolvido' then 'manual' else null end,
    atualizado_em = now()
  where id = p_alerta_id;

  insert into public.alertas_eventos (
    alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_id, autor_nome,
    descricao, metadata
  ) values (
    p_alerta_id, v_alerta.entidade_tipo, v_alerta.entidade_id,
    'status', 'usuario', v_uid, v_nome,
    coalesce(
      nullif(trim(coalesce(p_texto, '')), ''),
      concat(coalesce(v_nome, 'Usuário'), ' alterou o status para ', p_status, '.')
    ),
    jsonb_build_object('status_anterior', v_alerta.status, 'status_novo', p_status)
  );
end;
$$;

grant execute on function public.fn_alerta_status(uuid, text, text) to authenticated;

-- ###########################################################################
-- 20260730100200_alertas_regra_assim_cron.sql
-- ###########################################################################

-- ============================================================================
-- Regras ASSIM: "sem desfecho operacional" e "glosa" + cron
-- ----------------------------------------------------------------------------
-- Depende de 20260730100000_create_alertas_infra.sql e …100100_alertas_rpcs.sql.
--
-- REGRA DE NEGÓCIO (definida pelo usuário):
--   Todo agendamento do TiTa NASCE pendente. Só é tratado como concluído quando
--   tem GUIA VÁLIDA ou FALTA (ou cancelamento). Portanto:
--
--     CONCLUÍDO = guia válida ∪ falta ∪ cancelamento
--     PENDENTE  = todo o resto (o complemento, não apenas 'NAO_SOLICITADA')
--
-- Isso é mais amplo do que a leitura ingênua de get_auditoria_assim. Usar
-- `situacao <> 'NAO_SOLICITADA'` como fim de pendência encerraria o alerta assim
-- que a recepção apenas ENFILEIRASSE o pedido (situacao vira 'SINCRONIZANDO'),
-- deixando o atendimento terminar o dia sem guia e sem pendência aberta — exatamente
-- a falha que este módulo existe para impedir. Também encerraria em 'GLOSA', que é
-- recusa do convênio, não desfecho.
--
-- COMO SE SABE QUE TEM GUIA VÁLIDA — duas fontes, e a primeira é a melhor:
--   1. fila_autorizacoes: no aceite, o robô grava status='concluido' +
--      numero_autorizacao=<guia> (ver robo-autorizador/rpa.js:314-319). É o sinal
--      mais cedo e mais confiável, porque não depende do match posicional.
--   2. autorizacoes_assim via get_auditoria_assim -> situacao='LIBERADA'.
--
-- get_auditoria_assim NÃO conhece fila.numero_autorizacao nem fila.status, e não
-- vamos alterá-la: ela é a RPC da aba Auditoria e precisa ficar preservada. Então a
-- fonte (1) é consultada aqui, ao lado da RPC, só para efeito de alerta.
--
-- DUAS REGRAS, DUAS CLASSES DE PENDÊNCIA:
--   pendente_sem_desfecho -> regra assim_sem_desfecho (média, tolerância 50min)
--   pendente_glosa        -> regra assim_glosa        (alta,  tolerância 0)
-- Um bloco que sai de "sem desfecho" para "glosa" fecha o primeiro alerta e abre o
-- segundo: são problemas diferentes, com ações diferentes. O histórico não se perde
-- porque a timeline (get_alerta_historico) é por ENTIDADE, não por alerta.
--
-- POR QUE NÃO TRIGGER EM autorizacoes_assim: aquela tabela é escrita por um robô
-- externo a este repositório. Um trigger ali refaria o match posicional por linha e,
-- se falhasse, travaria as escritas do robô. O cron reconcilia a cada 10 min sem
-- tocar no caminho de escrita dele.
--
-- ATENÇÃO: get_auditoria_assim passou a ser dependência de ESCRITA. Mudar o que ela
-- classifica muda quais alertas nascem e quais se encerram.
-- ============================================================================

create or replace function public.fn_alertas_avaliar_assim(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agora_local timestamp;
  v_gerados     integer := 0;
  v_encerrados  integer := 0;
  v_regras      integer;
begin
  select count(*) into v_regras
  from public.alertas_regras
  where modulo = 'assim' and ativo
    and codigo in ('assim_sem_desfecho', 'assim_glosa');

  if v_regras = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma regra assim ativa');
  end if;

  -- TIMEZONE — a armadilha desta função.
  -- O cron roda em UTC, mas hora_inicial de agenda_tita é hora de PAREDE local
  -- (America/Sao_Paulo, UTC-3). Comparar (p_data + hora_inicial) direto com now()
  -- erraria em 3 horas.
  v_agora_local := (now() at time zone 'America/Sao_Paulo');

  with
  -- Regras ativas + a classe de pendência que cada uma sustenta.
  regras as (
    select r.codigo, r.setor_destino, r.prioridade, r.tolerancia_minutos, r.nome,
           case r.codigo
             when 'assim_sem_desfecho' then 'pendente_sem_desfecho'
             when 'assim_glosa'        then 'pendente_glosa'
           end as classe_alvo
    from public.alertas_regras r
    where r.modulo = 'assim' and r.ativo
      and r.codigo in ('assim_sem_desfecho', 'assim_glosa')
  ),

  src as (
    select bloco_id, paciente_nome, hora_inicial, codigo_tuss, terapias, profissionais,
           empresa, matricula, dep, situacao, token, guia, codigo_erro, descricao_erro,
           observacao
    from public.get_auditoria_assim(p_data)
  ),

  -- Guia colhida pelo robô no momento do aceite. Agrupado porque a chave da fila
  -- (empresa/matricula/dep/tuss/horario) pode ter mais de uma linha histórica.
  fila_com_guia as (
    select f.empresa, f.matricula, f.dep, f.tuss, f.horario,
           max(f.numero_autorizacao) as numero_autorizacao
    from public.fila_autorizacoes f
    where f.data_atendimento = p_data
      and f.status = 'concluido'
      and f.numero_autorizacao is not null
    group by f.empresa, f.matricula, f.dep, f.tuss, f.horario
  ),

  -- Classifica cada bloco do dia. 'concluido' encerra; as duas classes
  -- 'pendente_*' sustentam a regra correspondente.
  avaliado as (
    select
      s.*,
      fg.numero_autorizacao as guia_fila,
      case
        -- (1) guia colhida no aceite pelo robô
        when fg.matricula is not null                then 'concluido'
        -- (2) autorizacoes_assim confirmou liberação, ou o atendimento foi cancelado
        when s.situacao in ('LIBERADA', 'CANCELADA') then 'concluido'
        -- (3) convênio respondeu recusando
        when s.situacao = 'GLOSA'                    then 'pendente_glosa'
        -- (4) NAO_SOLICITADA, SINCRONIZANDO, RETORNO_NAO_CONFIRMADO e qualquer
        --     estado futuro: nada de guia, nada de falta -> continua pendente
        else                                              'pendente_sem_desfecho'
      end as classe
    from src s
    left join fila_com_guia fg
      on  fg.empresa  = s.empresa
      and fg.matricula = s.matricula
      and fg.dep      = s.dep
      and fg.tuss     = s.codigo_tuss
      and fg.horario  = s.hora_inicial
  ),

  -- ── Passo 1: gerar ─────────────────────────────────────────────────────────
  novos as (
    insert into public.alertas (
      modulo, regra_codigo, origem, entidade_tipo, entidade_id, entidade_ref,
      titulo, descricao, prioridade, status, setor_destino, fingerprint
    )
    select
      'assim', g.codigo, 'sistema', 'atendimento', a.bloco_id,
      -- token/guia/codigo_erro entram no snapshot porque a Luana lê esses números
      -- INLINE na planilha que este módulo substitui — para contestar uma glosa ela
      -- precisa da guia recusada e do código do erro na própria linha, sem abrir
      -- detalhe. Em 'pendente_sem_desfecho' vêm nulos por definição (não há guia);
      -- em 'pendente_glosa' vêm preenchidos pelo match com autorizacoes_assim.
      jsonb_build_object(
        'paciente_nome', a.paciente_nome,
        'data',          p_data::text,
        'hora',          to_char(a.hora_inicial, 'HH24:MI'),
        'terapia',       a.terapias,
        'profissional',  a.profissionais,
        'tuss',          a.codigo_tuss,
        'token',         a.token,
        'guia',          coalesce(a.guia, a.guia_fila),
        'codigo_erro',   a.codigo_erro,
        'situacao',      a.situacao
      ),
      g.nome,
      case
        when a.classe = 'pendente_glosa' then
          concat('A ASSIM recusou a autorização de ',
                 coalesce(a.paciente_nome, 'paciente não identificado'),
                 ' às ', to_char(a.hora_inicial, 'HH24:MI'), '. ',
                 coalesce(nullif(a.codigo_erro, '') || ' - ', ''),
                 coalesce(a.descricao_erro, 'Sem descrição do erro.'))
        else
          concat('Atendimento de ', coalesce(a.paciente_nome, 'paciente não identificado'),
                 ' às ', to_char(a.hora_inicial, 'HH24:MI'),
                 ' não possui guia válida, falta registrada nem cancelamento.')
      end,
      g.prioridade, 'aberto', g.setor_destino,
      concat_ws('|', 'assim', g.codigo, a.bloco_id)
    from avaliado a
    join regras g on g.classe_alvo = a.classe
    -- Tolerância zero = alerta imediato, sem esperar a hora da sessão (glosa é
    -- resposta do convênio e pode chegar antes do atendimento acontecer).
    where g.tolerancia_minutos = 0
       or (p_data + a.hora_inicial)
          + (g.tolerancia_minutos * interval '1 minute') <= v_agora_local
    on conflict do nothing
    returning id, entidade_tipo, entidade_id, regra_codigo
  ),
  ev_novos as (
    insert into public.alertas_eventos (
      alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome, descricao
    )
    select n.id, n.entidade_tipo, n.entidade_id, 'deteccao', 'sistema', 'Sistema',
      case n.regra_codigo
        when 'assim_glosa' then 'Sistema detectou autorização recusada pela ASSIM.'
        else 'Sistema detectou atendimento sem desfecho operacional.'
      end
    from novos n
    returning 1
  ),

  -- ── Passo 2: reconciliar ────────────────────────────────────────────────────
  -- Encerra o alerta cuja condição deixou de valer. Compara contra a classe ALVO
  -- da própria regra, então cobre três transições: virou concluído, mudou de classe
  -- (sem desfecho -> glosa, ou o contrário), ou o bloco saiu da agenda (falta,
  -- cancelamento, ativo=false).
  encerraveis as (
    select a.id, a.entidade_tipo, a.entidade_id, a.regra_codigo,
           av.classe, av.situacao, av.token, av.guia, av.guia_fila
    from public.alertas a
    join regras g       on g.codigo = a.regra_codigo
    left join avaliado av on av.bloco_id = a.entidade_id
    where a.status <> 'resolvido'
      and a.entidade_ref ->> 'data' = p_data::text
      and (av.bloco_id is null or av.classe <> g.classe_alvo)
  ),
  fechados as (
    update public.alertas a set
      status        = 'resolvido',
      resolvido_em  = now(),
      resolucao     = 'automatico',
      atualizado_em = now()
    from encerraveis e
    where a.id = e.id
    returning a.id, e.entidade_tipo, e.entidade_id,
              e.classe, e.situacao, e.token, e.guia, e.guia_fila
  ),
  ev_fechados as (
    insert into public.alertas_eventos (
      alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome,
      descricao, metadata
    )
    select
      f.id, f.entidade_tipo, f.entidade_id,
      case when f.classe = 'concluido' then 'robo' else 'encerramento' end,
      case when f.classe = 'concluido' then 'robo' else 'sistema'      end,
      case when f.classe = 'concluido' then 'Robô' else 'Sistema'      end,
      -- A CLASSE decide a frase, e só depois o token/guia detalham. A ordem importa:
      -- uma linha de GLOSA também tem `guia` preenchida, então testar guia primeiro
      -- fazia um alerta reclassificado como glosa anunciar "Robô encontrou
      -- autorização" — o oposto do que aconteceu.
      case f.classe
        when 'concluido' then
          case
            when coalesce(f.token, '') <> '' then
              concat('Robô encontrou autorização. Token ', f.token,
                     case when f.guia is not null then concat(' · Guia ', f.guia) else '' end)
            when coalesce(f.guia, f.guia_fila) is not null then
              concat('Robô encontrou autorização. Guia ', coalesce(f.guia, f.guia_fila))
            else 'Guia válida registrada para o atendimento.'
          end
        when 'pendente_glosa'        then 'A ASSIM respondeu recusando. Reclassificado como glosa.'
        when 'pendente_sem_desfecho' then 'Atendimento voltou a ficar sem guia válida.'
        else 'Atendimento saiu da lista de pendências (falta, cancelamento ou sessão removida da agenda).'
      end,
      jsonb_build_object(
        'classe',   f.classe,
        'situacao', f.situacao,
        'token',    f.token,
        'guia',     coalesce(f.guia, f.guia_fila),
        'motivo',   case when f.classe is null then 'fora_da_agenda' else f.classe end
      )
    from fechados f
    returning 1
  )
  select
    (select count(*) from ev_novos),
    (select count(*) from ev_fechados)
  into v_gerados, v_encerrados;

  return jsonb_build_object(
    'ok',         true,
    'data',       p_data,
    'gerados',    v_gerados,
    'encerrados', v_encerrados
  );
end;
$$;

grant execute on function public.fn_alertas_avaliar_assim(date) to authenticated;

comment on function public.fn_alertas_avaliar_assim(date) is
  'Gera e encerra alertas ASSIM para uma data. Concluído = guia válida (fila.numero_autorizacao ou situacao LIBERADA) ∪ falta ∪ cancelamento; pendente é o complemento. Idempotente. Chamada pelo cron alertas-assim-avaliar.';

-- ── Cron ─────────────────────────────────────────────────────────────────────
-- A cada 10 min no horário de operação. A clínica atende 08:00–17:40 BRT, que em
-- UTC é 11:00–20:40; estendo até 22:00 UTC para pegar desfecho que chega no fim
-- do dia. Seg–Sex. Janela de 3 dias para pegar desfecho tardio.
--
-- Chamada plpgsql direta, não net.http_post para edge function como os outros
-- crons deste repo: não há nada de rede a fazer aqui, e evita a dependência do
-- token de service role no Vault.
do $$
begin
  perform cron.unschedule('alertas-assim-avaliar');
exception
  when others then null; -- não existia ainda
end $$;

select cron.schedule(
  'alertas-assim-avaliar',
  '*/10 11-22 * * 1-5',
  $cron$
  select public.fn_alertas_avaliar_assim(d::date)
  from generate_series(
    (now() at time zone 'America/Sao_Paulo')::date - 2,
    (now() at time zone 'America/Sao_Paulo')::date,
    interval '1 day'
  ) d;
  $cron$
);


update public.alertas_regras set ativo = false where modulo = 'assim';

COMMIT;

