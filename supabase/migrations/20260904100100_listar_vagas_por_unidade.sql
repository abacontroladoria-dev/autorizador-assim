-- Central de Atendimento — a disponibilidade passa a filtrar unidade NO BANCO
--
-- Depends on:
--   20260904100000_central_vagas_livres_por_unidade.sql (central.vw_vagas_livres)
--   20260810100000_central_appointments_slot_identity.sql
--   Substitui a versão de 20260810100100 (que tinha p_unidade_id bigint)
--
-- POR QUE O FILTRO DE UNIDADE SAI DO TYPESCRIPT E VEM PARA CÁ
--
-- Até aqui o filtro por unidade acontecia em ferramentas.ts, sobre a lista já
-- devolvida. Isso obrigava o executor a pedir 500 vagas SEMPRE que houvesse
-- unidade e cortar depois — porque as N primeiras podiam ser todas de outra
-- unidade. E 500 é o teto da própria RPC, então o filtro em memória tinha um
-- limite que não se podia aumentar.
--
-- MEDIDO EM PRODUÇÃO, 04/09/2026 — não era risco futuro, era o estado corrente:
--
--   Realengo      3.085 vagas na janela, 273 alcançáveis
--   Fazendinha    1.392 vagas,            99 alcançáveis
--   Padre Miguel  1.286 vagas,           100 alcançáveis
--   -----------------------------------------------------
--   5.763 ofertáveis, 472 alcançáveis — 91,8% invisíveis, nas TRÊS unidades.
--
-- E como o `order by` começa por `data`, as 500 linhas visíveis eram todas dos
-- primeiros dias: 4 dias visíveis de 21 que existiam (04/09 a 09/09, quando a
-- grade ia até 02/10). A partir do 5º dia a resposta era "não temos vaga" para
-- uma agenda cheia — então quem pedia "essa semana" era atendido e quem pedia
-- "semana que vem" recebia negativa falsa. Era isso que fazia o defeito parecer
-- falha intermitente da IA.
--
-- Com o filtro aqui, o teto de 500 vale POR UNIDADE, que é o que ele sempre
-- deveria ter significado. Note que ele continua sendo um teto: 500 por unidade
-- não cobre as 3.085 de Realengo, e não deve — é proteção de pool. O que muda é
-- que o recorte deixa de ser enviesado por unidade e por data. Se o horizonte
-- precisar de mais alcance, o caminho é p_data_inicio/p_data_fim (que o agente
-- já sabe passar quando o responsável indica período), não aumentar o teto.
--
-- POR QUE p_unidade text E NÃO p_unidade_id bigint
--
-- p_unidade_id saiu porque não filtrava nada: unidade_id é 280 em toda a grade
-- (ver o comentário de central.vw_vagas_livres). Um parâmetro que parece filtrar
-- e não filtra é pior que parâmetro nenhum — foi ele que fez o filtro migrar
-- para o TypeScript. Manter os dois seria pior ainda: dois jeitos de pedir
-- unidade, um funcional e um decorativo.
--
-- POR QUE VALIDA E LANÇA EM VEZ DE IGNORAR VALOR DESCONHECIDO
--
-- p_unidade => 'Realango' que silenciosamente não filtra devolve as três
-- unidades misturadas, que é o bug original reintroduzido por um typo. O
-- errcode 22023 (invalid_parameter_value) chega ao PostgREST como 400, não 500:
-- quem errou foi o chamador, e a mensagem precisa dizer isso em vez de mandar
-- alguém procurar defeito no banco.
--
-- O custo é `language plpgsql` em vez de `sql`, perdendo a inlining que o
-- planner faz em função sql stable. Para uma query com limit 500 sobre view
-- indexada, irrelevante. As alternativas que preservariam `language sql` (um
-- `case ... else 1/0`, ou um domain type) são engenhosas e ilegíveis.
--
-- ATENÇÃO — O DROP NÃO É LIMPEZA, É REQUISITO
--
-- Postgres não troca o tipo de um parâmetro com `create or replace function`:
-- ele CRIARIA UMA SEGUNDA função sobrecarregada. Como todos os parâmetros têm
-- default, uma chamada nomeada parcial ficaria AMBÍGUA e o PostgREST
-- responderia PGRST203 ("could not choose the best candidate function") a TODA
-- consulta de disponibilidade — derrubando o agente e a tela de Agendamentos
-- juntos, com um sintoma que não menciona unidade nenhuma.
--
-- E o DROP apaga os grants (são atributo do objeto, não do nome). O grant no fim
-- desta migration é obrigatório: sem ele o `authenticated` recebe
-- "permission denied for function", que chega à tela como 403.
--
-- JANELA DE QUEBRA (ler antes de aplicar em produção)
--
-- Entre esta migration e o deploy do frontend, /api/central/appointments/
-- availability chama a função com p_unidade_id e recebe PGRST202
-- ("function not found"). Medido: o único chamador que passaria unidade é
-- services/connect/agendamentos.ts:116, e `unidadeId` nunca é preenchido por
-- ninguém (ReservarVagaModal não o passa) — então o argumento vai como null.
-- Ainda assim a ASSINATURA muda, e é a assinatura que o PostgREST resolve.
-- Aplicar junto do deploy, ou fora do horário de atendimento.
--
-- ROLLBACK:
--   drop function if exists central.listar_vagas_disponiveis(date,date,bigint,bigint,text,integer);
--   e reaplicar 20260810100100 (que recria a versão com p_unidade_id e o grant).

