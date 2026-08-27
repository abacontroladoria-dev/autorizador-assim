-- =============================================================================
-- Reclassificação manual de situação — ETAPA 1 (a camada, e ela é INERTE)
-- =============================================================================
--
-- O PROBLEMA
-- A `situacao` de uma sessão é derivada: sai do CASE de
-- get_auditoria_assim_periodo a partir do que a ASSIM devolveu e do que a fila
-- registrou. Quando essa derivação erra, não há como corrigi-la — e ela erra em
-- casos que a operação conhece de cor:
--
--   * a sessão foi GLOSADA, mas o paciente na verdade FALTOU. A recusa da ASSIM
--     é verdadeira e continua no banco; o que é falso é a conclusão de que há
--     uma pendência de faturamento a tratar. Não há: ninguém foi atendido.
--   * a sessão consta NAO_SOLICITADA porque a solicitação nunca saiu, mas o
--     terapeuta faltou e não havia o que solicitar.
--
-- Hoje essas linhas ficam para sempre no card de Glosas — que é o número que a
-- operação usa para dimensionar trabalho — e o alerta `assim_glosa` continua
-- aberto apontando um atendimento que não aconteceu.
--
-- ISTO NÃO É MAQUIAGEM, E ESSA É A DECISÃO CENTRAL
-- A reclassificação NÃO é um rótulo de tela por cima do dado. Ela entra na
-- própria `situacao` que a RPC devolve, e por isso atravessa tudo que lê a RPC:
--
--   * os KPIs da Conferência (kpisAuditoria.ts soma sobre `situacao`);
--   * o resumo diário do cron, e portanto a visão gerencial do mês
--     (20260824050000 grava a `situacao` CRUA que a RPC devolve);
--   * `fn_alertas_avaliar_assim`, que é onde "pendência de faturamento" de fato
--     mora neste sistema — o laço de reconciliação daquela função encerra o
--     alerta sozinho quando a classe muda (ver 20260827000002).
--
-- Uma glosa reclassificada como falta sai do card de Glosas, sai do resumo do
-- mês como glosa, e fecha o alerta. É o que a Etapa 3 do vínculo já fez para
-- GLOSA_RESOLVIDA; aqui o gatilho é a decisão de uma pessoa em vez de uma guia.
--
-- O QUE CONTINUA VERDADEIRO DEPOIS DA RECLASSIFICAÇÃO
-- Nada é apagado. `fila_autorizacoes` e `autorizacoes_assim` não são tocadas —
-- pelas MESMAS três razões de 20260821000000: a segunda é escrita por um robô
-- fora deste repositório, escrever na primeira já causou reautorização dupla
-- ("1601-REINCIDENCIA"), e precisamos de autoria e de desfazer. A glosa original
-- continua no banco, continua visível no detalhamento da linha, e volta inteira
-- se a reclassificação for desfeita.
--
-- O QUE ESTA MIGRATION FAZ
-- Cria a tabela e as RPCs. NADA passa a consumi-la: get_auditoria_assim_periodo
-- não é tocada aqui (20260827000001) nem fn_alertas_avaliar_assim
-- (20260827000002). Depois desta migration o sistema se comporta exatamente como
-- antes. As três precisam ser aplicadas na mesma janela — ver a nota no fim.
-- =============================================================================


-- =============================================================================
-- 1. A tabela
-- =============================================================================

