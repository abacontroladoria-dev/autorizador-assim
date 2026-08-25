/**
 * O `bloco_id` de uma sessão, montado do lado de cá.
 *
 * É a chave da cobertura: `autorizacoes_vinculos.bloco_id` aponta para a sessão
 * que uma guia externa passou a cobrir, e o formato é um derivado, não uma FK —
 * não existe tabela de blocos (ver o comentário da coluna em
 * `20260821000000_reconciliacao_autorizacoes_vinculos.sql:66-72`).
 *
 * O formato vem de UM lugar no banco, repetido em toda RPC da Conferência:
 *
 *   concat_ws('_', paciente_id, data_atendimento, codigo_tuss, hora_inicial)
 *
 * `concat_ws` renderiza `date` como `YYYY-MM-DD` e `time` como `HH:MM:SS`, que
 * é exatamente o que o PostgREST devolve nessas colunas. A única normalização
 * necessária é a hora sem segundos (`08:00`), que aparece quando o valor passou
 * por algum `slice(0, 5)` no caminho — comparar `..._08:00` com `..._08:00:00`
 * seria um "nenhum vínculo encontrado" silencioso.
 *
 * Devolve `null` se qualquer parte faltar. Um bloco_id parcial não é um bloco_id
 * mais fraco: `18565_2026-08-21__08:00:00` é uma string que pode casar com o
 * bloco de outra sessão, e a falha seria afirmar cobertura onde não há.
 */
export function montarBlocoId(sessao: {
  paciente_id?: string | number | null
  data_atendimento?: string | null
  codigo_tuss?: string | null
  horario?: string | null
}): string | null {
  const paciente = String(sessao.paciente_id ?? '').trim()
  const data = (sessao.data_atendimento ?? '').trim()
  const tuss = (sessao.codigo_tuss ?? '').trim()
  const hora = normalizarHora(sessao.horario)

  if (!paciente || !data || !tuss || !hora) return null

  return `${paciente}_${data}_${tuss}_${hora}`
}

/** `08:00` e `08:00:00` são a mesma hora; só a segunda forma é a do banco. */
function normalizarHora(horario?: string | null): string | null {
  const bruto = (horario ?? '').trim()
  if (!bruto) return null

  const partes = bruto.split(':')
  if (partes.length === 2) return `${partes[0]}:${partes[1]}:00`
  if (partes.length === 3) return `${partes[0]}:${partes[1]}:${partes[2].slice(0, 2)}`

  return null
}
