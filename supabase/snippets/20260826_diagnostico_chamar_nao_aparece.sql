-- Diagnóstico: "aperto Chamar na /solicitar e nada aparece na TV".
--
-- Somente leitura. Roda no SQL Editor.
--
-- A TV lê /api/tv/chamadas, que mostra uma chamada se, e somente se:
--   1. a linha existe em chamada_paciente com status 'ativo';
--   2. chamado_em está dentro das últimas 6 horas;
--   3. a sessão (paciente_id, data_atendimento, horario) NÃO tem linha em
--      fila_autorizacoes com status fora de (pendente, processando,
--      executando, erro).
--
-- Cada coluna abaixo mata uma hipótese:
--
--   * NENHUMA linha nova  -> o insert está falhando. Suspeito nº 1 é grant por
--     coluna: as três colunas nasceram na migration 20260826000000, e GRANT de
--     coluna não é herdado de GRANT de tabela (ver o caso documentado em
--     reference_grants_coluna_postgrest). Nesse caso a /solicitar mostra o
--     toast vermelho "Erro ao chamar paciente".
--
--   * linha nova com paciente_id NULL  -> o insert passou, mas a /solicitar não
--     tinha os campos da sessão no objeto do paciente. A TV mostra o nome
--     (chamada sem sessão nunca é filtrada), então o sintoma seria outro.
--
--   * linha nova, tupla preenchida, e status_da_fila terminal ('concluido',
--     'glosa', 'concluido_sem_guia'...)  -> a TV está escondendo de propósito.
--     É o filtro que eu introduzi no 48ab7a1 fazendo exatamente o que foi
--     pedido, só que cedo demais: se a autorização daquela sessão JÁ terminou,
--     o nome nasce filtrado e ninguém nunca o vê.

-- ATUALIZADO depois do diagnóstico de 26/08. A resposta foi a terceira
-- hipótese: em 10 de 11 chamadas com sessão a fila JÁ estava resolvida no
-- instante do "Chamar" (autorização tirada mais cedo, ou de véspera, pelo
-- robô). O nome nascia filtrado e ninguém nunca o via.
--
-- A regra deixou de ser "a autorização está resolvida" e passou a ser "a
-- autorização foi resolvida DEPOIS da chamada" — só isso sustenta a inferência
-- de que o responsável passou pela recepção. O veredito abaixo acompanha.
--
-- `completed_at` e `updated_at` são `timestamp without time zone` guardando
-- UTC; `chamado_em` é `timestamptz`. O `at time zone 'UTC'` é o que põe os dois
-- na mesma régua — sem ele a comparação erra pelo offset do servidor, calada.

select
  c.chamado_em,
  c.nome,
  c.status                as status_chamada,
  c.paciente_id,
  c.data_atendimento,
  c.horario,
  f.status                as status_da_fila,
  coalesce(f.completed_at, f.updated_at) at time zone 'UTC' as resolvida_em,
  case
    when c.paciente_id is null
      or c.data_atendimento is null
      or c.horario is null          then 'aparece (chamada sem sessão)'
    when f.status is null            then 'aparece (fila ainda não existe)'
    when f.status in ('pendente','processando','executando','erro')
                                     then 'aparece (fila em andamento)'
    when coalesce(f.completed_at, f.updated_at) is null
                                     then 'aparece (sem carimbo de resolução)'
    when (coalesce(f.completed_at, f.updated_at) at time zone 'UTC') <= c.chamado_em
                                     then 'aparece (resolvida ANTES da chamada)'
    when c.chamado_em > now() - interval '1 minute'
                                     then 'aparece (piso de 60s)'
    else                                  'ESCONDIDA (resolvida após a chamada)'
  end                     as veredito,
  c.chamado_em > now() - interval '6 hours' as dentro_da_janela
from public.chamada_paciente c
left join public.fila_autorizacoes f
  on  f.paciente_id      = c.paciente_id
  and f.data_atendimento = c.data_atendimento
  and f.horario          = c.horario
order by c.chamado_em desc
limit 25;
