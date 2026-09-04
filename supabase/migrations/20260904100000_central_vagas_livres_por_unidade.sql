-- Central de Atendimento — as sessões livres, separadas por unidade física
--
-- Depends on:
--   public.vw_grade_base (20260807110000 — leitura única da grade)
--
-- POR QUE A UNIDADE É DERIVADA DE TEXTO, E NÃO LIDA DE UMA COLUNA
--
-- A clínica atende em três endereços (Realengo, Fazendinha, Padre Miguel), mas
-- eles não existem como dado estruturado na grade do TiTa: `unidade_id` é 280 e
-- `unidade_nome` é 'CLÍNICA UNIVERSO ABA' em TODAS as linhas (medido em
-- 01/09/2026 sobre as 500 vagas livres). O único lugar onde o endereço aparece
-- é o PREFIXO de `sala_nome`: 'Unid. Realengo - Sala 20'.
--
-- Isso não é preferência de estilo, é o defeito estrutural que produziu, num
-- diálogo real, uma oferta de horário em Realengo logo depois de o responsável
-- pedir Padre Miguel: as três unidades chegavam ao atendente virtual
-- misturadas, dentro de um campo que parecia uniforme.
--
-- E não é só o agente. Enquanto a unidade só existia em TypeScript, o filtro
-- acontecia DEPOIS de a RPC devolver no máximo 500 linhas ordenadas por
-- (data, hora, profissional). Com a unidade sendo coluna, o teto passa a valer
-- POR UNIDADE, que é o que ele sempre deveria ter significado.
--
-- MEDIDO EM PRODUÇÃO, 04/09/2026 — o defeito não era latente, era corrente:
--
--   Realengo      3.085 vagas na janela de 30 dias, 273 visíveis (91,2% cegas)
--   Fazendinha    1.392 vagas,                       99 visíveis (92,9% cegas)
--   Padre Miguel  1.286 vagas,                      100 visíveis (92,2% cegas)
--   ------------------------------------------------------------------------
--   5.763 vagas ofertáveis, 472 alcançáveis — 91,8% invisíveis, nas TRÊS.
--
-- E o corte não é uniforme, é por DATA, porque a ordenação começa por `data`:
--
--   dias visíveis:    4  (04/09 → 09/09)
--   dias que existem: 21 (04/09 → 02/10)
--
-- Ou seja: a partir do 5º dia a resposta era "não temos vaga" para uma agenda
-- cheia. Quem pedia "essa semana" era atendido; quem pedia "semana que vem" ou
-- "dia 15" recebia uma negativa falsa. Isso fazia o sintoma parecer falha
-- intermitente da IA quando era um horizonte de 4 dias.
--
-- POR QUE DE-PARA POR PREFIXO, E NÃO REGEX DE CAPTURA
--
-- Um prefixo desconhecido precisa virar NULL (visível, sai da view), não casar
-- por acidente com uma das três unidades. É o mesmo argumento já registrado no
-- de-para de 20260902_inclusao_terapia_depara_conferido.sql, onde a Unidade
-- também vem do prefixo de `sala_nome` pela mesma razão.
--
-- Como NÃO lemos o número da sala, duas sujeiras da origem deixam de ser
-- problema nosso: o padding inconsistente ('Sala 1' e 'Sala 09' coexistem) e os
-- sufixos parentéticos de caixa variável ('Coordenação de Caso' e 'Coordenação
-- de caso' coexistem, e há '(Cozinha)', '(Piscina)', '(Equoterapia)',
-- '(Psicoeducação)', '(conhecimento)').
--
-- A comparação é sensível a caixa DE PROPÓSITO. O prefixo vem do TiTa e é
-- estável; um `ilike` esconderia uma mudança de grafia na origem, que é
-- justamente a informação que queremos ver (o bloco 2 da contraprova falha alto
-- se as três unidades deixarem de aparecer).
--
-- O QUE SAI DA VIEW, E POR QUE PELO NULL EM VEZ DE LISTA NEGRA
--
-- 'Sala Teste' (dado de teste que vive na grade de produção), 'AT Externo
-- Escola' e 'AT Externo Casa' (atendimento na escola ou na casa do paciente —
-- não é endereço da clínica e não pode ser oferecido como se fosse),
-- 'Especialista Técnico de Área' e 'Consulta 4/6 - Nutrição' não têm o prefixo
-- 'Unid. '. O `case` abaixo já as leva a NULL, então filtrar pelos três
-- prefixos remove as cinco E também qualquer não-física que o TiTa criar
-- amanhã, sem lista para manter.
--
-- Isso é estritamente mais forte que o `salaOculta()` que existia em
-- TypeScript: ele casava 'sala teste' por igualdade exata em lowercase
-- (unidade.ts:50), então 'Sala Teste 2' passaria.
--
-- MEDIDO EM PRODUÇÃO, 04/09/2026 — o vocabulário real de sala_nome nas vagas
-- livres, e é limpo:
--
--   Realengo      7.350 vagas, 34 salas distintas
--   Fazendinha    3.191 vagas, 13 salas (inclui 'Aplicador Suporte')
--   Padre Miguel  2.775 vagas, 11 salas (inclui 'Visita Guiada')
--   FORA do de-para  854 vagas,  3 salas:
--                    'AT Externo Escola', 'Especialista Técnico de Área',
--                    'Sala Teste'
--
-- Nenhuma grafia inesperada, nenhuma unidade nova. Os casos que este de-para
-- cobre de propósito aparecem todos: 'Sala 09' junto de 'Sala 1', '(Coordenação
-- de Caso)' junto de '(coordenação de caso)', e os dois papéis com prefixo.
--
-- MUDANÇA DE COMPORTAMENTO A DECLARAR: as 854 vagas acima SÃO oferecidas hoje
-- quando não há filtro de unidade (só 'Sala Teste' era oculta, e por igualdade
-- exata). Depois desta view, deixam de ser — e é o ponto: 'AT Externo Escola' é
-- atendimento na escola do paciente, e oferecê-lo como se fosse a clínica erra
-- o endereço na cara do responsável.
--
-- O RISCO QUE ISSO ABRIA ESTÁ MEDIDO E DESCARTADO: appointment.service.ts:137
-- usa listarVagas para copiar os metadados do slot, então uma vaga aprovada por
-- vaga_esta_disponivel (que lê vw_grade_base, com as não-físicas) e ausente daqui
-- viraria SlotAlreadyBookedError — "essa vaga já foi reservada" sobre uma vaga
-- livre, na tela HUMANA. Contado em produção em 04/09/2026:
-- ZERO reservas em sala não-física em central.appointments, desde sempre.
-- Ninguém reserva atendimento externo pela Central, então a chamada pode
-- continuar como está. Se isso mudar, o conserto está descrito no comentário de
-- appointment.service.ts. Refazer a contagem com
-- snippets/20260904_diagnostico_reservas_em_sala_nao_fisica.sql.
--
-- O QUE ENTRA MESMO NÃO SENDO SALA NUMERADA
--
-- 'Unid. Fazendinha - Aplicador Suporte', 'Unid. Fazendinha - Facilitador
-- Técnico' e 'Unid. Padre Miguel - Visita Guiada' têm o prefixo, logo afirmam o
-- endereço, logo entram — a coluna `e_sala_numerada` os distingue sem os perder.
-- Excluí-los exigiria uma allowlist de papéis, e a lista que envelhece faz a
-- vaga desaparecer da oferta em silêncio, que é exatamente o modo de falha que
-- esta view existe para eliminar. Se algum papel não deve ser ofertado ao
-- responsável, isso é regra de OFERTA (filtro na RPC ou na ferramenta), não de
-- LOCALIZAÇÃO.
--
-- O QUE ESTA VIEW **NÃO** FAZ
--
-- Não subtrai central.appointments e não descarta o passado. As duas coisas
-- continuam em central.listar_vagas_disponiveis, por dois motivos: o filtro de
-- passado depende de now(), e uma view cuja resposta muda a cada minuto é ruim
-- de diagnosticar por SQL — que é metade do propósito deste trabalho; e a regra
-- de "vaga já prometida" precisa de UM lugar só, senão a tela de Agendamentos e
-- o agente voltam a divergir (ver 20260810100100:6-16).
--
-- ROLLBACK (nesta ordem — a função referencia a view):
--   drop function if exists central.listar_vagas_disponiveis(date,date,bigint,bigint,text,integer);
--   drop view if exists central.vw_vagas_livres;
--   -- e reaplicar 20260810100100 para voltar a versão com p_unidade_id.

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
  -- A unidade física. Esta é a coluna que a view existe para produzir.
  case
    when g.sala_nome like 'Unid. Realengo - %'     then 'Realengo'
    when g.sala_nome like 'Unid. Fazendinha - %'   then 'Fazendinha'
    when g.sala_nome like 'Unid. Padre Miguel - %' then 'Padre Miguel'
  end::text as unidade,
  -- Distingue sala física numerada de papel ('Aplicador Suporte', 'Facilitador
  -- Técnico', 'Visita Guiada'). Exposto para quem precisar; nenhum consumidor é
  -- obrigado a usar. Existe para que a distinção não se perca — e para que
  -- ninguém precise reintroduzir uma allowlist de papéis para recuperá-la.
  (g.sala_nome ~ '^Unid\. [^-]+ - Sala \d+') as e_sala_numerada,
  -- Mantidos por rastreabilidade: são o valor único (280 / 'CLÍNICA UNIVERSO
  -- ABA') e ficam aqui para que quem inspecionar a view VEJA que não distinguem
  -- nada, em vez de procurá-los e supor que a view os perdeu.
  g.unidade_id,
  g.unidade_nome
from public.vw_grade_base g
where g.status_agendamento = 'Livre'
  and g.profissional_id is not null
  and g.hora_inicial     is not null
  -- Os três prefixos, repetidos porque um alias do SELECT não é referenciável
  -- no WHERE em Postgres. Uma subquery resolveria a repetição, mas atrapalha o
  -- planner e torna o security_invoker menos óbvio de auditar. A repetição
  -- literal é a opção honesta — e quem editar precisa mexer nos dois lugares.
  and (   g.sala_nome like 'Unid. Realengo - %'
       or g.sala_nome like 'Unid. Fazendinha - %'
       or g.sala_nome like 'Unid. Padre Miguel - %');

comment on view central.vw_vagas_livres is
  'As sessões livres da grade, com a unidade física (Realengo / Fazendinha / Padre Miguel) DERIVADA do prefixo de sala_nome. Derivada porque não existe como dado: unidade_id é 280 e unidade_nome é CLÍNICA UNIVERSO ABA em toda linha da grade — passá-los como filtro não filtra nada. Exclui o que não tem prefixo Unid. (Sala Teste, AT Externo Escola/Casa, Especialista Técnico de Área, Consulta 4/6 - Nutrição): não são endereço da clínica e não podem ser oferecidos como se fossem. NÃO subtrai appointments nem descarta o passado — isso é central.listar_vagas_disponiveis.';

-- Mesmo padrão de 20260806110000: a grade carrega nome de paciente, e a chave
-- anon está embutida no JS do navegador. `security_invoker = true` acima é o que
-- mantém a RLS do chamador valendo; o revoke é a segunda camada.
grant select on central.vw_vagas_livres to authenticated, service_role;
revoke all  on central.vw_vagas_livres from anon;
