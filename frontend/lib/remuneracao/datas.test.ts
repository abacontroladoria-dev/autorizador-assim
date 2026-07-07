import { describe, it, expect } from "vitest"
import { parseDateBR, formatDateBR, dataParaISO, getCalendario, mesAnoDeLinhas } from "./datas"
import type { FeriadoInfo } from "@/types/remuneracao"

// Fixture equivalente a FERIADOS_BR da calculadora original (agora vive no
// Supabase remuneracao_config.feriados — ver migration 20260706000003).
const FERIADOS_FIXTURE: Record<string, FeriadoInfo> = {
  "2026-01-01": { nome: "Confraternização Universal", tipo: "integral" },
  "2026-04-03": { nome: "Sexta-feira Santa", tipo: "integral" },
  "2026-04-21": { nome: "Tiradentes", tipo: "integral" },
  "2026-05-01": { nome: "Dia do Trabalho", tipo: "integral" },
  "2026-06-04": { nome: "Corpus Christi (Corpo de Cristo)", tipo: "integral" },
  "2026-06-29": { nome: "Ponto facultativo — Jogo da Seleção Brasileira Copa 2026", tipo: "parcial", parcial_a_partir: "13:00" },
  "2026-09-07": { nome: "Independência do Brasil", tipo: "integral" },
  "2026-10-12": { nome: "N. S. Aparecida", tipo: "integral" },
  "2026-11-02": { nome: "Finados", tipo: "integral" },
  "2026-11-15": { nome: "Proclamação da República", tipo: "integral" },
  "2026-11-20": { nome: "Consciência Negra", tipo: "integral" },
  "2026-12-25": { nome: "Natal", tipo: "integral" },
}

describe("parseDateBR", () => {
  it("parseia formato ISO YYYY-MM-DD", () => {
    const d = parseDateBR("2026-05-29")
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(4) // maio = 4 (base 0)
    expect(d!.getDate()).toBe(29)
  })

  it("parseia formato DD/MM/YYYY", () => {
    const d = parseDateBR("29/05/2026")
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(4)
    expect(d!.getDate()).toBe(29)
  })

  it("parseia formato DD.MM.YY com ano de 2 dígitos", () => {
    const d = parseDateBR("29.05.26")
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getDate()).toBe(29)
  })

  it("parseia formato DD-MM-YYYY com hífen", () => {
    const d = parseDateBR("29-05-2026")
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
  })

  it("retorna null para string vazia", () => {
    expect(parseDateBR("")).toBeNull()
  })

  it("retorna null para null", () => {
    expect(parseDateBR(null)).toBeNull()
  })

  it("retorna null para undefined", () => {
    expect(parseDateBR(undefined)).toBeNull()
  })

  it("retorna null para texto sem data", () => {
    expect(parseDateBR("texto sem data")).toBeNull()
  })

  it("ignora espaços extras em volta", () => {
    const d = parseDateBR("  2026-01-15  ")
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(15)
  })
})

describe("formatDateBR", () => {
  it("converte ISO YYYY-MM-DD para DD/MM/YYYY", () => {
    expect(formatDateBR("2026-07-06")).toBe("06/07/2026")
  })

  it("mantém DD/MM/YYYY já formatado", () => {
    expect(formatDateBR("06/07/2026")).toBe("06/07/2026")
  })

  it("devolve o texto original quando não consegue parsear", () => {
    expect(formatDateBR("texto sem data")).toBe("texto sem data")
  })

  it("devolve string vazia para valor vazio", () => {
    expect(formatDateBR("")).toBe("")
  })
})

describe("dataParaISO", () => {
  it("converte DD/MM/YYYY para YYYY-MM-DD", () => {
    expect(dataParaISO("06/07/2026")).toBe("2026-07-06")
  })

  it("mantém YYYY-MM-DD já ISO", () => {
    expect(dataParaISO("2026-07-06")).toBe("2026-07-06")
  })

  it("retorna string vazia quando não consegue parsear", () => {
    expect(dataParaISO("texto sem data")).toBe("")
  })

  it("retorna string vazia para valor vazio", () => {
    expect(dataParaISO("")).toBe("")
  })
})

