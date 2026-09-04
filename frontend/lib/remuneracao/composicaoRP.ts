// Regra de composição da remuneração da tela Rem. Mês - Total (/relacionamento-
// prestador/rp), no padrão de detalhamento em modal (docs/padrao-detalhamento-modal.md).
//
// Como ./evolucao.ts, este módulo é PURO: só `import type`, nenhum import de
// runtime além de bucketDaSessao (que também é pura e sem dependências). Roda
// sob `node --test` sem arrastar calcularRemuneracaoReal.
//
// ═══════════════════════════════════════════════════════════════════════════
// A conta, em dois trilhos
//
//   sessões:  Agendadas − Canceladas − Cedidas          = Válidas
//             Válidas   + Substituições realizadas      = Base remunerável
//             Evolução % = Remuneradas ÷ Base remunerável
//
//   R$:       PA + PPD + Bônus ETA + PE                 = Confirmado
//             Confirmado + Valor fixo de banco de horas = Total a pagar
//
// A substituição NÃO é exceção: assumir a sessão de outra pessoa aumenta o que
// esta pessoa tem a entregar, então entra no denominador. O card antigo somava
// as substituições só no numerador (`baseCalc = agendadas − canceladas −
// substituidoPorOutro`, com `agendadas` incrementado apenas no ramo `if (agenda)`
// de calculo.ts:986, e `substituicoesRealizadas` no registro DE OUTRA PESSOA em
// calculo.ts:1035) — quem substituía mais do que tinha de pendência passava de
// 100%.
//
// Nada aqui reclassifica sessão nem recalcula dinheiro. A partição vem de
// `bucketDaSessao` — a MESMA função que a Análise de Evolução usa —, e os
// valores em R$ já vêm prontos de calcularRemuneracaoReal. Esta camada só os
// desmonta nas parcelas que a tela precisa mostrar.
// ═══════════════════════════════════════════════════════════════════════════

import { bucketDaSessao, type BucketSessao } from "./evolucao"
import type { ProfRemunReal, SessaoComPapel } from "./calculo"

// Reexportados para a tela ter uma porta só: quem desenha o /rp importa a
// partição e a conta do mesmo módulo, sem precisar saber que a classificação
// nasceu na Análise de Evolução.
export { bucketDaSessao }
export type { BucketSessao }