-- ============================================================================
-- FUNCTION: central.listar_vagas_disponiveis
-- ============================================================================

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
  -- As 11 colunas originais, na mesma ordem: `returns table` é posicional para
  -- alguns clientes, e VagaDisponivel (central.types.ts:352) as declara. As
  -- duas novas vão no FIM, de propósito — retorno aditivo não quebra ninguém.
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
  -- Novas
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
  -- Falha alta em unidade desconhecida: ver o cabeçalho. Silenciar aqui é
  -- reintroduzir o bug original por um typo.
  if p_unidade is not null
     and p_unidade not in ('Realengo', 'Fazendinha', 'Padre Miguel') then
    raise exception
      'p_unidade inválida: %. Valores aceitos: Realengo, Fazendinha, Padre Miguel.',
      p_unidade
      using errcode = '22023';
  end if;

  -- Janela default de 30 dias: a grade só é populada algumas semanas à frente.
  -- Pedir mais que isso não devolve mais vaga, só custa scan.
  v_inicio := coalesce(p_data_inicio, v_agora::date);
  v_fim    := coalesce(p_data_fim,    v_agora::date + 30);

  return query
  select
    v.data,
    v.dia_semana,
    v.hora_inicial,
    v.hora_final,
    v.profissional_id,
    v.profissional_nome,
    v.terapia_id,
    v.terapia_nome,
    v.unidade_id,
    v.unidade_nome,
    v.sala_nome,
    v.unidade,
    v.e_sala_numerada
  from central.vw_vagas_livres v
  where v.data >= v_inicio
    and v.data <= v_fim
    -- No dia corrente a comparação é por HORA, não só por data: às 14h não se
    -- oferece a vaga das 09h20. Oferecer horário que já passou é o erro mais
    -- visível que um atendente automático comete.
    and (v.data > v_agora::date or v.hora_inicial > v_agora::time)
    and (p_terapia_id      is null or v.terapia_id      = p_terapia_id)
    and (p_profissional_id is null or v.profissional_id = p_profissional_id)
    -- O filtro que motivou esta migration. Comparação exata: a view produz
    -- exatamente os três literais validados acima.
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

-- ============================================================================
-- central.vaga_esta_disponivel NÃO MUDA — e isso é decisão, não esquecimento
--
-- Ela continua lendo public.vw_grade_base direto (20260810100100:154), não a
-- view nova. A inconsistência é deliberada e benigna na direção segura:
--
--   `existe_na_grade` continua verdadeiro para 'AT Externo Escola', então uma
--   reserva legítima de sessão externa continua passando pelo diagnóstico. Se
--   ela passasse a ler vw_vagas_livres, TODA vaga não-física viraria
--   SlotNotInGradeError — a Central deixaria de conseguir reservar atendimento
--   externo, sem que ninguém tivesse decidido isso.
--
-- Consequência a conhecer: o diagnóstico aprova vagas que listar_vagas_disponiveis
-- não oferece. Isso importa em appointment.service.ts:137, que usa listarVagas
-- para COPIAR OS METADADOS do slot — ver o Risco 1 do plano e o snippet
-- 20260904_diagnostico_reservas_em_sala_nao_fisica.sql, que mede se o caso é
-- real nos dados.
-- ============================================================================
