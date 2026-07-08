import { describe, it, expect } from "vitest"
import {
  fmt, fmtPct, fmtH, fmtHDec, fmtNumBR, fmtPctOcup,
  hhmm, timeToMin, minToH, cleanTxt, isSim, isCancelado,
  htmlEsc, onlyDigits, parseNumeroBR, numeroParaTextoBR,
} from "./formatacao"

// Node/ICU formata moeda pt-BR com NBSP ( ) entre "R$" e o valor,
// dependendo da versão — normaliza para espaço comum antes de comparar.
const semNbsp = (s: string) => s.replace(/[  ]/g, " ")

describe("fmt", () => {
  it("formata valor positivo em BRL", () => {
    expect(semNbsp(fmt(100))).toBe("R$ 100,00")
  })
  it("formata zero", () => {
    expect(semNbsp(fmt(0))).toBe("R$ 0,00")
  })
  it("formata valor negativo", () => {
    expect(fmt(-50.5)).toContain("-")
  })
  it("formata decimais corretamente", () => {
    expect(fmt(1234.56)).toContain("1.234,56")
  })
})

describe("fmtPct", () => {
  it("adiciona + em valores positivos", () => {
    expect(fmtPct(5)).toBe("+5.0%")
  })
  it("não adiciona + em valores negativos", () => {
    expect(fmtPct(-3.5)).toBe("-3.5%")
  })
  it("formata zero com +", () => {
    expect(fmtPct(0)).toBe("+0.0%")
  })
})

describe("fmtH", () => {
  it("converte horas decimais para hHmm", () => {
    expect(fmtH(1.5)).toBe("1h30")
  })
  it("formata zero horas", () => {
    expect(fmtH(0)).toBe("0h00")
  })
  it("padeia minutos com zero", () => {
    expect(fmtH(2.083333)).toBe("2h05")
  })
  it("lida com overflow de minutos (59.9 → arredonda para 60)", () => {
    const result = fmtH(1.9999)
    expect(result).toMatch(/^[12]h/)
  })
  it("aceita string numérica", () => {
    expect(fmtH("2")).toBe("2h00")
  })
  it("retorna 0h00 para NaN", () => {
    expect(fmtH(NaN)).toBe("0h00")
  })
})

describe("fmtNumBR", () => {
  it("formata número com 1 casa por padrão", () => {
    expect(fmtNumBR(1234.5)).toBe("1.234,5")
  })
  it("retorna — para null", () => {
    expect(fmtNumBR(null)).toBe("—")
  })
  it("retorna — para undefined", () => {
    expect(fmtNumBR(undefined)).toBe("—")
  })
  it("retorna — para NaN string", () => {
    expect(fmtNumBR("abc")).toBe("—")
  })
  it("respeita o número de casas decimais", () => {
    expect(fmtNumBR(3.14159, 3)).toBe("3,142")
  })
  it("aceita string numérica", () => {
    expect(fmtNumBR("100", 0)).toBe("100")
  })
})

describe("fmtPctOcup", () => {
  it("formata 1.0 como 100,00%", () => {
    expect(fmtPctOcup(1)).toBe("100,00%")
  })
  it("formata 0.75 como 75,00%", () => {
    expect(fmtPctOcup(0.75)).toBe("75,00%")
  })
  it("retorna — para null", () => {
    expect(fmtPctOcup(null)).toBe("—")
  })
  it("retorna — para undefined", () => {
    expect(fmtPctOcup(undefined)).toBe("—")
  })
})

describe("hhmm", () => {
  it("converte 90 minutos para 01:30", () => {
    expect(hhmm(90)).toBe("01:30")
  })
  it("converte 0 para 00:00", () => {
    expect(hhmm(0)).toBe("00:00")
  })
  it("retorna — para null", () => {
    expect(hhmm(null)).toBe("—")
  })
  it("retorna — para undefined", () => {
    expect(hhmm(undefined)).toBe("—")
  })
  it("retorna — para NaN", () => {
    expect(hhmm(NaN)).toBe("—")
  })
  it("padeia hora com zero", () => {
    expect(hhmm(65)).toBe("01:05")
  })
})

describe("timeToMin", () => {
  it("converte 08:00 para 480", () => {
    expect(timeToMin("08:00")).toBe(480)
  })
  it("converte 13:30 para 810", () => {
    expect(timeToMin("13:30")).toBe(810)
  })
  it("retorna null para string vazia", () => {
    expect(timeToMin("")).toBeNull()
  })
  it("retorna null para null", () => {
    expect(timeToMin(null)).toBeNull()
  })
  it("retorna null para undefined", () => {
    expect(timeToMin(undefined)).toBeNull()
  })
  it("converte meia-noite 00:00 para 0", () => {
    expect(timeToMin("00:00")).toBe(0)
  })
})

