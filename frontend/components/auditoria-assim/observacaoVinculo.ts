/**
 * A frase que a RPC acrescenta à observação quando um vínculo cobre a sessão —
 * e como tirá-la de volta.
 *
 * `get_auditoria_assim_periodo` preserva o texto da glosa inteiro e concatena a
 * cobertura no fim (20260821030000:302-314):
 *
 *   "Glosa: 1403 - NAO EXISTE INFORMACAO · Coberta pela guia 15032
 *    de 03/08/2026 14:39 — vínculo por Fulano"
 *
 * A ordem está certa no banco: quem lê a linha precisa continuar vendo por que
 * ela foi recusada. Mas a legenda da listagem é UMA linha truncada, e prosa
 * trunca pelo fim — o pedaço que se perde é exatamente o número da guia que
 * resolveu. Foi assim que a tela passou a dizer "Glosa Resolvida" sem dizer o
 * que resolveu.
 *
 * A correção não é encurtar o texto: é dar ao número um lugar próprio (o selo
 * da coluna Guia, alimentado por `AuditoriaAssimItem.vinculo`) e então tirar a
 * prosa duplicada da legenda, devolvendo a linha ao motivo da recusa. Este
 * módulo é a segunda metade disso, isolada do componente porque é regra sobre
 * texto e merece teste.
 */

/**
 * O separador exato do ramo de glosa coberta. Literal, não regex: o texto vem
 * de um `concat` no SQL e não varia. Se um dia variar, é melhor a legenda ficar
 * longa demais do que curta demais — o corte silencioso é que seria o bug.
 */
export const MARCA_COBERTURA = ' · Coberta pela guia '

/**
 * Devolve a observação sem o trecho da cobertura.
 *
 * Chamar SÓ quando o vínculo está de fato na mão e o número já aparece em outro
 * lugar da linha. Sem o selo, este trecho é o único carregador do fato — e
 * truncado é melhor que ausente.
 */
export function semTrechoDeCobertura(texto: string): string {
  const corte = texto.indexOf(MARCA_COBERTURA)
  return corte === -1 ? texto : texto.slice(0, corte)
}
