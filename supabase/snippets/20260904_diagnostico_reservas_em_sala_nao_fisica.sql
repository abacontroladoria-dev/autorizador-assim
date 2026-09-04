-- ============================================================================
-- DIAGNÓSTICO — reservas da Central em sala que não é endereço da clínica
--
-- SÓ LEITURA. Rodar ANTES de aplicar 20260904100000/20260904100100.
--
-- POR QUE ESTA PERGUNTA BLOQUEIA O RESTO
--
-- A view central.vw_vagas_livres vai excluir as salas que não são endereço da
-- clínica ('Sala Teste', 'AT Externo Escola', 'AT Externo Casa', 'Especialista
-- Técnico de Área', 'Consulta 4/6 - Nutrição' — nenhuma tem o prefixo 'Unid. ').
--
-- Mas appointment.service.ts:137 usa listarVagas() para COPIAR OS METADADOS do
-- slot que está sendo reservado, e lança SlotAlreadyBookedError se não achar a
-- vaga na lista. Ou seja, depois da mudança:
--
--   1. central.vaga_esta_disponivel aprova (ela lê vw_grade_base, que contém
--      a vaga não-física);
--   2. listarVagas NÃO devolve a vaga (a view nova a excluiu);
--   3. vagas.find(...) é undefined  →  SlotAlreadyBookedError;
--   4. o operador vê "essa vaga já foi reservada" sobre uma vaga LIVRE.
--
-- Mensagem ativamente enganosa, na tela HUMANA de Agendamentos — não só no
-- agente. Alguém vai abrir chamado de corrida que não houve.
--
-- COMO LER O RESULTADO
--
--   total_reservas_nao_fisicas = 0
--     → ninguém nunca reservou em sala não-física pela Central. Seguir o plano
--       como está: agendarVaga pode continuar usando listarVagas.
--
--   total_reservas_nao_fisicas > 0
--     → agendarVaga PRECISA parar de usar listarVagas para resolver metadados.
--       "Resolver metadados de um slot" e "listar ofertas ao responsável" são
--       perguntas diferentes que nunca deveriam ter compartilhado a chamada.
--       Ver Risco 1 do plano.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O número que decide
-- ----------------------------------------------------------------------------
select
  count(*)                                                  as total_reservas_nao_fisicas,
  count(*) filter (where ap.status in ('scheduled','confirmed')) as ainda_ocupando_vaga,
  count(*) filter (where ap.created_by_ai)                  as criadas_pela_ia,
  min(ap.date)                                              as primeira,
  max(ap.date)                                              as ultima
from central.appointments ap
join public.vw_grade_base g
  on  g.profissional_id = ap.profissional_id
  and g.data            = ap.date
  and g.hora_inicial    = ap.time
where g.sala_nome not like 'Unid. %';

-- ----------------------------------------------------------------------------
-- 2. Quais salas, e quantas vezes cada uma
--
-- Se aparecer só 'Sala Teste', a decisão é fácil: é dado de teste e excluir não
-- perde nada real. Se aparecer 'AT Externo Escola' ou 'AT Externo Casa', a
-- clínica reserva atendimento externo por aqui e o desacoplamento é obrigatório.
-- ----------------------------------------------------------------------------
select
  g.sala_nome,
  count(*)                                                       as reservas,
  count(*) filter (where ap.status in ('scheduled','confirmed'))  as ativas,
  max(ap.date)                                                   as ultima
from central.appointments ap
join public.vw_grade_base g
  on  g.profissional_id = ap.profissional_id
  and g.data            = ap.date
  and g.hora_inicial    = ap.time
where g.sala_nome not like 'Unid. %'
group by g.sala_nome
order by reservas desc;

-- ----------------------------------------------------------------------------
-- 3. O outro lado da moeda: o vocabulário REAL de sala_nome nas vagas livres
--
-- Isto é o que a view nova vai ver. Confirma três coisas antes de aplicá-la:
--   - os três prefixos 'Unid. <unidade> - ' existem e estão escritos assim;
--   - quanto se perde ao excluir o que não tem prefixo;
--   - se apareceu prefixo NOVO que o de-para não conhece (a linha viria com
--     unidade_derivada = NULL e sairia da view em silêncio — é o que este
--     bloco existe para tornar visível).
-- ----------------------------------------------------------------------------
select
  coalesce(
    case
      when g.sala_nome like 'Unid. Realengo - %'     then 'Realengo'
      when g.sala_nome like 'Unid. Fazendinha - %'   then 'Fazendinha'
      when g.sala_nome like 'Unid. Padre Miguel - %' then 'Padre Miguel'
    end,
    '(fora do de-para — SAI da view)'
  )                          as unidade_derivada,
  count(*)                   as vagas_livres,
  count(distinct g.sala_nome) as salas_distintas,
  -- As salas em si, para conferir a grafia com o olho.
  string_agg(distinct g.sala_nome, ' | ' order by g.sala_nome) as salas
from public.vw_grade_base g
where g.status_agendamento = 'Livre'
  and g.profissional_id is not null
  and g.hora_inicial    is not null
group by 1
order by vagas_livres desc;

-- ----------------------------------------------------------------------------
-- 4. O teto de 500: mede o Defeito 2 do plano nos dados de HOJE
--
-- Hoje o filtro de unidade acontece em TypeScript, DEPOIS de a RPC devolver no
-- máximo 500 linhas ordenadas por (data, hora, profissional). Se a 500ª linha
-- não alcança todas as unidades, a unidade que ficou de fora responde "não tem
-- vaga" quando tem.
--
-- posicao_da_primeira_vaga é a linha em que cada unidade APARECE pela primeira
-- vez nessa ordenação. Se alguma passar de 500, o falso negativo já é real
-- agora — não latente.
-- ----------------------------------------------------------------------------
with ordenadas as (
  select
    row_number() over (order by g.data, g.hora_inicial, g.profissional_nome) as posicao,
    case
      when g.sala_nome like 'Unid. Realengo - %'     then 'Realengo'
      when g.sala_nome like 'Unid. Fazendinha - %'   then 'Fazendinha'
      when g.sala_nome like 'Unid. Padre Miguel - %' then 'Padre Miguel'
    end as unidade
  from public.vw_grade_base g
  where g.status_agendamento = 'Livre'
    and g.profissional_id is not null
    and g.hora_inicial    is not null
    and g.data >= (now() at time zone 'America/Sao_Paulo')::date
)
select
  unidade,
  min(posicao)                                   as posicao_da_primeira_vaga,
  count(*)                                       as vagas_na_janela,
  count(*) filter (where posicao <= 500)         as vagas_dentro_do_teto,
  case
    when min(posicao) > 500 then 'FALSO NEGATIVO JÁ REAL — esta unidade não cabe nas 500 primeiras'
    when count(*) filter (where posicao <= 500) < count(*) then 'parcialmente cortada pelo teto'
    else 'ok hoje (mas o teto é global, então isto muda quando a grade crescer)'
  end                                            as veredito
from ordenadas
where unidade is not null
group by unidade
order by posicao_da_primeira_vaga;
