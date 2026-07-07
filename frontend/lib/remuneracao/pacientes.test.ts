import { describe, it, expect } from "vitest"
import { abreviarNomePaciente, mergeIntervals, isFakePatient, isEtaAdminPatient } from "./pacientes"

describe("abreviarNomePaciente", () => {
  it("mantém nome com 2 palavras sem abreviar", () => {
    expect(abreviarNomePaciente("João Silva")).toBe("João Silva")
  })

  it("mantém nome com 1 palavra", () => {
    expect(abreviarNomePaciente("Carlos")).toBe("Carlos")
  })

  it("abrevia sobrenomes em nomes longos", () => {
    const result = abreviarNomePaciente("Carlos Eduardo Ferreira")
    expect(result).toContain("Carlos")
    expect(result).toContain("E.")
  })

  it("remove partículas (de, da, dos) antes de abreviar", () => {
    const result = abreviarNomePaciente("Carlos de Oliveira Santos")
    expect(result).not.toContain(" de ")
  })

  it("mantém dois nomes quando primeiro é nome composto (Ana)", () => {
    const result = abreviarNomePaciente("Ana Maria de Jesus")
    expect(result).toContain("Ana")
    expect(result).toContain("Maria")
  })

  it("mantém dois nomes quando primeiro é Maria", () => {
    const result = abreviarNomePaciente("Maria Clara de Souza Lima")
    expect(result).toContain("Maria")
    expect(result).toContain("Clara")
  })

  it("retorna null para null", () => {
    expect(abreviarNomePaciente(null)).toBeNull()
  })

  it("retorna undefined para undefined", () => {
    expect(abreviarNomePaciente(undefined)).toBeUndefined()
  })

  it("retorna string vazia para string vazia", () => {
    expect(abreviarNomePaciente("")).toBeFalsy()
  })

  it("lida com nomes com apenas partículas filtradas (mantém resultado coerente)", () => {
    const result = abreviarNomePaciente("Ana de Santos Ferreira")
    expect(typeof result).toBe("string")
    expect(result!.length).toBeGreaterThan(0)
  })
})

describe("mergeIntervals", () => {
  it("retorna 0 para array vazio", () => {
    expect(mergeIntervals([])).toBe(0)
  })

  it("retorna 0 para null/undefined", () => {
    expect(mergeIntervals(null as unknown as [])).toBe(0)
  })

  it("calcula intervalo único corretamente (60min = 1h)", () => {
    expect(mergeIntervals([[480, 540]])).toBe(1)
  })

  it("merge de intervalos sobrepostos", () => {
    expect(mergeIntervals([[480, 540], [510, 570]])).toBe(1.5)
  })

  it("merge de intervalos adjacentes (sem sobreposição)", () => {
    expect(mergeIntervals([[480, 540], [540, 600]])).toBe(2)
  })

  it("intervalos separados somam independentemente", () => {
    expect(mergeIntervals([[480, 540], [600, 660]])).toBe(2)
  })

  it("intervalos fora de ordem são ordenados antes do merge", () => {
    const result = mergeIntervals([[600, 660], [480, 540]])
    expect(result).toBe(2)
  })

  it("intervalo completamente contido em outro é ignorado", () => {
    expect(mergeIntervals([[480, 600], [510, 540]])).toBe(2)
  })
})

describe("isFakePatient", () => {
  it('detecta "Horário Bloqueado"', () => {
    expect(isFakePatient("Horário Bloqueado")).toBe(true)
  })

  it('detecta "Notificação Prévia"', () => {
    expect(isFakePatient("Notificação Prévia")).toBe(true)
  })

  it('detecta "Ainda não selecionado"', () => {
    expect(isFakePatient("Ainda não selecionado")).toBe(true)
  })

  it('detecta prefixo "Supervisor"', () => {
    expect(isFakePatient("Supervisor João")).toBe(true)
  })

  it('detecta prefixo "Alinhamento"', () => {
    expect(isFakePatient("Alinhamento de Equipe")).toBe(true)
  })

  it("detecta pacientes fictícios por ID mesmo se o nome mudar", () => {
    expect(isFakePatient("Nome operacional alterado", "20478")).toBe(true)
    expect(isFakePatient("Qualquer nome", "18565")).toBe(true)
  })

  it("retorna false para nome real", () => {
    expect(isFakePatient("Carlos Silva")).toBe(false)
  })

  it("retorna false para null", () => {
    expect(isFakePatient(null)).toBe(false)
  })

  it("retorna false para string vazia", () => {
    expect(isFakePatient("")).toBe(false)
  })
})

describe("isEtaAdminPatient", () => {
  it('detecta "Horário Administrativo"', () => {
    expect(isEtaAdminPatient("Horário Administrativo")).toBe(true)
  })

  it("detecta substring de Horário Administrativo", () => {
    expect(isEtaAdminPatient("Reunião - Horário Administrativo")).toBe(true)
  })

  it("trata pacientes fictícios de ETA como horário administrativo", () => {
    expect(isEtaAdminPatient("Alinhamento Sandra")).toBe(true)
    expect(isEtaAdminPatient("Supervisora Beatriz")).toBe(true)
  })

  it("trata pacientes fictícios de ETA por ID mesmo se o nome mudar", () => {
    expect(isEtaAdminPatient("Nome operacional alterado", "20478")).toBe(true)
    expect(isEtaAdminPatient("", "18565")).toBe(true)
  })

  it("retorna false para paciente real", () => {
    expect(isEtaAdminPatient("Ana Silva")).toBe(false)
  })

  it("retorna false para null", () => {
    expect(isEtaAdminPatient(null)).toBe(false)
  })
})