create table if not exists public.auditoria_situacao_overrides (
  id uuid primary key default gen_random_uuid(),

  -- A sessão reclassificada. Mesma referência e mesma limitação de
  -- autorizacoes_vinculos.bloco_id: não existe tabela de blocos, o id é o
  -- derivado `pacienteId_YYYY-MM-DD_TUSS_HH:MM:SS` montado pela RPC. A
  -- integridade vive nas validações de reclassificar_situacao(), não numa FK.
  bloco_id text not null,

  -- A situação que a RPC devolvia no instante da reclassificação, congelada.
  --
  -- Congelada de propósito, e não relida na hora de exibir: é o "de" do log, e
  -- ele tem de continuar dizendo o que a pessoa viu quando decidiu. A derivação
  -- pode mudar depois (o relatório da ASSIM chega, o robô conclui a linha) e
  -- nesse caso o `de` relido contaria outra história — a de agora, não a da
  -- decisão. `guia_original` em autorizacoes_vinculos é congelada pelo mesmo
  -- motivo.
  situacao_anterior text not null,

  -- A situação que passa a valer. Restrita ao conjunto seguro — ver a constraint
  -- e a nota que a acompanha.
  situacao_nova text not null,

  -- Obrigatória. Uma reclassificação sem porquê é indistinguível de um erro de
  -- clique seis meses depois, e este dado muda o número que a clínica usa para
  -- contestar recusa junto ao convênio.
  justificativa text not null,

  reclassificado_por    text not null,
  reclassificado_por_id uuid,
  reclassificado_em     timestamptz not null default now(),

  -- Desfazer é soft, como em autorizacoes_vinculos: uma reclassificação errada
  -- tem de deixar rastro. Desfeita, a linha volta a valer a derivação original.
  desfeito_por    text,
  desfeito_por_id uuid,
  desfeito_em     timestamptz,
  desfeito_motivo text,

  -- ── O conjunto seguro de destinos ────────────────────────────────────────
  -- LIBERADA está deliberadamente FORA. Marcar uma sessão como liberada é
  -- afirmar que o convênio autorizou aquele atendimento, e a única evidência
  -- que sustenta isso é uma guia. Existe caminho para isso e ele já é este
  -- repositório: a aba Reconciliação, que vincula uma guia REAL da ASSIM à
  -- sessão (vincular_autorizacao). Deixar LIBERADA aqui daria uma porta para
  -- afirmar cobertura sem guia nenhuma — o faturamento cobraria por um
  -- atendimento que o convênio nunca autorizou.
  --
  -- GLOSA_RESOLVIDA está fora pela mesma razão: é o desfecho do vínculo, e só
  -- uma guia o produz.
  --
  -- Os quatro que sobram descrevem o que aconteceu na clínica, e é justamente
  -- disso que a derivação automática não sabe nada: quem faltou (paciente ou
  -- terapeuta), o que foi cancelado, e o que segue por solicitar.
  constraint auditoria_situacao_overrides_nova_ck
    check (situacao_nova in ('FALTA', 'FALTA_TERAPEUTA', 'CANCELADA', 'NAO_SOLICITADA')),

  -- Reclassificar para a mesma coisa é ruído no log e uma linha que não faz
  -- nada. O erro é do chamador, e é melhor ele estourar do que passar.
  constraint auditoria_situacao_overrides_muda_ck
    check (situacao_nova is distinct from situacao_anterior)
);

comment on table public.auditoria_situacao_overrides is
  'Reclassificação manual da situação de uma sessão na Conferência ASSIM (ex.: glosa que na verdade foi falta). Aditiva e reversível; não altera fila_autorizacoes nem autorizacoes_assim. Consumida por get_auditoria_assim_periodo, e portanto pelos KPIs, pelo resumo diário e pelos alertas.';
comment on column public.auditoria_situacao_overrides.bloco_id is
  'Sessão reclassificada. Formato pacienteId_YYYY-MM-DD_TUSS_HH:MM:SS, igual ao bloco_id de get_auditoria_assim_periodo.';
comment on column public.auditoria_situacao_overrides.situacao_anterior is
  'A situação derivada no instante da decisão, congelada. É o "de" do log — relê-la depois contaria outra história.';
comment on column public.auditoria_situacao_overrides.justificativa is
  'Obrigatória. Este dado muda o número que a clínica usa para contestar recusa; sem porquê a linha é indistinguível de um erro de clique.';

