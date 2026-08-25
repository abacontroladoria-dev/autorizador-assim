// O vocabulário da TiTa para "o que aconteceu com a sessão", em um só lugar.
//
// São as colunas "Status" (status_execucao) e "Justificativa" de
// csv_grade_profissionais. Elas parecem texto de exibição e não são: `Status` é
// o que decide se a sessão gera diária (PPD), bônus ETA e PA — ver `cancelado`
// em calculo.ts. Ler o rótulo errado move dinheiro.
//
// ─── As duas gerações de rótulo ───────────────────────────────────────────────
//
// Até 21/08/2026 a TiTa dizia:
//
//   Status         Justificativa
//   Cancelado      Falta do Paciente | Falta do Profissional | Falta de Ambos
//
// De 24/08/2026 em diante, os três motivos passaram a ser:
//
//   Não realizado — paciente | Não realizado — prestador | Não realizado — clínica
//
// A base histórica NÃO foi reescrita, então as duas gerações convivem para
// sempre e as duas continuam válidas. Medido em 2026-08-24 sobre as 187.079
// linhas da tabela, todo o vocabulário já existente:
//
//   126.313  (null)              — execução ainda não capturada
//    22.824  Planejado/Pendente
//    16.984  Em Conflito
//    15.365  Realizado
//     5.000  Cancelado + Falta do Paciente
//       355  Cancelado + Falta do Profissional
//       238  Cancelado + Falta de Ambos
//
// Duas consequências desse levantamento, das quais o resto do arquivo depende:
// o conjunto de rótulos de `Status` é fechado e pequeno, e 'Cancelado' nunca
// aparece sem justificativa (não existe linha em que o motivo seja mudo).
//
// ─── Por que um módulo próprio ────────────────────────────────────────────────
//
// Isto morava em formatacao.ts como um `includes("cancel")` de uma linha. Não é
// formatação: é a tradução entre o vocabulário de um sistema externo e as
// decisões de pagamento deste. Externo quer dizer que muda sem avisar — mudou
// em 24/08/2026 —, e o que muda sem avisar precisa de um lugar único, com o
// histórico à vista e testes próprios (ver rotulosExecucao.test.ts).

/** Rótulo comparável: sem acento, minúsculo, espaços colapsados, traço unificado.
 *
 * O traço não é detalhe: os rótulos novos usam travessão ("Não realizado —
 * paciente"), e quem digitar hífen simples quer dizer a mesma coisa. Os pontos
 * de código cobertos são de U+2010 a U+2015 (hífen tipográfico até barra
 * horizontal), o menos matemático (U+2212) e o hífen-menos comum.
 */
const normRotulo = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―−-]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()

/**
 * O que a coluna `Status` afirma sobre a sessão.
 *
 * "ausente" é vazio/NULL — a captura de execução ainda não alcançou a linha, o
 * que é normal em período recente (ver DIAS_EVOLUCAO_EM_TRANSITO em
 * gradeRemuneracao.ts). "desconhecido" é o caso que interessa: texto presente
 * que este código não sabe ler. Os dois são "não sei", mas só o segundo é
 * sintoma de que a TiTa mudou o vocabulário outra vez.
 */
export type ResultadoExecucao =
  | "realizado"
  | "nao_realizado"
  | "pendente"
  | "conflito"
  | "ausente"
  | "desconhecido"

export function classificarStatusExecucao(status: unknown): ResultadoExecucao {
  const s = normRotulo(status)
  if (!s) return "ausente"
  // "nao realizad*" antes de "realizado": o segundo é substring do primeiro, e a
  // ordem inversa classificaria toda sessão não realizada como realizada — o
  // erro mais caro que este arquivo pode cometer.
  if (s.includes("nao realizad")) return "nao_realizado"
  if (s.includes("cancel")) return "nao_realizado"
  if (s.includes("realizad")) return "realizado"
  if (s.includes("conflito")) return "conflito"
  if (s.includes("planejado") || s.includes("pendente")) return "pendente"
  return "desconhecido"
}

