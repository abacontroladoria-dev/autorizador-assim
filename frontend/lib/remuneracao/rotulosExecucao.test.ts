// Rótulos de execução da TiTa: as duas gerações têm de dar a MESMA resposta, e
// uma terceira geração tem de PARAR a tela em vez de ser adivinhada.
//
// Até 21/08/2026 uma sessão que não aconteceu chegava como Status 'Cancelado'
// + Justificativa 'Falta do Paciente' / 'Falta do Profissional' / 'Falta de
// Ambos'. De 24/08/2026 em diante a TiTa passou a usar 'Não realizado —
// paciente' / '— prestador' / '— clínica'. A base histórica não foi reescrita,
// então as duas convivem para sempre — e o teste guarda justamente isso.
//
// O que está em jogo é dinheiro: `cancelado` (isCancelado) é o que impede
// diária, ETA e PA de sessão que não ocorreu (ver calculo.ts). Se um rótulo
// novo passar batido, um dia inteiro de sessões não realizadas volta a gerar
// diária sem ninguém perceber.
//
// Roda no `npm test` (vitest), a partir de `frontend/`:
//
//   npx vitest run lib/remuneracao/rotulosExecucao.test.ts
//
// vitest, e não o runner nativo do Node de composicaoRP.test.ts: é o que o
// `npm test` do package.json executa, e teste que não entra na suíte padrão é
// teste que ninguém roda.

import { test } from "vitest"
import assert from "node:assert/strict"

import {
  classificarStatusExecucao, isCancelado, isFaltaDoPaciente,
  motivoNaoRealizado, rotulosDeExecucaoDesconhecidos, veredictoRotuloDesconhecido,
} from "./rotulosExecucao"
import { normalizarGradeParaSessao, type CsvGradeRow } from "./relatorio"

// Este arquivo importa só módulos PUROS (rotulosExecucao.ts, relatorio.ts) — de
// propósito, e não por acaso. gradeRemuneracao.ts (onde `avaliarCoberturaGrade`
// de fato mora) importa @/lib/grade/fonte para falar com o Supabase, e este
// projeto não tem um vitest.config.ts que resolva o alias "@/…" para os
// testes. A guarda de rótulo desconhecido foi por isso desenhada para viver
// aqui como função pura (`veredictoRotuloDesconhecido`) — gradeRemuneracao.ts
// só a chama; é dela que este arquivo testa a decisão.

// ─── Vocabulário ─────────────────────────────────────────────────────────────

// Todo o vocabulário medido na tabela em 24/08/2026 (187.079 linhas) mais os
// três rótulos novos. A tabela é a especificação: cada linha diz o texto e o
// que ele significa para o cálculo.
const VOCABULARIO: Array<[string, ReturnType<typeof classificarStatusExecucao>]> = [
  ["Realizado", "realizado"],
  ["Cancelado", "nao_realizado"],
  ["Em Conflito", "conflito"],
  ["Planejado/Pendente", "pendente"],
  ["", "ausente"],
  ["Não realizado — paciente", "nao_realizado"],
  ["Não realizado — prestador", "nao_realizado"],
  ["Não realizado — clínica", "nao_realizado"],
  // Travessão trocado por hífen e acento perdido: variações plausíveis de
  // digitação/codificação que não mudam o significado.
  ["Nao realizado - paciente", "nao_realizado"],
  ["NÃO REALIZADO — CLÍNICA", "nao_realizado"],
]

test("classificarStatusExecucao cobre todo o vocabulário conhecido", () => {
  for (const [rotulo, esperado] of VOCABULARIO) {
    assert.equal(classificarStatusExecucao(rotulo), esperado, `rótulo: ${rotulo || "(vazio)"}`)
  }
  assert.equal(classificarStatusExecucao(null), "ausente")
  assert.equal(classificarStatusExecucao(undefined), "ausente")
})

test("'Não realizado' nunca é lido como 'Realizado'", () => {
  // A regressão mais cara possível neste arquivo: "realizado" é substring de
  // "não realizado", e trocar a ordem dos testes pagaria toda sessão que não
  // aconteceu.
  for (const rotulo of ["Não realizado — paciente", "Não realizado — prestador", "Não realizado — clínica"]) {
    assert.equal(classificarStatusExecucao(rotulo), "nao_realizado", rotulo)
    assert.equal(isCancelado(rotulo), true, rotulo)
  }
  assert.equal(isCancelado("Realizado"), false)
})

