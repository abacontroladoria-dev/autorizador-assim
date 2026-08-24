import type { AuditoriaAssimItem } from '../types'

/**
 * Quando uma sessão conta como coberta — a regra, sem estado nenhum em volta.
 *
 * Mora aqui, e não dentro de `useAnaliseReincidencia`, por duas razões. O hook
 * importa os services, que importam o cliente do Supabase, e isso torna a regra
 * impossível de exercitar num teste de nó — a única parte deste trabalho que
 * fecha ou não fecha uma conta merece teste direto. E `grade.ts` precisa dela
 * para carimbar o cartão: as duas pontas lendo o mesmo arquivo é o que impede
 * o número do topo e a marca do cartão de discordarem sobre a mesma semana.
 */

/** Cota = quantas sessões daquele TUSS o paciente tem no período. Falta não conta. */
export const SITUACOES_SEM_SESSAO = new Set(['FALTA', 'FALTA_TERAPEUTA'])

/**
 * Os dois desfechos em que a sessão saiu coberta por uma liberação.
 *
 * Não é lista de conveniência: são exatamente os dois ramos que a migration
 * `20260821030000` põe no topo do `CASE` de `situacao` — `GLOSA_RESOLVIDA`
 * quando havia glosa e o vínculo a cobriu, `LIBERADA` quando não havia. Todo o
 * resto do vocabulário (não solicitada, glosa aberta, retorno não confirmado,
 * sincronizando, solicitação cancelada) é sessão que ninguém liberou.
 */
export const SITUACOES_COBERTAS = new Set(['LIBERADA', 'GLOSA_RESOLVIDA'])

/**
 * As situações em que a ASSIM DEU um veredito sobre a sessão.
 *
 * Elas continuam sem cobertura — ninguém as liberou —, mas o cartão diz o nome
 * do veredito em vez de "Sem cobertura", porque as duas coisas não são a mesma
 * pergunta. "Sem cobertura" é a AUSÊNCIA de resposta: não solicitada, retorno
 * não confirmado, sincronizando, solicitação cancelada. Aqui houve resposta, e
 * saber QUAL é o que decide o que fazer a seguir — glosa pede tratativa, e
 * `CANCELADA` (que é `status = 'Liberado *'`, a liberação que a ASSIM desfez)
 * pede uma autorização nova.
 *
 * `CANCELADA` entrou em 2026-08-24, reportada da tela: a sessão de 21/08 13:00
 * do Eric Gabriel Vitório Nunes aparecia como "Sem cobertura" e o operador lê
 * "Cancelada" em todo o resto do sistema. Nada muda na PENDÊNCIA — ela segue
 * contada e segue passível de vínculo com uma guia solta —, só a manchete.
 */
export const SITUACOES_COM_VEREDITO = new Set(['GLOSA', 'CANCELADA'])

/** O instante de uma sessão: "2026-08-24T08:00". Nulo quando falta a hora. */
function instanteSessao(s: AuditoriaAssimItem): string | null {
  if (!s.data_atendimento) return null
  const hora = s.hora_inicial?.slice(0, 5)
  return hora ? `${s.data_atendimento}T${hora}` : null
}

/**
 * A sessão já aconteceu e já passou dos 30 minutos de tolerância?
 *
 * Sem hora, o critério cai para o corte por DIA, mas estrito: nunca conta o
 * próprio dia, porque não há como saber se os 30 minutos já passaram.
 */
export function sessaoDecorrida(s: AuditoriaAssimItem, cutoff: string): boolean {
  const instante = instanteSessao(s)
  if (instante !== null) return instante <= cutoff
  return (s.data_atendimento ?? '') < cutoff.slice(0, 10)
}

/**
 * Esta sessão específica já ocorreu e ninguém a liberou.
 *
 * É o fato que faltava para a tela responder "QUAL sessão está com problema".
 * Até 2026-08-24 a única forma de "faltando" era o agregado por TUSS
 * (`decorridas − liberadas`), que diz QUANTAS e não diz quais — e um número que
 * ninguém consegue apontar não serve para quem precisa conferir a sessão.
 *
 * A regra usa a `situacao` que a própria RPC já resolveu, então ela não
 * reimplementa o pareamento: `get_auditoria_assim` decide o que é coberto (ver
 * `SITUACOES_COBERTAS`) e aqui só se lê o veredito.
 *
 * Falta não entra: sessão que não aconteceu não podia ser coberta, e cobrar
 * autorização dela é justamente um dos jeitos de estourar a cota.
 */
export function sessaoSemCobertura(s: AuditoriaAssimItem, cutoff: string): boolean {
  if (SITUACOES_SEM_SESSAO.has(s.situacao ?? '')) return false
  if (!sessaoDecorrida(s, cutoff)) return false
  return !SITUACOES_COBERTAS.has(s.situacao ?? '')
}
