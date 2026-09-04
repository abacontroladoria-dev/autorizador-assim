// Detecção de "cadastro duplicado no TiTa" — espelha o estilo de
// lib/pdi/elegibilidade.test.ts (vitest + node:assert/strict).
//
//   npx vitest run lib/pdi/duplicidade.test.ts

import { test } from "vitest"
import assert from "node:assert/strict"
import { calcularCadastroDuplicadoTita } from "./duplicidade"
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

test("1 · mesmo nome, dois ID Favorecido distintos: ambos marcados (caso real Luiz Felipe Mariano)", () => {
  const dup = calcularCadastroDuplicadoTita([
    row({ "Paciente": "Luiz Felipe Mariano Vasconcelos", "ID Favorecido": "12517" }),
    row({ "Paciente": "Luiz Felipe Mariano Vasconcelos", "ID Favorecido": "20945" }),
  ])
  assert.strictEqual(dup.has(12517), true)
  assert.strictEqual(dup.has(20945), true)
  assert.strictEqual(dup.size, 2)
})

test("2 · nomes diferentes: nenhum marcado", () => {
  const dup = calcularCadastroDuplicadoTita([
    row({ "Paciente": "Ana Beatriz Silva", "ID Favorecido": "1" }),
    row({ "Paciente": "Carlos Eduardo Souza", "ID Favorecido": "2" }),
  ])
  assert.strictEqual(dup.size, 0)
})

test("3 · nome com entidade HTML escapada que decodifica pro mesmo nome de outro registro também marca (caso D'Ávila)", () => {
  const dup = calcularCadastroDuplicadoTita([
    row({ "Paciente": "D&#039;avila Souza", "ID Favorecido": "3" }),
    row({ "Paciente": "D'avila Souza", "ID Favorecido": "4" }),
  ])
  assert.strictEqual(dup.has(3), true)
  assert.strictEqual(dup.has(4), true)
})

test("4 · mesmo paciente com várias linhas (mesmo ID Favorecido) não conta como duplicidade", () => {
  const dup = calcularCadastroDuplicadoTita([
    row({ "Paciente": "Ana Beatriz Silva", "ID Favorecido": "1" }),
    row({ "Paciente": "Ana Beatriz Silva", "ID Favorecido": "1" }),
  ])
  assert.strictEqual(dup.size, 0)
})

test("5 · diferença só de acento/caixa/espaço ainda casa como o mesmo nome (normTxt)", () => {
  const dup = calcularCadastroDuplicadoTita([
    row({ "Paciente": "joão   pedro", "ID Favorecido": "5" }),
    row({ "Paciente": "JOÃO PEDRO", "ID Favorecido": "6" }),
  ])
  assert.strictEqual(dup.has(5), true)
  assert.strictEqual(dup.has(6), true)
})

test("6 · linha sem ID Favorecido legível é ignorada", () => {
  const dup = calcularCadastroDuplicadoTita([
    row({ "Paciente": "Ana Beatriz Silva", "ID Favorecido": "abc" }),
    row({ "Paciente": "Ana Beatriz Silva", "ID Favorecido": "1" }),
  ])
  assert.strictEqual(dup.size, 0)
})

test("7 · lista vazia devolve conjunto vazio", () => {
  const dup = calcularCadastroDuplicadoTita([])
  assert.strictEqual(dup.size, 0)
})