describe("getCalendario", () => {
  it("conta dias úteis em maio de 2026 corretamente", () => {
    const { counts } = getCalendario(2026, 5, FERIADOS_FIXTURE)
    const totalDiasUteis = Object.values(counts).reduce((a, b) => a + b, 0)
    // Maio 2026 tem 21 dias úteis (sem contar feriado 01/05 que é sexta = 5)
    expect(totalDiasUteis).toBeGreaterThan(15)
    expect(totalDiasUteis).toBeLessThanOrEqual(23)
  })

  it("1º de maio é feriado e aparece em feriadosAtivos", () => {
    const { feriadosAtivos } = getCalendario(2026, 5, FERIADOS_FIXTURE)
    const trabalho = feriadosAtivos.find(f => f.date === "2026-05-01")
    expect(trabalho).toBeDefined()
    expect(trabalho!.nome).toContain("Trabalho")
  })

  it("feriados em finais de semana não aparecem em feriadosAtivos", () => {
    const { feriadosAtivos } = getCalendario(2026, 1, FERIADOS_FIXTURE) // janeiro
    feriadosAtivos.forEach(f => {
      const dow = new Date(f.date + "T12:00:00").getDay()
      expect(dow).toBeGreaterThanOrEqual(1)
      expect(dow).toBeLessThanOrEqual(5)
    })
  })

  it("aceita feriados municipais extras", () => {
    // 2026-05-11 é segunda-feira (dia útil)
    const extra = [{ date: "2026-05-11", nome: "Feriado Municipal", dow: 1 }]
    const { feriadosAtivos } = getCalendario(2026, 5, FERIADOS_FIXTURE, extra)
    const municipal = feriadosAtivos.find(f => f.date === "2026-05-11")
    expect(municipal).toBeDefined()
    expect(municipal!.nome).toBe("Feriado Municipal")
  })

  it("retorna estrutura correta", () => {
    const result = getCalendario(2026, 6, FERIADOS_FIXTURE)
    expect(result).toHaveProperty("counts")
    expect(result).toHaveProperty("feriadosAtivos")
    expect(result.counts).toHaveProperty("1")
    expect(result.counts).toHaveProperty("5")
  })

  it("feriado parcial (2026-06-29) ainda conta como feriado ativo no calendário", () => {
    const { feriadosAtivos } = getCalendario(2026, 6, FERIADOS_FIXTURE)
    const jogo = feriadosAtivos.find(f => f.date === "2026-06-29")
    expect(jogo).toBeDefined()
  })
})

describe("mesAnoDeLinhas", () => {
  it("retorna mês e ano corretamente de linhas com campo data", () => {
    const linhas = [{ data: "2026-05-15" }, { data: "2026-05-20" }]
    const result = mesAnoDeLinhas(linhas)
    expect(result).toContain("2026")
    expect(result.toLowerCase()).toContain("maio")
  })

  it("aceita campo Data com D maiúsculo", () => {
    const linhas = [{ Data: "15/06/2026" }]
    const result = mesAnoDeLinhas(linhas)
    expect(result).toContain("2026")
  })

  it('retorna "Sem mês" para array vazio', () => {
    expect(mesAnoDeLinhas([])).toBe("Sem mês")
  })

  it('retorna "Sem mês" se nenhuma linha tem data válida', () => {
    const linhas = [{ data: "invalido" }, { data: "" }]
    expect(mesAnoDeLinhas(linhas)).toBe("Sem mês")
  })

  it("capitaliza o nome do mês", () => {
    const linhas = [{ data: "2026-01-10" }]
    const result = mesAnoDeLinhas(linhas)
    expect(result[0]).toBe(result[0].toUpperCase())
  })
})
