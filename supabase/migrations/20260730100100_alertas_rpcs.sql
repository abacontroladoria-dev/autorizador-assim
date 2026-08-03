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
