-- =============================================================================
-- A Central vai acender "Glosa Resolvida"? — e em que dia conferir
-- =============================================================================
--
-- POR QUE ESTE SNIPPET EXISTE
-- O Controle de Pacientes passou a dizer "Glosa Resolvida" quando um vínculo da
-- aba Reconciliação cobre a sessão glosada. Diferente da aba Auditoria, isso NÃO
-- depende da migration 20260821030000 estar viva: a tela monta o `bloco_id` do
-- lado do cliente, a partir da própria `fila_autorizacoes`
-- (frontend/lib/central/blocoId.ts), e lê `autorizacoes_vinculos` direto.
--
-- A pergunta 1 é a que decide se há caso para conferir na tela. A 2 prova que a
-- chave que o cliente monta é a mesma que a Reconciliação gravou — se ela vier
-- com `bate = false`, a tela silenciosamente não acenderia.
--
-- Rodar no SQL Editor. Somente leitura.
-- =============================================================================

-- 1. Glosas ainda de pé na fila que JÁ têm guia vinculada.
--    Cada linha aqui é uma sessão que a Central mostrava vermelha para sempre.
--    A coluna `abrir_em` é a data para abrir em /central-pacientes.
select
  f.data_atendimento                      as abrir_em,
  f.paciente_nome,
  f.horario,
  f.tuss,
  f.numero_autorizacao                    as guia_glosada,
  v.guia                                  as guia_que_cobriu,
  v.vinculado_por,
  v.vinculado_em,
  f.status_assim                          as motivo_da_recusa
from public.fila_autorizacoes f
join public.autorizacoes_vinculos v
  on  v.bloco_id = concat_ws('_', f.paciente_id, f.data_atendimento, f.tuss, f.horario)
  and v.desfeito_em is null
  and v.tipo = 'vinculo'
where f.status = 'glosa'
order by f.data_atendimento desc, f.horario;

-- Zero linhas = nada para ver na tela ainda (nenhuma glosa foi reconciliada, ou
-- as que foram já saíram de 'glosa' por outro caminho). Não é defeito.

-- 2. A chave montada no cliente casa com a gravada? Olha TODO vínculo ativo com
--    bloco, ache ou não a linha da fila.
--
--    `bate = false` com `fila_id` preenchido é o sintoma que importa: existe
--    solicitação no Pulsar para aquele vínculo, mas as coordenadas dela não
--    reproduzem o bloco_id — e aí a Central não acha a cobertura.
--    `fila_id` nulo é o Cenário B (sessão nunca solicitada pelo Pulsar): não há
--    linha de fila para casar, e essa sessão nem aparece como glosa na Central.
select
  v.guia,
  v.bloco_id,
  v.fila_id,
  f.id                                    as fila_encontrada,
  f.status                                as status_da_fila,
  concat_ws('_', f.paciente_id, f.data_atendimento, f.tuss, f.horario)
                                          as bloco_id_montado_do_cliente,
  (concat_ws('_', f.paciente_id, f.data_atendimento, f.tuss, f.horario) = v.bloco_id)
                                          as bate
from public.autorizacoes_vinculos v
left join public.fila_autorizacoes f on f.id = v.fila_id
where v.desfeito_em is null
  and v.tipo = 'vinculo'
order by v.vinculado_em desc;
