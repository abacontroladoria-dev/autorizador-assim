import { describe, it, expect } from "vitest"
import { resolverPARow, type CadastroContratual } from "./calculo"

const BASE = { ccPA: 50, taxasPA: { "Fonoaudiologia": 40, "Aplicador ABA (PS)": 30 } }

describe("resolverPARow", () => {
  it("contrato único sem modeloFaturamento continua calculando PA normalmente (regressão)", () => {
    const cadastro: CadastroContratual = {
      nome: "Ana",
      contratosAtuais: [{ numero: "1", funcao: "", valorPA: 45, vigente: true }],
    }
    const info = resolverPARow({ especialidade: "Fonoaudiologia" }, undefined, { ...BASE, cadastroContratual: cadastro })
    expect(info.valor).toBe(45)
    expect(info.semPA).toBeFalsy()
  })

  it("contrato único sem valorPA cai na taxa da especialidade (regressão)", () => {
    const cadastro: CadastroContratual = {
      nome: "Ana",
      contratosAtuais: [{ numero: "1", funcao: "", vigente: true }],
    }
    const info = resolverPARow({ especialidade: "Fonoaudiologia" }, undefined, { ...BASE, cadastroContratual: cadastro })
    expect(info.valor).toBe(40)
  })

  it("contrato único marcado como Banco de Horas zera o PA por sessão", () => {
    const cadastro: CadastroContratual = {
      nome: "Ana",
      contratosAtuais: [{ numero: "1", funcao: "", valorPA: 45, vigente: true, modeloFaturamento: "banco_horas", valorTotal: 25 }],
    }
    const info = resolverPARow({ especialidade: "Fonoaudiologia" }, undefined, { ...BASE, cadastroContratual: cadastro })
    expect(info.valor).toBe(0)
    expect(info.semPA).toBe(true)
    expect(info.valorTexto).toBe("Banco de Horas")
    expect(info.explicacao).toContain("Banco de Horas")
    expect(info.explicacao).toContain("25")
  })

  it("contrato múltiplo com match de função marcado como Banco de Horas zera o PA por sessão", () => {
    const cadastro: CadastroContratual = {
      nome: "Beto",
      contratosAtuais: [
        { numero: "1", funcao: "AC", valorPA: 50, vigente: true },
        { numero: "2", funcao: "PS", valorPA: 30, vigente: true, modeloFaturamento: "banco_horas", valorTotal: 20 },
      ],
    }
    const info = resolverPARow({ especialidade: "Aplicador ABA (PS)" }, undefined, { ...BASE, cadastroContratual: cadastro })
    expect(info.valor).toBe(0)
    expect(info.semPA).toBe(true)
  })

  it("sem cadastro de contrato continua funcionando normalmente (regressão)", () => {
    const info = resolverPARow({ especialidade: "Fonoaudiologia" }, undefined, { ...BASE, cadastroContratual: null })
    expect(info.valor).toBe(40)
    expect(info.semPA).toBeFalsy()
  })
})
