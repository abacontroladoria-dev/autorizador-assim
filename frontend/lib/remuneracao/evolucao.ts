// Regra de responsabilidade de evolução da tela Análise de Evolução.
//
// Módulo separado de tratativas.ts de propósito: aqui não há NENHUM import de
// runtime (só tipos, que somem na compilação). Isso mantém a regra pura —
// testável isolada, sem arrastar calcularRemuneracaoReal — e deixa claro que
// ela não toca em nada monetário.

import type { ProfTratativas, SessaoTratativa } from "./tratativas"

// ═══════════════════════════════════════════════════════════════════════════
// Composição da responsabilidade de evolução
//
// Regra única desta tela (card por profissional e modal de análise leem daqui,
// nunca recalculam):
//
//   Agendamentos previstos − Canceladas − Cedidas a outro         = Válidos
//   Válidos + Substituições realizadas                            = Esperadas
//   Evolução %  =  Com evolução ÷ Esperadas
//
// Substituição NÃO é categoria de exceção: assumir a sessão de outra pessoa
// AUMENTA a quantidade de evoluções que este profissional precisa registrar,
// então entra no denominador. É o que impede o percentual de passar de 100%
// (antes o numerador somava as substituições e o denominador não).
//
// Nada aqui reclassifica sessão. `classificacao` já vem de
// classificarSessaoReal (lib/remuneracao/relatorio.ts) e os buckets abaixo são
// a MESMA partição que calculo.ts usa para incrementar os contadores — cada
// branch de `bucketDaSessao` corresponde a um `a.<contador>++` de
// calcularRemuneracaoReal (ver calculo.ts:1001-1023 e :1029-1040). Por isso as
// contagens das abas do modal e os números da composição não podem divergir:
// são a mesma partição contada de dois jeitos.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classificações em que a captura não dá para confiar — não contam como
 * evolução nem como pendência, vão para conferência manual. Mesmo conjunto que
 * `eInc` em calculo.ts:983.
 */
const CLASSES_INCONSISTENTES = new Set([
  "Evolução sem presença", "Cancelado evoluído", "Evolução sem agendamento", "Evolução em conflito",
])

export type BucketSessao =
  /** Evoluída pelo próprio profissional escalado → `evoluidasProprias`. */
  | "comEvolucao"
  /** Sessão de outra pessoa que este profissional evoluiu → `substituicoesRealizadas`. */
  | "substituicao"
  /** Aconteceu (ou não foi cancelada) e segue sem evolução → `pendentes` + `naoEvoluidas`. */
  | "pendente"
  /** Não aconteceu: cancelada/feriado. Não exige evolução → `canceladas`. */
  | "cancelada"
  /** Estava na agenda deste profissional, mas outro evoluiu → `substituidoPorOutro`. */
  | "cedida"
  /** Captura contraditória, precisa conferência → `inconsistencias`. */
  | "inconsistencia"

export function bucketDaSessao(s: SessaoTratativa): BucketSessao {
  const cls = s.classificacao ?? ""
  // Vem primeiro pelo mesmo motivo que em calculo.ts: a dúvida sobre a captura
  // vence qualquer outra leitura da linha.
  if (CLASSES_INCONSISTENTES.has(cls)) return "inconsistencia"
  // A entrada "Substituição realizada" e a entrada "Agenda" cedida compartilham
  // a classificação "Substituição" — o papel é o que separa quem assumiu de
  // quem deixou de fazer.
  if (s.papel === "Substituição realizada") return "substituicao"
  if (cls === "Substituição") return "cedida"
  if (cls === "Evolução normal" || cls === "Evolução duplicada") return "comEvolucao"
  if (cls === "Cancelado" || cls === "Feriado/Ponto Fac.") return "cancelada"
  return "pendente" // "Pendente retroativa" e "Não evoluído"
}