test("isCancelado só é verdadeiro para sessão que não aconteceu", () => {
  for (const [rotulo, esperado] of VOCABULARIO) {
    assert.equal(isCancelado(rotulo), esperado === "nao_realizado", `rótulo: ${rotulo || "(vazio)"}`)
  }
})

test("motivoNaoRealizado traduz as duas gerações para o mesmo motivo", () => {
  // Antigo: motivo na justificativa, status em 'Cancelado'.
  assert.equal(motivoNaoRealizado("Falta do Paciente", "Cancelado"), "paciente")
  assert.equal(motivoNaoRealizado("Falta do Profissional", "Cancelado"), "prestador")
  assert.equal(motivoNaoRealizado("Falta de Ambos", "Cancelado"), "ambos")

  // Novo: motivo no próprio status — e aceito também se vier na justificativa,
  // porque quem consome não sabe onde a TiTa vai colocá-lo.
  assert.equal(motivoNaoRealizado(null, "Não realizado — paciente"), "paciente")
  assert.equal(motivoNaoRealizado("Não realizado — paciente", null), "paciente")
  assert.equal(motivoNaoRealizado(null, "Não realizado — prestador"), "prestador")
  assert.equal(motivoNaoRealizado(null, "Não realizado — clínica"), "clinica")

  // Sessão que aconteceu não tem motivo; sessão que não aconteceu com motivo
  // ilegível é "outro" — e não null, que significaria "aconteceu".
  assert.equal(motivoNaoRealizado(null, "Realizado"), null)
  assert.equal(motivoNaoRealizado(null, null), null)
  assert.equal(motivoNaoRealizado("Motivo que ninguém previu", "Cancelado"), "outro")
})

test("isFaltaDoPaciente separa a falta do paciente das outras", () => {
  assert.equal(isFaltaDoPaciente("Falta do Paciente", "Cancelado"), true)
  assert.equal(isFaltaDoPaciente(null, "Não realizado — paciente"), true)

  assert.equal(isFaltaDoPaciente("Falta do Profissional", "Cancelado"), false)
  assert.equal(isFaltaDoPaciente("Falta de Ambos", "Cancelado"), false)
  assert.equal(isFaltaDoPaciente(null, "Não realizado — prestador"), false)
  assert.equal(isFaltaDoPaciente(null, "Não realizado — clínica"), false)
  assert.equal(isFaltaDoPaciente(null, null), false)
})

// ─── A rede para a PRÓXIMA mudança ───────────────────────────────────────────

test("rotulosDeExecucaoDesconhecidos acusa só o que é ilegível", () => {
  const conhecidos = VOCABULARIO.map(([rotulo]) => rotulo)
  assert.deepEqual(rotulosDeExecucaoDesconhecidos([...conhecidos, null, undefined]), [])

  // Texto original preservado (é o que se procura na TiTa) e sem repetição.
  assert.deepEqual(
    rotulosDeExecucaoDesconhecidos(["Realizado", "Sessão Suspensa", "Sessão Suspensa", "Reagendado"]),
    ["Sessão Suspensa", "Reagendado"],
  )
})

test("veredictoRotuloDesconhecido reprova só quando há rótulo ilegível", () => {
  assert.equal(veredictoRotuloDesconhecido({ rotulosDesconhecidos: [], linhasRotuloDesconhecido: 0 }), null)

  const veredicto = veredictoRotuloDesconhecido({
    rotulosDesconhecidos: ["Sessão Suspensa"],
    linhasRotuloDesconhecido: 7,
  })
  assert.ok(veredicto)
  assert.equal(veredicto.ok, false)
  assert.equal(veredicto.quantidade, 7)
  // O rótulo real aparece na mensagem: sem ele, quem lê não tem o que procurar
  // na TiTa nem o que informar ao time técnico.
  assert.ok(veredicto.erro.includes("Sessão Suspensa"), veredicto.erro)
  // E a mensagem não pode oferecer o CSV como saída — ele traz o mesmo rótulo.
  assert.ok(veredicto.dica.includes("o CSV"), veredicto.dica)
})

