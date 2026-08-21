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
 * `GLOSA_RESOLVIDA` deliberadamente NÃO é agrupada com `GLOSA`.
 *
 * O agrupamento acima existe porque a ação exigida é idêntica — solicitar de
 * novo. Aqui as ações são opostas: glosa pede tratativa, glosa resolvida não
 * pede nada. Somá-las faria o card violeta ("trate isso") listar linhas que não
 * precisam de nada, e o número que a operação usa para dimensionar trabalho
 * incluiria trabalho já feito.
 *
 * "Continuar contabilizando que houve glosa" é atendido por outras duas vias, em
 * vez do agrupamento: o badge da linha diz GLOSA RESOLVIDA (a recusa continua
 * visível na tela) e o card de Glosas traz a contagem do período como dica.
 */

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
  // 'GLOSA' segue sendo comparação exata: não inclui GLOSA_RESOLVIDA. Ver a nota
  // acima — as duas pedem ações opostas, e o card de Glosas dimensiona trabalho.
  return situacao === recorte
}

/**
 * A ASSIM recusou esta sessão — resolvida por vínculo posterior ou não.
 *
 * Pergunta diferente de `situacaoNoRecorte(s, 'GLOSA')`, que é "preciso tratar
 * isto?". Esta é "houve recusa?", e é a que interessa a quem exibe o MOTIVO: a
 * observação vem prefixada de "Glosa: " nos dois estados, e o motivo continua
 * existindo depois de resolvido — o histórico não se apaga.
 *
 * Existe como função porque três lugares precisavam dela (a legenda da linha e
 * dois trechos do modal de detalhamento) e cada um teria escrito o seu
 * `=== 'GLOSA' || === 'GLOSA_RESOLVIDA'`. A quarta cópia é que sempre esquece.
 */
export function ehGlosa(situacao: string | null): boolean {
  return situacao === 'GLOSA' || situacao === 'GLOSA_RESOLVIDA'
}
