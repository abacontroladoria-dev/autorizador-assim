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

select
  c.chamado_em,
  c.nome,
  c.status                as status_chamada,
  c.paciente_id,
  c.data_atendimento,
  c.horario,
  f.status                as status_da_fila,
  case
    when c.paciente_id is null
      or c.data_atendimento is null
      or c.horario is null          then 'aparece (chamada sem sessão)'
    when f.status is null            then 'aparece (fila ainda não existe)'
    when f.status in ('pendente','processando','executando','erro')
                                     then 'aparece (fila em andamento)'
    else                                  'ESCONDIDA pelo filtro da TV'
  end                     as veredito,
  c.chamado_em > now() - interval '6 hours' as dentro_da_janela
from public.chamada_paciente c
left join public.fila_autorizacoes f
  on  f.paciente_id      = c.paciente_id
  and f.data_atendimento = c.data_atendimento
  and f.horario          = c.horario
order by c.chamado_em desc
limit 25;
