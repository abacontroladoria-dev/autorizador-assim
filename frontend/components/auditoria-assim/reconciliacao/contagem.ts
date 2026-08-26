import type {
  AutorizacaoAssimSemana,
  ContagemPendencias,
  PlacarTuss,
} from '../types'

/**
 * A aritmética da reconciliação — separada do hook porque é PURA.
 *
 * Estas funções moravam em `useAnaliseReincidencia.ts`, e ficar lá as tornava
 * intestáveis: aquele arquivo importa `services/auditoria-assim.service`, que
 * constrói um cliente Supabase no import. Qualquer teste que tocasse
 * `contarPendencias` morria montando um cliente HTTP para somar números.
 *
 * É o mesmo movimento que `guiasSubstituidas` já tinha feito para
 * `cobertura.ts`, e pela mesma razão. O hook segue reexportando tudo, então
 * nenhum consumidor precisou mudar de import.
 */

/**
 * Só `Liberado` cru consumiu cota.
 *
 * Comparação EXATA, e não por prefixo: `Liberado *` é o rótulo que a ASSIM usa
 * para autorização **cancelada** — é assim que a migration 20260528120000 a
 * traduz para a situação CANCELADA, e é por isso que `get_guias_orfas` filtra
 * `status = 'Liberado'` e não `like 'Liberado%'`. Casar por prefixo contava
 * cancelada como cota gasta e inventava excedente onde não havia.
 */
export function autorizacaoLiberada(status: string | null): boolean {
  return (status ?? '').trim() === 'Liberado'
}

/** A autorização saiu e foi desfeita. Não consumiu cota e não pede nada. */
export function autorizacaoCancelada(status: string | null): boolean {
  return (status ?? '').trim() === 'Liberado *'
}

/**
 * Os três estados de guia que esta tela existe para vigiar.
 *
 * `ehOrfa` é injetado, e não decidido aqui, pelo motivo do cabeçalho: a
 * definição de órfã mora em `get_guias_orfas`.
 *
 * `substituidas` são as guias que uma triagem aposentou: a recusa (ou o
 * cancelamento) daquela sessão foi coberta por uma autorização externa, e o par
 * inteiro parou de pedir trabalho. Sem este conjunto, vincular uma guia baixava
 * "sem vínculo" e "faltando" e deixava "glosas" de pé — a linha continuava na
 * listagem, com uma pendência que a grade não conseguia mais apontar (a sessão
 * virou GLOSA_RESOLVIDA e sumiu dos cartões marcados). O número dizia 1 e a
 * faixa de semanas dizia "·", que é a divergência que esta tela existe para
 * caçar, virada contra ela mesma.
 *
 * A guia substituída NÃO deixa de existir: ela continua no histórico, e a sessão
 * continua dizendo GLOSA RESOLVIDA. O que ela deixa de ser é fila de trabalho.
 */
export function calcularLedger(
  autorizacoes: AutorizacaoAssimSemana[],
  ehOrfa: (guia: string) => boolean,
  substituidas: ReadonlySet<string> = new Set()
) {
  const orfas = new Set<string>()
  let glosas = 0
  let canceladas = 0
  for (const a of autorizacoes) {
    if (ehOrfa(a.guia)) orfas.add(a.guia)
    if (substituidas.has(a.guia)) continue
    if (autorizacaoCancelada(a.status)) canceladas += 1
    else if (!autorizacaoLiberada(a.status)) glosas += 1
  }
  return { orfas, glosas, canceladas }
}

/**
 * As quatro espécies de pendência.
 *
 * `autorizacao-a-mais` é a UNIÃO de dois conjuntos de guias, não a soma de dois
 * números — e é essa a diferença que esta função existe para carregar.
 *
 * Até 2026-08-26 eram cinco espécies, e "sem vínculo" (guias que sobraram do
 * pareamento) e "sobrando" (o saldo `liberadas − agendadas` por TUSS) eram
 * somadas. Mas a guia que sobra do pareamento é, quase sempre, exatamente a que
 * estoura a cota: o mesmo objeto entrava duas vezes no `total`, que é o número
 * que a operação lê para dimensionar trabalho. Contar a união desfaz isso sem
 * perder nenhum dos dois casos legítimos de divergência — a órfã que não
 * estourou cota (a sessão que ela cobriria virou falta) e a excedente que não é
 * órfã (guia já triada sai de `get_guias_orfas`, e o placar continua vendo
 * liberada a mais).
 *
 * `excedentes` vem de `excedentesDoPlacar`, que já resolve o saldo por TUSS de
 * volta para guias nomeadas. É por existir esse de-para que a união é possível:
 * sem ele, "sobrando" seria um número solto, sem identidade para deduplicar.
 *
 * `faltando` lê `naoSolicitada`, e NÃO `faltante`, pelo mesmo princípio uma
 * camada adiante: a sessão glosada está descoberta (logo entra em `faltante`),
 * mas a recusa que a descobriu já é contada aqui como `glosa`. Somar as duas
 * dava "5 glosas + 9 não solicitadas" para nove sessões — ver
 * `sessaoNaoSolicitada`, que carrega o caso.
 */
export function contarPendencias(
  placar: PlacarTuss[],
  ledger: { orfas: ReadonlySet<string>; glosas: number; canceladas: number },
  excedentes: ReadonlySet<string>
): ContagemPendencias {
  let faltando = 0
  for (const p of placar) faltando += p.naoSolicitada

  const aMais = new Set(ledger.orfas)
  for (const guia of excedentes) aMais.add(guia)

  const contagem: ContagemPendencias = {
    glosa: ledger.glosas,
    cancelamento: ledger.canceladas,
    'autorizacao-a-mais': aMais.size,
    faltando,
    total: 0,
  }
  contagem.total =
    contagem.glosa + contagem.cancelamento + contagem['autorizacao-a-mais'] + faltando
  return contagem
}

/**
 * As guias que estouraram a cota — nomeadas, não contadas.
 *
 * `excedente` é um número por TUSS ("6 liberadas para 5 sessões"), e um número
 * não se destaca num cartão. A atribuição é posicional pela `data_execucao`:
 * dentro do TUSS, as ÚLTIMAS `excedente` liberações são as que passaram do
 * agendado. É a mesma ordem que o pareamento do banco usa para decidir qual
 * autorização casa com qual sessão, então isto não inventa critério novo — lê o
 * mesmo que a ASSIM leu quando recusou a seguinte por reincidência.
 *
 * Só liberação entra: recusada não gastou cota, e cancelada foi desfeita.
 */
export function excedentesDoPlacar(
  placar: PlacarTuss[],
  autorizacoes: AutorizacaoAssimSemana[]
): Set<string> {
  const marcadas = new Set<string>()
  for (const p of placar) {
    if (p.excedente <= 0) continue
    const doTuss = autorizacoes
      .filter((a) => (a.codigo_tuss ?? '—') === p.codigo_tuss && autorizacaoLiberada(a.status))
      .sort((a, b) => (a.data_execucao ?? '').localeCompare(b.data_execucao ?? ''))
    for (const a of doTuss.slice(-p.excedente)) marcadas.add(a.guia)
  }
  return marcadas
}
