// Elegibilidade de paciente para o Controle de Prazos do PDI — espelha o
// estilo de lib/laudos/filtros.test.ts (vitest + node:assert/strict).
//
//   npx vitest run lib/pdi/elegibilidade.test.ts

import { test } from "vitest"
import assert from "node:assert/strict"
import { calcularElegibilidadePdi } from "./elegibilidade"
import type { LaudoRow } from "@/types/cronograma"

function row(over: Partial<LaudoRow> & Record<string, string | number | undefined>): LaudoRow {
  return {
    "Paciente": "Paciente Teste",
    "Especialidade": "Psicologia ABA",
    "Qtd autorizada": "1",
    "Situação": "Vigente",
    "ID Favorecido": "11511",
    "Ambiente natural": "Não",
    ...over,
  } as LaudoRow
}

test("1 · Especialidade exatamente 'Psicologia ABA' é elegível", () => {
  const mapa = calcularElegibilidadePdi([row({})])
  assert.strictEqual(mapa.get(11511)?.elegivel, true)
})

test("2 · Especialidade diferente NÃO é elegível", () => {
  const mapa = calcularElegibilidadePdi([row({ "Especialidade": "Arteterapia" })])
  assert.strictEqual(mapa.size, 0)
})

test("3 · 'Habilidades Sociais (Psicologia ABA)' não é a chave exata — não elegível", () => {
  // Achado da verificação (ver cabeçalho de elegibilidade.ts): a especialidade
  // é comparada contra a CHAVE "Psicologia ABA", não contra variantes.
  const mapa = calcularElegibilidadePdi([row({ "Especialidade": "Habilidades Sociais (Psicologia ABA)" })])
  assert.strictEqual(mapa.size, 0)
})

test("4 · linha sem ID Favorecido legível é ignorada", () => {
  const mapa = calcularElegibilidadePdi([row({ "ID Favorecido": "abc" })])
  assert.strictEqual(mapa.size, 0)
})

test("5 · Ambiente natural = 'Sim' marca autorizadoAmbienteNatural", () => {
  const mapa = calcularElegibilidadePdi([row({ "Ambiente natural": "Sim" })])
  assert.strictEqual(mapa.get(11511)?.autorizadoAmbienteNatural, true)
})

test("6 · Ambiente natural ausente/diferente de 'Sim' não marca", () => {
  const mapa = calcularElegibilidadePdi([row({ "Ambiente natural": "Não" })])
  assert.strictEqual(mapa.get(11511)?.autorizadoAmbienteNatural, false)
})

test("7 · Ambiente natural 'sim' em caixa baixa também conta (comparação case-insensitive)", () => {
  const mapa = calcularElegibilidadePdi([row({ "Ambiente natural": "sim" })])
  assert.strictEqual(mapa.get(11511)?.autorizadoAmbienteNatural, true)
})

test("8 · duas linhas do mesmo paciente: uma com Sim já marca o mapa pra sempre (OR, não sobrescreve)", () => {
  const mapa = calcularElegibilidadePdi([
    row({ "Ambiente natural": "Sim" }),
    row({ "Ambiente natural": "Não" }),
  ])
  assert.strictEqual(mapa.get(11511)?.elegivel, true)
  assert.strictEqual(mapa.get(11511)?.autorizadoAmbienteNatural, true)
})

test("9 · vários pacientes distintos ficam em entradas separadas do mapa", () => {
  const mapa = calcularElegibilidadePdi([
    row({ "ID Favorecido": "1" }),
    row({ "ID Favorecido": "2", "Ambiente natural": "Sim" }),
  ])
  assert.strictEqual(mapa.size, 2)
  assert.strictEqual(mapa.get(1)?.autorizadoAmbienteNatural, false)
  assert.strictEqual(mapa.get(2)?.autorizadoAmbienteNatural, true)
})

test("10 · não filtra por Situação — laudo vencido também conta (controle paralelo)", () => {
  const mapa = calcularElegibilidadePdi([row({ "Situação": "Vencido" })])
  assert.strictEqual(mapa.get(11511)?.elegivel, true)
})

test("11 · lista vazia devolve mapa vazio", () => {
  const mapa = calcularElegibilidadePdi([])
  assert.strictEqual(mapa.size, 0)
})