-- Uma sessão tem no máximo uma reclassificação ativa. Mesma forma do
-- autorizacoes_vinculos_bloco_ativo_uq.
create unique index if not exists auditoria_situacao_overrides_bloco_ativo_uq
  on public.auditoria_situacao_overrides (bloco_id)
  where desfeito_em is null;

-- O JOIN da RPC é por bloco_id entre as ativas; o unique parcial acima já o
-- serve. Este cobre o histórico (a listagem do log de uma sessão, que inclui as
-- desfeitas).
create index if not exists auditoria_situacao_overrides_bloco_idx
  on public.auditoria_situacao_overrides (bloco_id);

alter table public.auditoria_situacao_overrides enable row level security;

-- Leitura para qualquer autenticado — a Conferência inteira já é assim, e o log
-- só faz sentido se quem lê a linha consegue ler por que ela está daquele jeito.
-- Escrita NÃO tem policy, de propósito: só entra pelas RPCs SECURITY DEFINER
-- abaixo, que é onde a permissão e as validações vivem. Um INSERT direto do
-- cliente falha, e é isso que queremos.
drop policy if exists "auditoria_situacao_overrides_select" on public.auditoria_situacao_overrides;
create policy "auditoria_situacao_overrides_select" on public.auditoria_situacao_overrides
  for select to authenticated using (true);

-- O default do Supabase dá INSERT/UPDATE/DELETE a `anon` em toda tabela nova do
-- schema public. A RLS já barra, mas privilégio que ninguém usa é privilégio a
-- menos para auditar. O SELECT não volta: `bloco_id` embute o paciente_id.
revoke all on public.auditoria_situacao_overrides from anon;


-- =============================================================================
-- 2. reclassificar_situacao — a escrita
-- =============================================================================
-- Toda validação vive AQUI, não no frontend, pelo mesmo motivo de
-- vincular_autorizacao: a reclassificação muda o que o faturamento considera
-- pendente, então errar aqui é errar dinheiro.
--
-- QUEM PODE
-- `admin` e `autorizacao`. Mais estreito que as RPCs do vínculo, que incluem
-- `recepcao`: vincular guia é apontar uma evidência que existe na ASSIM e é
-- conferível; reclassificar é sobrepor um julgamento à evidência. Quem responde
-- por isso é o setor de Autorização.
create or replace function public.reclassificar_situacao(
  p_bloco_id      text,
  p_situacao_nova text,
  p_justificativa text
)
returns uuid
language plpgsql
security definer
set search_path = public
-- A validação (3) chama get_auditoria_assim_periodo de UM dia, que é a chamada
-- que sempre respondeu (a de sete dias é que estoura — 20260821000000:158-162).
-- O teto existe para o dia patológico não pendurar a tela.
set statement_timeout = '55s'
as $$
declare
  v_role  text := public.fn_usuario_role();
  v_uid   uuid := auth.uid();
  v_nome  text;
  v_data  date;
  v_atual text;
  v_id    uuid;