describe("minToH", () => {
  it("converte 60 minutos para 1 hora", () => {
    expect(minToH(60)).toBe(1)
  })
  it("converte 90 minutos para 1.5 hora", () => {
    expect(minToH(90)).toBe(1.5)
  })
  it("retorna 0 para 0", () => {
    expect(minToH(0)).toBe(0)
  })
})

describe("cleanTxt", () => {
  it("remove espaços extras", () => {
    expect(cleanTxt("  hello   world  ")).toBe("hello world")
  })
  it("lida com null", () => {
    expect(cleanTxt(null)).toBe("")
  })
  it("lida com undefined", () => {
    expect(cleanTxt(undefined)).toBe("")
  })
  it("mantém texto simples", () => {
    expect(cleanTxt("ok")).toBe("ok")
  })
})

describe("isSim", () => {
  it('reconhece "Sim"', () => {
    expect(isSim("Sim")).toBe(true)
  })
  it('reconhece "sim" em minúsculas', () => {
    expect(isSim("sim")).toBe(true)
  })
  it('reconhece "Realizado" com acento', () => {
    expect(isSim("Realizado")).toBe(true)
  })
  it('reconhece "Evoluído" com acento', () => {
    expect(isSim("Evoluído")).toBe(true)
  })
  it('reconhece "1"', () => {
    expect(isSim("1")).toBe(true)
  })
  it('retorna false para "Não"', () => {
    expect(isSim("Não")).toBe(false)
  })
  it("retorna false para null", () => {
    expect(isSim(null)).toBe(false)
  })
  it("retorna false para string vazia", () => {
    expect(isSim("")).toBe(false)
  })
})

describe("isCancelado", () => {
  it('detecta "Cancelado"', () => {
    expect(isCancelado("Cancelado")).toBe(true)
  })
  it('detecta "cancelado" em minúsculas', () => {
    expect(isCancelado("cancelado")).toBe(true)
  })
  it('detecta "Cancelamento"', () => {
    expect(isCancelado("Cancelamento")).toBe(true)
  })
  it('retorna false para "Realizado"', () => {
    expect(isCancelado("Realizado")).toBe(false)
  })
  it("retorna false para null", () => {
    expect(isCancelado(null)).toBe(false)
  })
})

describe("htmlEsc", () => {
  it("escapa &", () => {
    expect(htmlEsc("a & b")).toBe("a &amp; b")
  })
  it("escapa <", () => {
    expect(htmlEsc("<div>")).toBe("&lt;div&gt;")
  })
  it('escapa "', () => {
    expect(htmlEsc('"valor"')).toBe("&quot;valor&quot;")
  })
  it("escapa '", () => {
    expect(htmlEsc("it's")).toBe("it&#39;s")
  })
  it("retorna string vazia para null", () => {
    expect(htmlEsc(null)).toBe("")
  })
  it("não altera texto sem caracteres especiais", () => {
    expect(htmlEsc("texto normal")).toBe("texto normal")
  })
})

describe("numeroParaTextoBR / parseNumeroBR (round-trip para inputs editáveis)", () => {
  it("numeroParaTextoBR converte ponto decimal para vírgula", () => {
    expect(numeroParaTextoBR(4266.67)).toBe("4266,67")
  })
  it("numeroParaTextoBR mantém inteiro sem casas decimais", () => {
    expect(numeroParaTextoBR(10)).toBe("10")
  })
  it("numeroParaTextoBR retorna string vazia para null/undefined", () => {
    expect(numeroParaTextoBR(null)).toBe("")
    expect(numeroParaTextoBR(undefined)).toBe("")
  })
  it("round-trip: numeroParaTextoBR -> parseNumeroBR preserva o valor", () => {
    for (const v of [0, 10, 19.33, 4266.67, 16000, 22.5]) {
      expect(parseNumeroBR(numeroParaTextoBR(v))).toBeCloseTo(v, 6)
    }
  })
})

describe("onlyDigits", () => {
  it("remove letras e símbolos", () => {
    expect(onlyDigits("abc123def")).toBe("123")
  })
  it("mantém apenas dígitos", () => {
    expect(onlyDigits("(11) 9 9999-9999")).toBe("11999999999")
  })
  it("retorna string vazia para null", () => {
    expect(onlyDigits(null)).toBe("")
  })
  it("retorna string vazia se não há dígitos", () => {
    expect(onlyDigits("abc")).toBe("")
  })
})
