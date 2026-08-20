/**
 * Agrupamento de situações — a regra única de "que linhas este recorte pega".
 *
 * Existe porque um recorte da tela deixou de ser 1 KPI = 1 situação:
 * SOLICITACAO_CANCELADA (a tentativa quebrou no meio — aba da ASSIM fechada na
 * identificação, envio não concluído, solicitação cancelada) é contada junto
 * com NAO_SOLICITADA, porque a ação exigida é a mesma: solicitar de novo. O
 * banco as separa para a tela poder dizer QUAL das duas é, sem separar a
 * contagem que a operação usa.
 *
 * A contagem do card e o filtro que o clique nele aplica precisam da MESMA
 * regra — se divergirem, o card mostra um número e a tabela mostra outro. Por
 * isso as duas pontas (`kpis` e `filtrados`, em useAuditoriaAssim) chamam
 * `situacaoNoRecorte` em vez de comparar strings cada uma do seu jeito.
 */

/**
 * O recorte de "Não Solicitadas": nada foi autorizado e o caminho é solicitar
 * de novo. `SOLICITACAO_CANCELADA` mora aqui, e não em Glosas, porque a ASSIM
 * não recusou nada — o processo quebrou antes de existir resposta.
 */
export const GRUPO_NAO_SOLICITADAS = ['NAO_SOLICITADA', 'SOLICITACAO_CANCELADA'] as const

/**
 * A linha entra no recorte pedido?
 *
 * `NAO_SOLICITADA` como filtro significa o GRUPO — é o valor que o card
 * "Não Solicitadas" aplica, e o seletor de status usa o mesmo valor para o
 * mesmo significado. Para ver só as que quebraram no meio existe o valor
 * `SOLICITACAO_CANCELADA`, que é exato. Qualquer outro valor é comparação
 * direta, como sempre foi.
 */
export function situacaoNoRecorte(situacao: string | null, recorte: string): boolean {
  if (!recorte) return true
  if (recorte === 'NAO_SOLICITADA') {
    return GRUPO_NAO_SOLICITADAS.includes(situacao as (typeof GRUPO_NAO_SOLICITADAS)[number])
  }
  return situacao === recorte
}
