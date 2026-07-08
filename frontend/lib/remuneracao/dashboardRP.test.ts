import { describe, it, expect } from "vitest"
import { calcularTotalPorEspecialidade } from "./dashboardRP"
import type { SessaoComPapel } from "./calculo"

function sessao(especialidade: string, valorPA: number | undefined): SessaoComPapel {
  return {
    id: "1", data: "2026-06-01", hora: "08:00", profAgenda: "Fulano", paciente: "Paciente",
    convenio: "", unidade: "", especialidade, presencaOrbita: "Sim", presencaTita: "Sim",
    profCsv: "", possuiTratativa: "Sim", statusCsv: "Agendado", statusFinal: "Agendado",
    motivo: "", _idx: 1, classificacao: "Evolução normal", diaSemana: "Segunda",
    idFavorecido: "", criacaoTratativa: "", papel: "Agenda", valorPA,
  }
}

describe("calcularTotalPorEspecialidade", () => {
  it("soma por especialidade bate com a soma de valorConfirmado (PA + PPD + PE + ETA)", () => {
    const resultado = [
      {
        prof: "Ana",
        sessoes: [sessao("Fonoaudiologia", 40), sessao("Fonoaudiologia", 40), sessao("Psicopedagogia", 35)],
        diariaDetalhe: [{ esp: "Fonoaudiologia", dias: 4, rate: 30, total: 120 }],
        pe: 0,
        etaBonusPeriodo: 0,
      },
      {
        prof: "Bruno",
        sessoes: [sessao("Coordenador de Caso", 35), sessao("Especialista Técnico de Área", 0)],
        diariaDetalhe: [],
        pe: 266.68,
        etaBonusPeriodo: 500,
      },
    ]
    const valorConfirmadoEsperado = [
      40 + 40 + 35 + 120,   // Ana: PA + PPD
      35 + 266.68 + 500,    // Bruno: PA (CC) + PE + ETA
    ]

    const { totalMes, porEspecialidade } = calcularTotalPorEspecialidade(resultado)

    expect(totalMes).toBeCloseTo(valorConfirmadoEsperado.reduce((a, b) => a + b, 0), 6)

    const somaPorEsp = porEspecialidade.reduce((s, x) => s + x.valor, 0)
    expect(somaPorEsp).toBeCloseTo(totalMes, 6)

    const fono = porEspecialidade.find(x => x.especialidade === "Fonoaudiologia")
    expect(fono?.valor).toBeCloseTo(200, 6) // 40+40 PA + 120 PPD
    expect(fono?.profissionais).toEqual(["Ana"])

    const cc = porEspecialidade.find(x => x.especialidade === "Coordenador de Caso")
    expect(cc?.valor).toBeCloseTo(35 + 266.68, 6) // PA + PE dobrados na mesma especialidade

    const eta = porEspecialidade.find(x => x.especialidade === "Especialista Técnico de Área")
    expect(eta?.valor).toBeCloseTo(500, 6) // sessão com valorPA=0 não soma, só o bônus
  })

  it("ordena do maior para o menor valor", () => {
    const resultado = [
      { prof: "A", sessoes: [sessao("Musicoterapia", 10)], diariaDetalhe: [], pe: 0, etaBonusPeriodo: 0 },
      { prof: "B", sessoes: [sessao("Fonoaudiologia", 100)], diariaDetalhe: [], pe: 0, etaBonusPeriodo: 0 },
    ]
    const { porEspecialidade } = calcularTotalPorEspecialidade(resultado)
    expect(porEspecialidade.map(x => x.especialidade)).toEqual(["Fonoaudiologia", "Musicoterapia"])
  })

  it("pct de cada especialidade soma 1 (100%) quando há total", () => {
    const resultado = [
      { prof: "A", sessoes: [sessao("Musicoterapia", 30)], diariaDetalhe: [], pe: 0, etaBonusPeriodo: 0 },
      { prof: "B", sessoes: [sessao("Fonoaudiologia", 70)], diariaDetalhe: [], pe: 0, etaBonusPeriodo: 0 },
    ]
    const { porEspecialidade } = calcularTotalPorEspecialidade(resultado)
    const somaPct = porEspecialidade.reduce((s, x) => s + x.pct, 0)
    expect(somaPct).toBeCloseTo(1, 6)
  })

  it("retorna vazio e total zero para lista vazia", () => {
    const { totalMes, porEspecialidade } = calcularTotalPorEspecialidade([])
    expect(totalMes).toBe(0)
    expect(porEspecialidade).toEqual([])
  })

  it("ignora sessões sem valorPA definido (não contabilizadas no acumulado)", () => {
    const resultado = [
      { prof: "A", sessoes: [sessao("Musicoterapia", undefined)], diariaDetalhe: [], pe: 0, etaBonusPeriodo: 0 },
    ]
    const { totalMes, porEspecialidade } = calcularTotalPorEspecialidade(resultado)
    expect(totalMes).toBe(0)
    expect(porEspecialidade).toEqual([])
  })
})
