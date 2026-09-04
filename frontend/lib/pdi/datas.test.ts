// Datas derivadas do Controle de Prazos do PDI — espelha o estilo de
// lib/laudos/filtros.test.ts (vitest + node:assert/strict).
//
//   npx vitest run lib/pdi/datas.test.ts

import { test } from "vitest"
import assert from "node:assert/strict"
import { addDiasIso, addMesesIso, prazoRelatorio, dataImplementacaoPic, prazoFechamento } from "./datas"

// ─── addDiasIso ──────────────────────────────────────────────────────────────

test("1 · addDiasIso soma dias corridos, virando o mês quando preciso", () => {
  assert.strictEqual(addDiasIso("2026-04-30", 15), "2026-05-15")
})

test("2 · addDiasIso aceita dias negativos", () => {
  assert.strictEqual(addDiasIso("2026-05-15", -15), "2026-04-30")
})

test("3 · addDiasIso vira o ano quando a soma passa de dezembro", () => {
  assert.strictEqual(addDiasIso("2025-12-28", 5), "2026-01-02")
})

// ─── addMesesIso (estilo EDATE do Excel, com clamp de fim de mês) ───────────

test("4 · addMesesIso preserva o dia quando o mês de destino comporta", () => {
  assert.strictEqual(addMesesIso("2026-05-23", 6), "2026-11-23")
})

test("5 · addMesesIso clampa para o último dia quando o mês de destino é mais curto", () => {
  // 31/01 + 1 mês: fevereiro não tem dia 31 → clampa para 28 (2026 não é bissexto)
  assert.strictEqual(addMesesIso("2026-01-31", 1), "2026-02-28")
})

test("6 · addMesesIso clampa para 29/02 em ano bissexto", () => {
  assert.strictEqual(addMesesIso("2028-01-31", 1), "2028-02-29")
})

test("7 · addMesesIso vira o ano quando os meses somados passam de dezembro", () => {
  assert.strictEqual(addMesesIso("2026-07-23", 6), "2027-01-23")
})

test("8 · addMesesIso com dia 31 e destino de 6 meses também mais curto", () => {
  // 31/08 + 6 meses = fevereiro do ano seguinte → clampa para 28
  assert.strictEqual(addMesesIso("2026-08-31", 6), "2027-02-28")
})

// ─── A cadeia completa: avaliação → relatório → PIC → fechamento ───────────

test("9 · prazoRelatorio é +15 dias corridos da avaliação", () => {
  assert.strictEqual(prazoRelatorio("2026-04-30"), "2026-05-15")
})

test("10 · dataImplementacaoPic é +7 dias corridos do prazo do relatório", () => {
  assert.strictEqual(dataImplementacaoPic("2026-05-15"), "2026-05-22")
})

test("11 · prazoFechamento é +6 meses (EDATE) da implementação do PIC", () => {
  assert.strictEqual(prazoFechamento("2026-05-22"), "2026-11-22")
})

test("12 · a cadeia inteira bate com uma linha real da planilha (Adrian Araújo Nery)", () => {
  const avaliacao = "2026-04-30"
  const relatorio = prazoRelatorio(avaliacao)
  const implementacao = dataImplementacaoPic(relatorio)
  const fechamento = prazoFechamento(implementacao)
  assert.strictEqual(relatorio, "2026-05-15")
  assert.strictEqual(implementacao, "2026-05-22")
  assert.strictEqual(fechamento, "2026-11-22")
})

test("13 · a cadeia inteira com clamp de fim de mês (avaliação 31/07)", () => {
  // 31/07 + 15d = 15/08; +7d = 22/08; +6 meses = 22/02 (não precisa clampar
  // aqui — o clamp só entra quando o dia final não existe no mês de destino)
  const avaliacao = "2026-07-31"
  const relatorio = prazoRelatorio(avaliacao)
  const implementacao = dataImplementacaoPic(relatorio)
  const fechamento = prazoFechamento(implementacao)
  assert.strictEqual(relatorio, "2026-08-15")
  assert.strictEqual(implementacao, "2026-08-22")
  assert.strictEqual(fechamento, "2027-02-22")
})
