// Status, prioridade do Controle de Prazos do PDI — espelha o estilo de
// lib/laudos/filtros.test.ts (vitest + node:assert/strict).
//
//   npx vitest run lib/pdi/status.test.ts

import { test } from "vitest"
import assert from "node:assert/strict"
import { calcularStatus, calcularPrioridade, diasRestantes } from "./status"

const HOJE = "2026-09-04"

// ─── calcularStatus: os QUATRO status, ponto final ──────────────────────────

test("1 · sem prazoFechamento (ainda sem avaliação) => 'Aguardando Implementação'", () => {
  const status = calcularStatus({ prazoFechamento: null, hoje: HOJE })
  assert.strictEqual(status, "Aguardando Implementação")
})

test("2 · hoje depois do prazoFechamento => 'Atrasado'", () => {
  const status = calcularStatus({ prazoFechamento: "2026-09-01", hoje: HOJE })
  assert.strictEqual(status, "Atrasado")
})

test("2b · atrasado mesmo com prazoFechamento MUITO vencido — não existe 5º status", () => {
  // Decisão do usuário (05/09/2026): a regra "Data de validade preenchida
  // sobrepõe Atrasado" foi REMOVIDA — dataValidade nem é mais parâmetro desta
  // função. Prazo vencido é sempre "Atrasado", ponto final.
  const status = calcularStatus({ prazoFechamento: "2026-03-23", hoje: HOJE })
  assert.strictEqual(status, "Atrasado")
})

test("3 · dias restantes <= 7 => 'Próximo do prazo'", () => {
  const status = calcularStatus({ prazoFechamento: "2026-09-10", hoje: HOJE }) // 6 dias
  assert.strictEqual(status, "Próximo do prazo")
})

test("4 · exatamente no limite de 7 dias ainda é 'Próximo do prazo'", () => {
  const status = calcularStatus({ prazoFechamento: "2026-09-11", hoje: HOJE }) // 7 dias
  assert.strictEqual(status, "Próximo do prazo")
})

test("5 · 8 dias de folga NÃO entra em 'Próximo do prazo' => 'Dentro do prazo'", () => {
  const status = calcularStatus({ prazoFechamento: "2026-09-12", hoje: HOJE }) // 8 dias
  assert.strictEqual(status, "Dentro do prazo")
})

test("6 · hoje == prazoFechamento não é 'Atrasado' (hoje > prazo é estrito)", () => {
  const status = calcularStatus({ prazoFechamento: HOJE, hoje: HOJE })
  assert.strictEqual(status, "Próximo do prazo")
})

// ─── calcularPrioridade ──────────────────────────────────────────────────────

test("8 · Atrasado => Alta", () => {
  assert.strictEqual(calcularPrioridade("Atrasado"), "Alta")
})

test("9 · Próximo do prazo => Média", () => {
  assert.strictEqual(calcularPrioridade("Próximo do prazo"), "Média")
})

test("10 · Dentro do prazo => Neutra", () => {
  assert.strictEqual(calcularPrioridade("Dentro do prazo"), "Neutra")
})

test("11 · Aguardando Implementação => Neutra", () => {
  assert.strictEqual(calcularPrioridade("Aguardando Implementação"), "Neutra")
})

// ─── diasRestantes ───────────────────────────────────────────────────────────

test("12 · diasRestantes sem prazo é null — 'sem prazo' não é 'vence em N dias'", () => {
  assert.strictEqual(diasRestantes(null, HOJE), null)
})

test("13 · diasRestantes positivo quando o prazo ainda não chegou", () => {
  assert.strictEqual(diasRestantes("2026-09-14", HOJE), 10)
})

test("14 · diasRestantes negativo quando o prazo já passou", () => {
  assert.strictEqual(diasRestantes("2026-08-25", HOJE), -10)
})

test("15 · diasRestantes zero no dia exato do prazo", () => {
  assert.strictEqual(diasRestantes(HOJE, HOJE), 0)
})

// `calcularAlerta` foi removida (pedido do usuário, 05/09/2026) — era 100%
// derivada de `status`, então não tinha comportamento próprio a testar. Ver o
// comentário no fim de status.ts.