/**
 * A sessão não aconteceu.
 *
 * Aceita as duas gerações e é indiferente à coluna de origem: o rótulo novo é
 * reconhecido venha ele em `Status` ou em `Justificativa`, porque quem consome
 * não tem como saber onde a TiTa decidiu colocá-lo.
 *
 * Mantém o nome histórico (`isCancelado`) de propósito: é o vocabulário do
 * resto do código e da própria tela, onde a classificação exibida é
 * "Cancelado". Trocar o nome renomearia o que aparece para o usuário, que é uma
 * decisão de produto e não desta correção.
 */
export const isCancelado = (v: unknown): boolean =>
  classificarStatusExecucao(v) === "nao_realizado"

/** De quem foi a ausência. "outro" = não aconteceu, motivo ilegível. */
export type MotivoNaoRealizado = "paciente" | "prestador" | "clinica" | "ambos" | "outro"

const NAO_REALIZADO = "nao realizad\\w*"
// Travessão já virou "-" em normRotulo; ":" e "(" entram por tolerância a
// variações de digitação que não mudam o sentido.
const LIGACAO = " ?[-:(] ?"

const motivoNovo = (alternativas: string) =>
  new RegExp(`${NAO_REALIZADO}${LIGACAO}(?:${alternativas})`)

// Uma linha por motivo: à esquerda o rótulo antigo (justificativa), à direita o
// novo. 'profissional'/'terapeuta' entram junto de 'prestador' porque as três
// palavras já apareceram para a mesma pessoa em telas diferentes deste sistema.
const REGRAS: Array<[MotivoNaoRealizado, RegExp[]]> = [
  ["paciente",  [/falta do paciente/,                        motivoNovo("paciente")]],
  ["prestador", [/falta do (profissional|prestador|terapeuta)/, motivoNovo("prestador|profissional|terapeuta")]],
  ["clinica",   [/falta da clinica/,                         motivoNovo("clinica")]],
  ["ambos",     [/falta de ambos/,                           motivoNovo("ambos")]],
]

/**
 * Quem faltou, lido de todos os textos que podem carregar o motivo.
 *
 * Recebe os pedaços (justificativa, status) e olha o conjunto: no rótulo antigo
 * o motivo estava na justificativa, no novo ele está no próprio status — e pode
 * vir em qualquer dos dois.
 *
 * `null` significa "não é uma sessão não realizada". "outro" significa "não
 * aconteceu, mas o motivo não foi reconhecido" — estado que não existe em
 * nenhuma das 187.079 linhas de hoje (toda 'Cancelado' tem justificativa) e que
 * portanto só pode aparecer se a TiTa mudar o vocabulário de novo.
 */
export function motivoNaoRealizado(...partes: unknown[]): MotivoNaoRealizado | null {
  const s = normRotulo(partes.filter(p => p !== null && p !== undefined && p !== "").join(" "))
  if (!s) return null
  for (const [motivo, padroes] of REGRAS) {
    if (padroes.some(p => p.test(s))) return motivo
  }
  return partes.some(p => isCancelado(p)) ? "outro" : null
}

/**
 * Foi o PACIENTE quem não veio — o que define "Presença TiTa" na conferência
 * (ver presencaTita em relatorio.ts).
 *
 * Falta de prestador, da clínica ou de ambos não entra aqui, exatamente como
 * antes: o antecessor desta função comparava a justificativa com "falta do
 * paciente" e só com ela. 'Falta de Ambos' é o caso limítrofe — o paciente
 * também não veio —, e continua fora de propósito: mudar isso mexeria no que
 * 238 linhas históricas exibem, o que é decisão de produto, não desta correção.
 */
export const isFaltaDoPaciente = (...partes: unknown[]): boolean =>
  motivoNaoRealizado(...partes) === "paciente"