export type ComposicaoRP = {
  // ─── Base de sessões ──────────────────────────────────────────────────────
  /** Tudo que estava na agenda deste profissional no período. */
  agendadas: number
  /** Canceladas/feriado — não aconteceram, saem da base. */
  canceladas: number
  /** Cedidas a outro profissional: quem assumiu é que recebe. Saem da base. */
  cedidas: number
  /** agendadas − canceladas − cedidas. */
  validas: number
  /** Sessões de outros profissionais que este assumiu e evoluiu. */
  substituicoes: number
  /** validas + substituicoes — o denominador. */
  baseRemuneravel: number
  /** Evoluções próprias + substituições realizadas — o numerador. */
  remuneradas: number
  /** Aconteceu (ou não foi cancelada) e segue sem registro: pendentes + naoEvoluidas. */
  pendentes: number
  /** Os dois lados somados — igual a `p.inconsistencias`. */
  inconsistencias: number
  /**
   * Inconsistências do lado "Agenda": a sessão era desta pessoa, já está dentro
   * de `baseRemuneravel`, e é daí que vem a lacuna entre numerador e denominador.
   */
  inconsistenciasProprias: number
  /**
   * Substituições que a captura não confirma — tipicamente "Evolução em conflito",
   * duas pessoas evoluindo o mesmo agendamento. Ficam FORA de `substituicoes`,
   * de `baseRemuneravel` e de `remuneradas`: ninguém recebe até a autoria ser
   * decidida (calculo.ts:1039-1041).
   *
   * Existe para a tela poder DIZER isso. Sem este número, o modal mostraria
   * "0 substituições" ao lado de uma linha com Origem "Substituição".
   */
  substituicoesEmConferencia: number
  /** remuneradas ÷ baseRemuneravel (0 quando não há base). Nunca passa de 100. */
  pct: number

  // ─── Parcelas em R$ ───────────────────────────────────────────────────────
  /**
   * Soma do PA das linhas remuneradas — contado A PARTIR DA PARTIÇÃO, para o
   * total da conta ser exatamente a soma do que a tabela mostra linha a linha.
   */
  valorPA: number
  /** Pagamento por Período/Diária (`p.diariaPeriodo`). */
  ppd: number
  /** Bônus ETA do período (`p.etaBonusPeriodo`). */
  bonusEta: number
  /**
   * PE proporcional (`p.pe`). NÃO é a PEP da aba Entregas PEP: aquela é uma
   * apuração à parte (pep_apuracao_mensal), não entra em `valorConfirmado` e
   * não é parcela desta conta.
   */
  pe: number
  /** PA + PPD + ETA + PE, direto de calculo.ts:1100. */
  valorConfirmado: number
  /** Soma dos contratos vigentes em banco de horas. 0 = não cadastrado. */
  valorFixoBancoHoras: number
  /** valorConfirmado + valorFixoBancoHoras — o que a empresa paga no mês. */
  valorTotalAPagar: number

  // ─── Leitura do contrato ──────────────────────────────────────────────────
  /** Tem contrato vigente em banco de horas (puro ou híbrido). */
  emBancoDeHoras: boolean
  /** Banco de horas PURO: o valor fixo é a remuneração inteira, sem PA/PPD/ETA/PE. */
  soFixo: boolean
  /**
   * Contrato marcado como banco de horas sem valor total cadastrado: o PA foi
   * zerado e não há fixo no lugar. É pendência de cadastro, não R$ 0.
   */
  fixoNaoCadastrado: boolean
  /**
   * As parcelas não fecham com `valorConfirmado`. Só acontece se a partição e os
   * ramos de calculo.ts divergirem — a tela avisa em vez de mostrar calada um
   * total diferente da soma das linhas.
   */
  paDivergente: boolean

  /**
   * `valorPA` quebrado por função/especialidade do contrato — para quem tem
   * mais de um PA (ex.: Coordenador de Caso a R$35 e Aplicador ABA (PS) a
   * R$30), a soma sozinha esconde qual parcela veio de qual contrato. Mesma
   * partição de `valorPA` (comEvolucao + substituicao), agrupada por
   * `s.funcaoPA || s.especialidade`. Um item só quando há um único PA.
   */
  paPorContrato: { label: string; count: number; rate: number; total: number }[]

  // ─── Listas ───────────────────────────────────────────────────────────────
  porBucket: Record<BucketSessao, SessaoComPapel[]>
  /**
   * TODAS as sessões do período, em ordem de data — o escopo da aba "Todos".
   * Inclui o que não entra na conta: são as colunas da tabela que dizem, linha
   * por linha, o que conta e o que não.
   */
  todas: SessaoComPapel[]
}

const ORDEM_BUCKETS: BucketSessao[] = [
  "comEvolucao", "substituicao", "pendente", "cancelada", "cedida", "inconsistencia",
]

const porDataHora = (a: SessaoComPapel, b: SessaoComPapel) =>
  (a.data ?? "").localeCompare(b.data ?? "") || (a.hora ?? "").localeCompare(b.hora ?? "")

/** Diferença menor que meio centavo é arredondamento de ponto flutuante, não drift. */
const CENTAVO = 0.005

/**
 * Parte as sessões do profissional nos buckets e devolve a composição da
 * remuneração. Os totais de sessão fecham por construção: `agendadas` é a
 * contagem das entradas de agenda dentro da própria partição (não o contador
 * `p.agendadas`, que é igual mas vive fora dela), então
 * `agendadas − canceladas − cedidas = validas` continua exato mesmo se algo
 * mudar em calculo.ts.
 */