begin
  if v_role is null or v_role not in ('admin', 'autorizacao') then
    raise exception 'Sem permissão para reclassificar situações'
      using errcode = '42501';
  end if;
  select nome into v_nome from public.usuarios where id = v_uid;

  -- 1) justificativa de verdade. O NOT NULL da coluna não basta: string vazia e
  --    um espaço passariam por ele, e é exatamente o que um formulário manda
  --    quando o campo não foi preenchido.
  if nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    raise exception 'Justificativa é obrigatória para reclassificar uma situação'
      using errcode = '22023';
  end if;
  if length(btrim(p_justificativa)) < 10 then
    raise exception 'Justificativa muito curta (mínimo 10 caracteres) — descreva o que de fato aconteceu'
      using errcode = '22023';
  end if;

  -- 2) destino dentro do conjunto seguro. A constraint da tabela já garante,
  --    mas o erro dela é ilegível para quem está na tela; este diz o que fazer.
  if p_situacao_nova not in ('FALTA', 'FALTA_TERAPEUTA', 'CANCELADA', 'NAO_SOLICITADA') then
    raise exception 'Situação de destino inválida: %. Permitidas: FALTA, FALTA_TERAPEUTA, CANCELADA, NAO_SOLICITADA. Para afirmar cobertura use a aba Reconciliação, que exige uma guia real.',
      coalesce(p_situacao_nova, '(nulo)') using errcode = '22023';
  end if;

  -- 3) o bloco existe de fato, e qual é a situação que ele mostra HOJE.
  --    O dia sai do próprio bloco_id (`pacienteId_YYYY-MM-DD_TUSS_HH:MM:SS`),
  --    que é o que permite chamar a RPC de um dia só em vez de varrer período.
  begin
    v_data := split_part(p_bloco_id, '_', 2)::date;
  exception when others then
    raise exception 'bloco_id malformado: % (esperado pacienteId_YYYY-MM-DD_TUSS_HH:MM:SS)', p_bloco_id
      using errcode = '22023';
  end;

  select a.situacao into v_atual
  from public.get_auditoria_assim_periodo(v_data, v_data) a
  where a.bloco_id = p_bloco_id;

  if not found then
    raise exception 'Sessão % não existe na Conferência de % (sessão inativa, reagendada ou fora do recorte ASSIM)',
      p_bloco_id, v_data using errcode = 'P0002';
  end if;

  -- 4) não reclassificar para o que já é. Sem esta guarda a constraint estouraria
  --    com uma mensagem que ninguém entende.
  if v_atual = p_situacao_nova then
    raise exception 'Sessão % já está como %', p_bloco_id, p_situacao_nova
      using errcode = '22023';
  end if;

  -- 5) uma sessão coberta por vínculo não se reclassifica.
  --    A ordem entre as duas camadas é decidida AQUI, na escrita, e não na
  --    leitura: o vínculo aponta uma guia real da ASSIM cobrindo aquele
  --    atendimento, e dizer "faltou" sobre uma sessão que o convênio autorizou e
  --    vai pagar é uma contradição, não uma correção. Se a guia estiver errada,
  --    o caminho é desfazer o vínculo primeiro — e aí esta porta abre.
  if exists (
    select 1 from public.autorizacoes_vinculos v
    where v.bloco_id = p_bloco_id and v.desfeito_em is null and v.tipo = 'vinculo'
  ) then
    raise exception 'Sessão % está coberta por uma guia vinculada. Desfaça o vínculo antes de reclassificar.',
      p_bloco_id using errcode = '22023';
  end if;

  -- 6) uma reclassificação ativa por sessão
  if exists (
    select 1 from public.auditoria_situacao_overrides o
    where o.bloco_id = p_bloco_id and o.desfeito_em is null
  ) then
    raise exception 'Sessão % já foi reclassificada. Desfaça a reclassificação atual antes de refazer.',
      p_bloco_id using errcode = '23505';
  end if;

  insert into public.auditoria_situacao_overrides
    (bloco_id, situacao_anterior, situacao_nova, justificativa,
     reclassificado_por, reclassificado_por_id)
  values
    (p_bloco_id, v_atual, p_situacao_nova, btrim(p_justificativa),
     coalesce(v_nome, 'Usuário'), v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.reclassificar_situacao(text, text, text) is
  'Reclassifica a situação de uma sessão da Conferência ASSIM (ex.: glosa que foi falta). Exige papel admin/autorizacao e justificativa. Valida contra a situação atual da RPC; recusa sessão coberta por vínculo. Não escreve em fila_autorizacoes nem em autorizacoes_assim.';


-- =============================================================================
-- 3. desfazer_reclassificacao — desfazer, sem apagar
-- =============================================================================
create or replace function public.desfazer_reclassificacao(
  p_override_id uuid,
  p_motivo      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.fn_usuario_role();
  v_uid  uuid := auth.uid();
  v_nome text;
begin
  if v_role is null or v_role not in ('admin', 'autorizacao') then
    raise exception 'Sem permissão para desfazer reclassificações' using errcode = '42501';
  end if;
  select nome into v_nome from public.usuarios where id = v_uid;

  update public.auditoria_situacao_overrides set
    desfeito_por    = coalesce(v_nome, 'Usuário'),
    desfeito_por_id = v_uid,
    desfeito_em     = now(),
    desfeito_motivo = nullif(btrim(p_motivo), '')
  where id = p_override_id
    and desfeito_em is null;

  if not found then
    raise exception 'Reclassificação % não existe ou já foi desfeita', p_override_id
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.desfazer_reclassificacao(uuid, text) is
  'Desfaz uma reclassificação por soft delete, preservando autoria e motivo. A sessão volta a valer a situação derivada pela RPC.';


-- =============================================================================
-- 4. get_reclassificacoes_bloco — o log de uma sessão
-- =============================================================================
-- O histórico COMPLETO, desfeitas inclusive, e é isso que o torna um log em vez
-- de um estado. A ativa a tela já recebe pela própria RPC da Conferência; o que
-- só existe aqui é a sequência — quem reclassificou, quem desfez, e por quê.
create or replace function public.get_reclassificacoes_bloco(p_bloco_id text)
returns table (
  id                    uuid,
  bloco_id              text,
  situacao_anterior     text,
  situacao_nova         text,
  justificativa         text,
  reclassificado_por    text,
  reclassificado_em     timestamptz,
  desfeito_por          text,
  desfeito_em           timestamptz,
  desfeito_motivo       text
)
language sql
stable
security invoker
set search_path = public
as $$
  select o.id, o.bloco_id, o.situacao_anterior, o.situacao_nova, o.justificativa,
         o.reclassificado_por, o.reclassificado_em,
         o.desfeito_por, o.desfeito_em, o.desfeito_motivo
  from public.auditoria_situacao_overrides o
  where o.bloco_id = p_bloco_id
  order by o.reclassificado_em desc
$$;

comment on function public.get_reclassificacoes_bloco(text) is
  'Histórico completo de reclassificações de uma sessão, desfeitas inclusive. A ativa já vem na própria RPC da Conferência; aqui está a sequência.';


-- =============================================================================
-- 5. Grants — explícitos, nunca a PUBLIC
-- =============================================================================
-- O GRANT EXECUTE implícito a PUBLIC é a causa-raiz de 47 dos 55 avisos de
-- advisor deste projeto. O padrão certo é revogar e conceder por role.
revoke all on function public.reclassificar_situacao(text, text, text)   from public;
revoke all on function public.desfazer_reclassificacao(uuid, text)       from public;
revoke all on function public.get_reclassificacoes_bloco(text)           from public;

grant execute on function public.reclassificar_situacao(text, text, text) to authenticated;
grant execute on function public.desfazer_reclassificacao(uuid, text)     to authenticated;
grant execute on function public.get_reclassificacoes_bloco(text)         to authenticated;


-- =============================================================================
-- APLICAR AS TRÊS NA MESMA JANELA
-- =============================================================================
-- 20260827000000 (esta)  cria a camada, inerte.
-- 20260827000001         faz get_auditoria_assim_periodo consumi-la.
-- 20260827000002         faz fn_alertas_avaliar_assim encerrar o alerta.
--
-- Sem a 000002, uma sessão reclassificada como FALTA sai de GLOSA e cai no ramo
-- `fd.tem_glosa` do CASE de classe — o alerta não fecha: ele CONTINUA aberto
-- como pendente_glosa enquanto a tela diz "Falta". É a mesma armadilha que
-- 20260821050000 documenta para GLOSA_RESOLVIDA, e pela mesma razão: a linha da
-- fila segue em status='glosa', e é assim que tem de ser — o histórico não se
-- apaga.
-- =============================================================================