test("veredictoRotuloDesconhecido troca o texto por contexto, não a decisão", () => {
  const grade = { rotulosDesconhecidos: ["Sessão Suspensa"], linhasRotuloDesconhecido: 1 }
  const pagamento = veredictoRotuloDesconhecido(grade, "pagamento")
  const tratativas = veredictoRotuloDesconhecido(grade, "tratativas")
  assert.ok(pagamento && tratativas)
  assert.equal(pagamento.ok, false)
  assert.equal(tratativas.ok, false)
  assert.ok(pagamento.erro.includes("PA indevidos"), pagamento.erro)
  assert.ok(tratativas.erro.includes("adesão"), tratativas.erro)
})

// ─── Ponta a ponta, pela normalização da grade ───────────────────────────────

function linha(status: string, justificativa: string | null): CsvGradeRow {
  return {
    "ID Agendamento": "9001",
    "Status do Agendamento": "Agendado",
    "Data": "24/08/2026",
    "Hora Inicial": "08:00",
    "Profissional": "Fulano de Tal",
    "Nome Profissional Tratativa": "",
    "Nome Favorecido": "Paciente Teste Um",
    "Terapia": "Psicologia",
    "Possui Tratativa": "Não",
    "Status": status,
    "Justificativa": justificativa ?? "",
  }
}

test("sessão não realizada classifica como Cancelado nas duas gerações", () => {
  const casos: [string, string | null][] = [
    ["Cancelado", "Falta do Paciente"],
    ["Cancelado", "Falta do Profissional"],
    ["Cancelado", "Falta de Ambos"],
    ["Não realizado — paciente", null],
    ["Não realizado — prestador", null],
    ["Não realizado — clínica", null],
  ]
  for (const [status, just] of casos) {
    const [s] = normalizarGradeParaSessao([linha(status, just)])
    assert.equal(s.classificacao, "Cancelado", `${status} / ${just}`)
  }
})

test("sessão não realizada COM evolução vira inconsistência, não pagamento", () => {
  // "Cancelado evoluído" é o que segura a sessão para conferência manual. Com o
  // rótulo novo lido como "realizado", ela cairia em "Evolução normal" e seria
  // paga direto — o caminho exato pelo qual o dinheiro escaparia.
  const r = { ...linha("Não realizado — clínica", null), "Possui Tratativa": "Sim", "Nome Profissional Tratativa": "Fulano de Tal" }
  const [s] = normalizarGradeParaSessao([r])
  assert.equal(s.classificacao, "Cancelado evoluído")
})

test("presencaTita = Não só quando o paciente é quem faltou", () => {
  const naoCompareceu: [string, string | null][] = [
    ["Cancelado", "Falta do Paciente"],
    ["Não realizado — paciente", null],
  ]
  for (const [status, just] of naoCompareceu) {
    const [s] = normalizarGradeParaSessao([linha(status, just)])
    assert.equal(s.presencaTita, "Não", `${status} / ${just}`)
  }

  // Falta de prestador/clínica/ambos: o comportamento histórico é "Sim", e ele
  // é preservado de propósito — mexer nisso mudaria o que 593 linhas antigas
  // exibem, e é decisão de produto, não desta correção.
  const compareceu: [string, string | null][] = [
    ["Cancelado", "Falta do Profissional"],
    ["Cancelado", "Falta de Ambos"],
    ["Não realizado — prestador", null],
    ["Não realizado — clínica", null],
    ["Realizado", null],
  ]
  for (const [status, just] of compareceu) {
    const [s] = normalizarGradeParaSessao([linha(status, just)])
    assert.equal(s.presencaTita, "Sim", `${status} / ${just}`)
  }

  // Não aconteceu, motivo ilegível: "" (não sei), nunca "Sim". Dizer "Sim"
  // seria afirmar que o paciente compareceu a uma sessão sobre a qual a grade
  // não diz nada. Estado inexistente nas 187.079 linhas de hoje.
  const [indefinida] = normalizarGradeParaSessao([linha("Cancelado", "Motivo que ninguém previu")])
  assert.equal(indefinida.presencaTita, "")

  // Sem ID Agendamento não há sessão real: segue "" como sempre.
  const semId = { ...linha("Realizado", null), "ID Agendamento": "" }
  const [sem] = normalizarGradeParaSessao([semId])
  assert.equal(sem.presencaTita, "")
})