export function composicaoRP(p: ProfRemunReal): ComposicaoRP {
  const porBucket: Record<BucketSessao, SessaoComPapel[]> = {
    comEvolucao: [], substituicao: [], pendente: [], cancelada: [], cedida: [], inconsistencia: [],
  }
  for (const s of p.sessoes) porBucket[bucketDaSessao(s)].push(s)
  for (const b of ORDEM_BUCKETS) porBucket[b].sort(porDataHora)

  const agendadas = p.sessoes.reduce((n, s) => n + (s.papel === "Agenda" ? 1 : 0), 0)
  const canceladas = porBucket.cancelada.length
  const cedidas = porBucket.cedida.length
  const validas = agendadas - canceladas - cedidas
  const substituicoes = porBucket.substituicao.length
  const baseRemuneravel = validas + substituicoes
  const remuneradas = porBucket.comEvolucao.length + substituicoes

  // Inconsistência do lado "Agenda" está dentro de `baseRemuneravel` (a sessão
  // era desta pessoa); a do lado "Substituição realizada" não — lá a sessão
  // pertence à agenda de outra e a captura não confirma que esta assumiu.
  const incProprias = porBucket.inconsistencia.filter(s => s.papel === "Agenda")

  // PA somado da própria partição: são exatamente os dois ramos em que
  // calculo.ts fez `valorConfirmado += pa` (:1009 evolução própria, :1036
  // substituição realizada), e é o que a tabela do modal mostra por linha.
  const sessoesRemuneradasPA = [...porBucket.comEvolucao, ...porBucket.substituicao]
  const valorPA = sessoesRemuneradasPA.reduce((soma, s) => soma + (s.valorPA ?? 0), 0)

  const porContratoMap = new Map<string, { label: string; count: number; rate: number; total: number }>()
  for (const s of sessoesRemuneradasPA) {
    const label = s.funcaoPA || s.especialidade || "PA"
    const item = porContratoMap.get(label) ?? { label, count: 0, rate: s.valorPA ?? 0, total: 0 }
    item.count++
    item.total += s.valorPA ?? 0
    item.rate = s.valorPA ?? item.rate
    porContratoMap.set(label, item)
  }
  const paPorContrato = [...porContratoMap.values()]

  const emBancoDeHoras = p.modalidade !== "atendimento"
  const soFixo = p.modalidade === "banco_horas"

  return {
    agendadas, canceladas, cedidas, validas, substituicoes, baseRemuneravel, remuneradas,
    pendentes: porBucket.pendente.length,
    inconsistencias: porBucket.inconsistencia.length,
    inconsistenciasProprias: incProprias.length,
    substituicoesEmConferencia: porBucket.inconsistencia.length - incProprias.length,
    pct: baseRemuneravel > 0 ? (remuneradas / baseRemuneravel) * 100 : 0,

    valorPA,
    paPorContrato,
    ppd: p.diariaPeriodo,
    bonusEta: p.etaBonusPeriodo,
    pe: p.pe,
    valorConfirmado: p.valorConfirmado,
    valorFixoBancoHoras: p.valorFixoBancoHoras,
    valorTotalAPagar: p.valorTotalAPagar,

    emBancoDeHoras,
    soFixo,
    fixoNaoCadastrado: emBancoDeHoras && p.valorFixoBancoHoras <= 0,
    paDivergente:
      Math.abs(valorPA + p.diariaPeriodo + p.etaBonusPeriodo + p.pe - p.valorConfirmado) > CENTAVO,

    porBucket,
    todas: [...p.sessoes].sort(porDataHora),
  }
}

/**
 * "PE proporcional" (`c.pe`) é um mecanismo legado: só produz valor se
 * alguém subir manualmente um CSV separado ("relatório de PE"), upload que
 * saiu do fluxo normal desde que a PEP passou a ser apurada por entrega na
 * aba Entregas PEP. Na prática `c.pe` é sempre 0. Esta função corrige o
 * total exibido/exportado pra refletir a PEP real (`pep_apuracao_mensal`),
 * sem tocar em `composicaoRP()` — mantém o módulo puro e testável sozinho.
 *
 * `isCC` é o mesmo critério já usado em CardRemunRP.tsx/documento.ts:
 * `p.sessoes.some(s => s.especialidade === "Coordenador de Caso")` — a
 * mesma população que aparece como Analista do Comportamento na tela PEP.
 *
 * `pepApurada: false` só acontece quando `isCC` e não existe nenhuma linha
 * em pep_apuracao_mensal pra esse prestador/competência ainda — sinal pra
 * quem chama mostrar aviso em vez de tratar como R$0,00 silencioso.
 */
export type CorrecaoPEP = {
  /** O que mostrar no lugar do card "PE proporcional" — já é a PEP real. */
  pepValor: number
  /** false = ninguém abriu a aba Entregas PEP pra este prestador/mês ainda. */
  pepApurada: boolean
  /** Substitui `c.valorConfirmado` na equação (PA+PPD+ETA+PEP). */
  valorConfirmado: number
  /** Substitui `c.valorTotalAPagar` — o número real a pagar. */
  valorTotalAPagar: number
}

export function corrigirTotalComPEP(
  c: ComposicaoRP,
  isCC: boolean,
  pepInfo: { potencial: number; alcancado: number } | undefined
): CorrecaoPEP {
  if (!isCC) {
    return { pepValor: c.pe, pepApurada: true, valorConfirmado: c.valorConfirmado, valorTotalAPagar: c.valorTotalAPagar }
  }
  const pepValor = pepInfo?.alcancado ?? 0
  return {
    pepValor,
    pepApurada: !!pepInfo,
    valorConfirmado: c.valorConfirmado - c.pe + pepValor,
    valorTotalAPagar: c.valorTotalAPagar - c.pe + pepValor,
  }
}
