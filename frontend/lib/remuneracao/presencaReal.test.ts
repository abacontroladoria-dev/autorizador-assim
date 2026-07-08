import { describe, it, expect } from "vitest"
import { chavePresenca, presencaDaSessao, type PresencaIndice } from "./presencaReal"

function indice(porId: Array<[string, boolean]> = [], porChave: Array<[string, boolean]> = []): PresencaIndice {
  return { porId: new Map(porId), porChave: new Map(porChave) }
}

describe("chavePresenca", () => {
  it("normaliza nome, data e hora de forma consistente", () => {
    expect(chavePresenca("João Silva", "2026-06-01", "08:00:00")).toBe(chavePresenca("joão silva", "01/06/2026", "08:00"))
  })
})

describe("presencaDaSessao", () => {
  it("casa por id do agendamento quando presente no índice, ignorando a chave", () => {
    const idx = indice(
      [["123", false]],
      [["fulano|2026-06-01|08:00", true]] // se caísse na chave, daria o oposto
    )
    expect(presencaDaSessao("123", "Fulano", "2026-06-01", "08:00", idx)).toBe(false)
  })

  it("cai para paciente+data+hora quando o id não está no índice", () => {
    const idx = indice([], [["fulano|2026-06-01|08:00", false]])
    expect(presencaDaSessao("999", "Fulano", "2026-06-01", "08:00", idx)).toBe(false)
  })

  it("cai para a chave quando a sessão não tem id", () => {
    const idx = indice([], [["fulano|2026-06-01|08:00", true]])
    expect(presencaDaSessao(undefined, "Fulano", "2026-06-01", "08:00", idx)).toBe(true)
  })

  it("retorna undefined quando não há registro em nenhum dos dois mapas", () => {
    const idx = indice([["1", true]], [["outra|2026-06-01|08:00", true]])
    expect(presencaDaSessao("2", "Fulano", "2026-06-01", "08:00", idx)).toBeUndefined()
  })
})
