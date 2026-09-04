-- =============================================================================
-- APLICAR NO SQL EDITOR — as sessões livres, separadas por unidade
-- 2026-09-04
-- =============================================================================
--
-- POR QUE
-- O atendente virtual oferecia horário de unidade errada. A unidade física não
-- existe como dado na grade do TiTa: unidade_id é 280 e unidade_nome é 'CLÍNICA
-- UNIVERSO ABA' em TODAS as linhas. As três unidades só existem como PREFIXO de
-- sala_nome ('Unid. Realengo - Sala 20'), e eram separadas por regex em
-- TypeScript DEPOIS de o banco responder.
--
-- Isso tinha duas consequências:
--
--   1. O filtro por unidade acontecia sobre as no máximo 500 linhas que a RPC
--      devolvia, ordenadas por (data, hora, profissional). Como 500 é o teto da
--      própria RPC, era um filtro com limite que não se podia aumentar: basta a
--      grade crescer para que nenhuma vaga de Padre Miguel caia nas 500
--      primeiras e a resposta vire "não temos vaga em Padre Miguel" — falso
--      negativo silencioso.
--
--   2. As salas que não são endereço da clínica ('AT Externo Escola', 'AT
--      Externo Casa', 'Consulta 4/6 - Nutrição', 'Especialista Técnico de Área')
--      eram OFERECIDAS quando não havia filtro de unidade. Só 'Sala Teste' era
--      oculta, e por igualdade exata em lowercase — 'Sala Teste 2' passaria.
--
-- Nota importante sobre a causa do incidente: o system_prompt em produção
-- mandava o modelo IGNORAR o parâmetro `unidade` e filtrar de cabeça olhando
-- `sala`. Isso é dado, não schema, e é corrigido por
-- 20260904_central_prompt_unidade_por_parametro.sql — provavelmente é o conserto
-- que resolve o sintoma. Este arquivo conserta a estrutura, que estava errada
-- de todo modo.
--
-- O QUE MUDA
--   20260904100000  central.vw_vagas_livres — view nova. Sessões livres com a
--                   coluna `unidade` derivada do prefixo de sala_nome, e sem as
--                   salas que não são endereço da clínica (excluídas pelo NULL
--                   do de-para, não por lista negra). ADITIVA: ninguém a lê
--                   ainda quando ela entra.
--   20260904100100  central.listar_vagas_disponiveis — p_unidade_id bigint
--                   (que nunca filtrou nada) sai, p_unidade text entra, e passa
--                   a filtrar no banco. Valor desconhecido LANÇA 22023 em vez
--                   de não filtrar. Retorno ADITIVO: as 11 colunas de antes,
--                   mais `unidade` e `e_sala_numerada` no fim.
--   20260904100200  central.contar_vagas_por_terapia_e_unidade — nova. O resumo
--                   "quais especialidades vocês têm?" passa a ser agregação com
--                   group by em vez de contagem sobre 500 linhas de amostra.
--
-- ⚠ QUEBRA O FRONTEND ATUAL — APLICAR JUNTO DO DEPLOY
-- O bloco 2 dropa e recria listar_vagas_disponiveis com assinatura nova. Entre
-- este arquivo e o deploy, /api/central/appointments/availability chama com
-- p_unidade_id e recebe PGRST202 ("function not found"): a tela de Agendamentos
-- e o agente param de listar vaga. Aplicar fora do horário de atendimento, com
-- o deploy pronto para subir.
--
-- ANTES DE APLICAR
-- Rodar 20260904_diagnostico_reservas_em_sala_nao_fisica.sql (só leitura). Se
-- `total_reservas_nao_fisicas > 0`, alguém já reservou em sala não-física pela
-- Central, e appointment.service.ts:137 precisa parar de usar listarVagas para
-- resolver metadados de slot — senão o operador verá "essa vaga já foi
-- reservada" sobre uma vaga livre.
--
-- DEPOIS DE APLICAR
-- Rodar 20260904_contraprova_vagas_livres_por_unidade.sql (7 blocos, cada um
-- lança em vez de devolver linha). O bloco 2 é o que detecta mudança de grafia
-- na origem — se falhar, PARE e investigue o vocabulário de sala_nome.
-- =============================================================================

begin;

-- =============================================================================
-- BLOCO 1 — central.vw_vagas_livres (20260904100000)
-- =============================================================================

create or replace view central.vw_vagas_livres
with (security_invoker = true) as
select
  g.data,
  g.dia_semana,
  g.hora_inicial,
  g.hora_final,
  g.profissional_id,
  g.profissional_nome,
  g.terapia_id,
  g.terapia_nome,
  g.sala_nome,
  -- A unidade física. De-para por PREFIXO, não captura por regex: um prefixo
  -- desconhecido precisa virar NULL (visível, sai da view) em vez de casar por
  -- acidente com uma das três. E como não lemos o número da sala, o padding
  -- inconsistente da origem ('Sala 1' e 'Sala 09' coexistem) e os sufixos
  -- parentéticos de caixa variável ('Coordenação de Caso' e 'Coordenação de
  -- caso' coexistem) deixam de ser problema nosso.
  case
    when g.sala_nome like 'Unid. Realengo - %'     then 'Realengo'
    when g.sala_nome like 'Unid. Fazendinha - %'   then 'Fazendinha'
    when g.sala_nome like 'Unid. Padre Miguel - %' then 'Padre Miguel'
  end::text as unidade,
  -- Distingue sala física numerada de papel ('Unid. Fazendinha - Aplicador
  -- Suporte', 'Unid. Padre Miguel - Visita Guiada'). Os papéis ENTRAM na view:
  -- têm o prefixo, logo afirmam o endereço. Excluí-los exigiria allowlist de
  -- papéis, e a lista que envelhece faz a vaga sair da oferta em silêncio.
  (g.sala_nome ~ '^Unid\. [^-]+ - Sala \d+') as e_sala_numerada,
  -- Mantidos por rastreabilidade: são o valor único (280 / 'CLÍNICA UNIVERSO
  -- ABA') e ficam para que quem inspecionar VEJA que não distinguem nada.
  g.unidade_id,
  g.unidade_nome
from public.vw_grade_base g
where g.status_agendamento = 'Livre'
  and g.profissional_id is not null
  and g.hora_inicial     is not null
  -- Os três prefixos, repetidos porque um alias do SELECT não é referenciável
  -- no WHERE em Postgres. Quem editar precisa mexer nos dois lugares — o bloco
  -- 1 da contraprova falha se divergirem.
  --
  -- Este WHERE é também o que remove 'Sala Teste', 'AT Externo Escola', 'AT
  -- Externo Casa', 'Especialista Técnico de Área' e 'Consulta 4/6 - Nutrição':
  -- nenhuma tem o prefixo. Sem lista negra, então uma sala não-física nova sai
  -- da oferta sozinha.
  and (   g.sala_nome like 'Unid. Realengo - %'
       or g.sala_nome like 'Unid. Fazendinha - %'
       or g.sala_nome like 'Unid. Padre Miguel - %');

comment on view central.vw_vagas_livres is
  'As sessões livres da grade, com a unidade física (Realengo / Fazendinha / Padre Miguel) DERIVADA do prefixo de sala_nome. Derivada porque não existe como dado: unidade_id é 280 e unidade_nome é CLÍNICA UNIVERSO ABA em toda linha da grade — passá-los como filtro não filtra nada. Exclui o que não tem prefixo Unid. (Sala Teste, AT Externo Escola/Casa, Especialista Técnico de Área, Consulta 4/6 - Nutrição): não são endereço da clínica e não podem ser oferecidos como se fossem. NÃO subtrai appointments nem descarta o passado — isso é central.listar_vagas_disponiveis.';

-- security_invoker acima é o que mantém a RLS do chamador valendo. A grade
-- carrega nome de paciente e a chave anon está embutida no JS do navegador.
grant select on central.vw_vagas_livres to authenticated, service_role;
revoke all  on central.vw_vagas_livres from anon;

-- =============================================================================
-- BLOCO 2 — central.listar_vagas_disponiveis (20260904100100)
--
-- O DROP NÃO É LIMPEZA, É REQUISITO: Postgres não troca o tipo de um parâmetro
-- com create or replace — criaria uma SEGUNDA função sobrecarregada. Como todos
-- os parâmetros têm default, uma chamada nomeada parcial ficaria ambígua e o
-- PostgREST responderia PGRST203 a TODA consulta de disponibilidade.
--
-- E o DROP apaga os grants. O grant no fim deste bloco é obrigatório.
-- =============================================================================

drop function if exists central.listar_vagas_disponiveis(
  date, date, bigint, bigint, bigint, integer
);

create or replace function central.listar_vagas_disponiveis(
  p_data_inicio     date    default null,
  p_data_fim        date    default null,
  p_terapia_id      bigint  default null,
  p_profissional_id bigint  default null,
  p_unidade         text    default null,
  p_limite          integer default 50
)
returns table (
  -- As 11 originais na mesma ordem (returns table é posicional para alguns
  -- clientes); as duas novas no FIM.
  data              date,
  dia_semana        text,
  hora_inicial      time,
  hora_final        time,
  profissional_id   bigint,
  profissional_nome text,
  terapia_id        bigint,
  terapia_nome      text,
  unidade_id        bigint,
  unidade_nome      text,
  sala_nome         text,
  unidade           text,
  e_sala_numerada   boolean
)
language plpgsql
stable
set search_path = public, central
as $$
declare
  v_agora  timestamp := now() at time zone 'America/Sao_Paulo';
  v_inicio date;
  v_fim    date;
begin
  -- Falha alta em unidade desconhecida. p_unidade => 'Realango' que
  -- silenciosamente não filtra devolve as três unidades misturadas: o bug
  -- original reintroduzido por um typo. O errcode 22023 chega ao PostgREST como
  -- 400, não 500 — quem errou foi o chamador.
  if p_unidade is not null
     and p_unidade not in ('Realengo', 'Fazendinha', 'Padre Miguel') then
    raise exception
      'p_unidade inválida: %. Valores aceitos: Realengo, Fazendinha, Padre Miguel.',
      p_unidade
      using errcode = '22023';
  end if;

  v_inicio := coalesce(p_data_inicio, v_agora::date);
  v_fim    := coalesce(p_data_fim,    v_agora::date + 30);

  return query
  select
    v.data, v.dia_semana, v.hora_inicial, v.hora_final,
    v.profissional_id, v.profissional_nome,
    v.terapia_id, v.terapia_nome,
    v.unidade_id, v.unidade_nome, v.sala_nome,
    v.unidade, v.e_sala_numerada
  from central.vw_vagas_livres v
  where v.data >= v_inicio
    and v.data <= v_fim
    -- No dia corrente a comparação é por HORA: às 14h não se oferece a vaga das
    -- 09h20.
    and (v.data > v_agora::date or v.hora_inicial > v_agora::time)
    and (p_terapia_id      is null or v.terapia_id      = p_terapia_id)
    and (p_profissional_id is null or v.profissional_id = p_profissional_id)
    -- O filtro que motivou esta migration: aqui, o teto de 500 abaixo vale POR
    -- UNIDADE.
    and (p_unidade         is null or v.unidade         = p_unidade)
    -- A vaga não pode já ter sido prometida por nós. Continua aqui, e não na
    -- view, para que a regra de "vaga prometida" tenha um lugar só.
    and not exists (
      select 1
      from central.appointments ap
      where ap.profissional_id = v.profissional_id
        and ap.date            = v.data
        and ap.time            = v.hora_inicial
        and ap.status in ('scheduled', 'confirmed')
    )
  order by v.data, v.hora_inicial, v.profissional_nome
  limit greatest(1, least(coalesce(p_limite, 50), 500));
end;
$$;

comment on function central.listar_vagas_disponiveis(date, date, bigint, bigint, text, integer) is
  'Vagas ofertáveis: central.vw_vagas_livres (grade Livre, unidade física derivada, sem sala não-física) menos as vagas já prometidas em central.appointments, menos o passado. p_unidade filtra NO BANCO, para o teto de 500 valer por unidade e não globalmente — antes o filtro era em TypeScript sobre a lista já truncada, e uma unidade que não caísse nas 500 primeiras linhas virava "não temos vaga" falso. p_unidade inválida LANÇA (22023) em vez de não filtrar. Fonte única para a página de Agendamentos e para o agente de WhatsApp.';

grant execute on function central.listar_vagas_disponiveis(date, date, bigint, bigint, text, integer)
  to authenticated, service_role;

-- central.vaga_esta_disponivel NÃO muda, e isso é decisão: ela continua lendo
-- public.vw_grade_base, então aprova vaga em sala não-física ('AT Externo
-- Escola'). Se lesse a view nova, toda reserva de atendimento externo viraria
-- SlotNotInGradeError sem ninguém ter decidido isso. Ver 20260904100100.

-- =============================================================================
-- BLOCO 3 — central.contar_vagas_por_terapia_e_unidade (20260904100200)
--
-- O resumo por especialidade era montado em memória sobre as 500 primeiras
-- linhas da janela. O efeito era pior que contagem imprecisa: uma terapia com
-- vaga em Padre Miguel só a partir da linha 501 aparecia como
-- unidades = ['Realengo'], e o agente afirmava "temos fono, mas só em
-- Realengo". Um group by não precisa de teto de linhas.
-- =============================================================================

create or replace function central.contar_vagas_por_terapia_e_unidade(
  p_data_inicio date default null,
  p_data_fim    date default null
)
returns table (
  terapia_id   bigint,
  terapia_nome text,
  unidade      text,
  vagas        bigint
)
language plpgsql
stable
set search_path = public, central
as $$
declare
  v_agora  timestamp := now() at time zone 'America/Sao_Paulo';
  v_inicio date;
  v_fim    date;
begin
  v_inicio := coalesce(p_data_inicio, v_agora::date);
  v_fim    := coalesce(p_data_fim,    v_agora::date + 30);

  return query
  select
    v.terapia_id,
    -- O nome pode vir como lista ("Aplicador ABA (PS), Psicopedagogia") quando o
    -- profissional atende mais de uma especialidade naquele horário. É texto de
    -- exibição; só o id é chave confiável — daí o group by pelo id e o nome por
    -- min(), senão a mesma terapia se parte por variação de grafia.
    min(v.terapia_nome)  as terapia_nome,
    v.unidade,
    count(*)             as vagas
  from central.vw_vagas_livres v
  where v.data >= v_inicio
    and v.data <= v_fim
    and (v.data > v_agora::date or v.hora_inicial > v_agora::time)
    and v.terapia_id is not null
    and not exists (
      select 1
      from central.appointments ap
      where ap.profissional_id = v.profissional_id
        and ap.date            = v.data
        and ap.time            = v.hora_inicial
        and ap.status in ('scheduled', 'confirmed')
    )
  group by v.terapia_id, v.unidade
  order by count(*) desc, v.terapia_id, v.unidade;
end;
$$;

comment on function central.contar_vagas_por_terapia_e_unidade(date, date) is
  'Quantas vagas ofertáveis cada terapia tem, POR UNIDADE. Responde "quais especialidades vocês têm disponíveis, e onde?" sem despejar centenas de horários. Substitui a agregação em memória de listarTerapiasComVaga, que era feita sobre as 500 primeiras linhas da janela e por isso podia afirmar que uma terapia só existe em Realengo quando ela tinha vaga em Padre Miguel a partir da linha 501.';

grant execute on function central.contar_vagas_por_terapia_e_unidade(date, date)
  to authenticated, service_role;

-- =============================================================================
-- BLOCO 4 — livro-caixa do CLI
--
-- Sem isto, `supabase db push` tentaria reaplicar estas três migrations.
-- =============================================================================

insert into supabase_migrations.schema_migrations (version)
values ('20260904100000'), ('20260904100100'), ('20260904100200')
on conflict (version) do nothing;

commit;

-- =============================================================================
-- VERIFICAÇÃO RÁPIDA (o completo está em
-- 20260904_contraprova_vagas_livres_por_unidade.sql)
-- =============================================================================

-- 1. A view separa as três unidades?
select unidade, count(*) as vagas_livres
  from central.vw_vagas_livres
 group by unidade
 order by vagas_livres desc;

-- 2. O filtro funciona e não vaza?
select unidade, count(*) as vagas
  from central.listar_vagas_disponiveis(p_unidade => 'Padre Miguel', p_limite => 500)
 group by unidade;
-- Esperado: UMA linha, 'Padre Miguel'.

-- 3. Unidade inválida lança em vez de devolver as três?
-- select * from central.listar_vagas_disponiveis(p_unidade => 'Realango');
-- Esperado: ERROR 22023 'p_unidade inválida: Realango...'

-- 4. O resumo por especialidade sai por unidade?
select terapia_nome, unidade, vagas
  from central.contar_vagas_por_terapia_e_unidade()
 order by vagas desc
 limit 20;