export type ComposicaoEvolucao = {
  /** Tudo que estava na agenda do profissional no período. */
  previstos: number
  /** Canceladas/feriado — não exigem evolução, saem do denominador. */
  canceladas: number
  /**
   * Substituídas por outro terapeuta (o rótulo na tela) — a responsabilidade da
   * evolução é de quem assumiu, então saem do denominador desta pessoa.
   */
  cedidas: number
  /** previstos − canceladas − cedidas. */
  validos: number
  /** Sessões de outros profissionais que este assumiu. */
  substituicoes: number
  /** validos + substituicoes — o denominador da evolução. */
  esperadas: number
  /** Evoluções próprias + substituições realizadas — o numerador. */
  comEvolucao: number
  pendentes: number
  inconsistencias: number
  /**
   * Inconsistências do lado "Agenda": a sessão era deste profissional. Já estão
   * dentro de `esperadas` e é delas que vem a lacuna entre numerador e denominador.
   */
  inconsistenciasProprias: number
  /**
   * Substituições que a captura não confirma — tipicamente "Evolução em conflito",
   * duas pessoas evoluindo o mesmo agendamento. Ficam FORA de `substituicoes`,
   * de `esperadas` e de `comEvolucao`: creditar evolução de autoria duvidosa é
   * exatamente o que a classificação se recusa a fazer (no /rp, ninguém recebe
   * até alguém decidir quem atendeu).
   *
   * Existe para a tela poder DIZER isso. Sem este número, o modal mostrava
   * "0 substituições" e, na aba de inconsistências, uma linha com Origem =
   * "Substituição" — as duas coisas verdadeiras, e nada ligando uma à outra.
   */
  substituicoesEmConferencia: number
  /** Percentual de evolução: comEvolucao ÷ esperadas (0 quando não há esperadas). */
  pct: number
  porBucket: Record<BucketSessao, SessaoTratativa[]>
  /**
   * TODAS as sessões do profissional no período, em ordem de data — o escopo da
   * aba "Todos" do modal. Inclui o que não entra na conta (canceladas, cedidas,
   * substituição em conferência): a coluna "Evolução" da tabela é que diz, linha
   * por linha, o que conta e o que não.
   */
  todas: SessaoTratativa[]
}

const ORDEM_BUCKETS: BucketSessao[] = ["comEvolucao", "substituicao", "pendente", "cancelada", "cedida", "inconsistencia"]

const porDataHora = (a: SessaoTratativa, b: SessaoTratativa) =>
  (a.data ?? "").localeCompare(b.data ?? "") || (a.hora ?? "").localeCompare(b.hora ?? "")

/**
 * Parte as sessões do profissional nos buckets acima e devolve a composição da
 * responsabilidade. Os totais fecham por construção: `previstos` é a contagem
 * das entradas de agenda (não o contador `agendadas`, que é igual mas vive
 * fora desta partição), então `previstos − canceladas − cedidas = validos` é
 * exato mesmo se algo mudar em calculo.ts.
 */
export function composicaoEvolucao(p: ProfTratativas): ComposicaoEvolucao {
  const porBucket: Record<BucketSessao, SessaoTratativa[]> = {
    comEvolucao: [], substituicao: [], pendente: [], cancelada: [], cedida: [], inconsistencia: [],
  }
  for (const s of p.sessoes) porBucket[bucketDaSessao(s)].push(s)
  for (const b of ORDEM_BUCKETS) porBucket[b].sort(porDataHora)

  const previstos = p.sessoes.reduce((n, s) => n + (s.papel === "Agenda" ? 1 : 0), 0)
  const canceladas = porBucket.cancelada.length
  const cedidas = porBucket.cedida.length
  const validos = previstos - canceladas - cedidas
  const substituicoes = porBucket.substituicao.length
  const esperadas = validos + substituicoes
  const comEvolucao = porBucket.comEvolucao.length + substituicoes

  // Inconsistência do lado "Agenda" está dentro de `esperadas` (a sessão era
  // deste profissional); a do lado "Substituição realizada" não — lá a sessão
  // pertence à agenda de outra pessoa e a captura não confirma que esta
  // assumiu. Só as primeiras entram no escopo de "Todos".
  const incProprias = porBucket.inconsistencia.filter(s => s.papel === "Agenda")

  const todas = [...p.sessoes].sort(porDataHora)

  return {
    previstos, canceladas, cedidas, validos, substituicoes, esperadas, comEvolucao,
    pendentes: porBucket.pendente.length,
    inconsistencias: porBucket.inconsistencia.length,
    inconsistenciasProprias: incProprias.length,
    substituicoesEmConferencia: porBucket.inconsistencia.length - incProprias.length,
    pct: esperadas > 0 ? (comEvolucao / esperadas) * 100 : 0,
    porBucket,
    todas,
  }
}