/**
 * Rótulos de `Status` que a grade trouxe e este código não sabe ler — únicos, na
 * ordem em que apareceram, no texto original (é o que a pessoa vai procurar na
 * TiTa e o que o time técnico precisa para ensinar o rótulo novo).
 *
 * É a rede que faltava. As funções acima resolvem a mudança de 24/08/2026;
 * esta resolve a PRÓXIMA, que ninguém vai anunciar: rótulo ilegível deixa de
 * ser silêncio (com a sessão passando por realizada e gerando pagamento) e
 * passa a barrar a leitura da grade. Ver avaliarCoberturaGrade em
 * gradeRemuneracao.ts e parseGradeCsv em uploadParsers.ts.
 */
export function rotulosDeExecucaoDesconhecidos(valores: Iterable<unknown>): string[] {
  const vistos = new Set<string>()
  const amostra: string[] = []
  for (const v of valores) {
    if (classificarStatusExecucao(v) !== "desconhecido") continue
    const texto = String(v ?? "").trim()
    const chave = normRotulo(texto)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    amostra.push(texto)
  }
  return amostra
}

/**
 * O veredicto de reprovação por rótulo ilegível — estruturalmente compatível
 * com `VeredictoGrade` de gradeRemuneracao.ts (mesmo formato `{ ok, resumo,
 * erro, dica, quantidade }`), mas definido AQUI e não lá.
 *
 * O motivo de morar neste módulo, e não em gradeRemuneracao.ts, que é quem o
 * consome: esta é a única peça da guarda que faz JUÍZO DE VOCABULÁRIO — decidir
 * se o texto que veio é dos que este sistema entende. Isso é o assunto deste
 * arquivo. gradeRemuneracao.ts entra depois, só para decidir ONDE no pipeline de
 * reprovações esse juízo se encaixa (antes de tudo — ver o comentário de
 * avaliarCoberturaGrade). Separar assim também é o que torna a regra testável
 * sem arrastar para o teste as consultas ao Supabase que gradeRemuneracao.ts
 * carrega (@/lib/grade/fonte) — este arquivo não importa nada fora do próprio
 * domínio, de propósito.
 *
 * Só o texto muda por `contexto` ("pagamento" vs. "tratativas"), como no resto
 * das guardas de gradeRemuneracao.ts — a decisão de reprovar é a mesma.
 */
export type VeredictoRotuloGrade =
  | null
  | { ok: false; resumo: string; erro: string; dica: string; quantidade: number }

export function veredictoRotuloDesconhecido(
  grade: { rotulosDesconhecidos: string[]; linhasRotuloDesconhecido: number },
  contexto: "pagamento" | "tratativas" = "pagamento",
): VeredictoRotuloGrade {
  if (grade.linhasRotuloDesconhecido <= 0) return null

  const n = grade.linhasRotuloDesconhecido
  const lista = grade.rotulosDesconhecidos.map(r => `"${r}"`).join(", ")
  const dePagamento = contexto === "pagamento"

  return {
    ok: false,
    resumo: "Rótulo de execução desconhecido",
    quantidade: n,
    erro: `${n === 1 ? "Uma linha" : `${n} linhas`} do período ${n === 1 ? "traz" : "trazem"} na coluna `
      + `"Status" um rótulo que este sistema não sabe ler: ${lista}. `
      + "Sem entender o rótulo não se sabe se a sessão aconteceu, e "
      + (dePagamento
        ? "sessão não realizada tratada como realizada gera diária, bônus ETA e PA indevidos."
        : "a contagem de adesão sairia sobre sessões que talvez não tenham acontecido."),
    // Diz também o que NÃO resolve. As outras reprovações oferecem o CSV como
    // saída; aqui ele traz exatamente o mesmo rótulo, e mandar tentar por lá
    // seria empurrar a pessoa para o mesmo erro por um caminho mais longo.
    dica: "A TiTa mudou o vocabulário da coluna — foi o que aconteceu em 24/08/2026, quando "
      + "'Cancelado' virou 'Não realizado — paciente/prestador/clínica'. Avise o time técnico: o rótulo "
      + "novo precisa ser ensinado em lib/remuneracao/rotulosExecucao.ts. Recarregar não resolve, e o CSV "
      + "exportado da TiTa traz o mesmo rótulo.",
  }
}
