// Casos de teste TC1-TC12 da Seção 14 do PRD "Sistema de Faturamento de
// Prestadores (PA/PEP) v2.7" — base V = R$ 133,34. TC11 é PA (fora do escopo
// deste motor); os demais validam o motor de cálculo da PEP em calculoPEP.ts.

import { describe, expect, it } from "vitest"
import {
  calcularAjusteRecorrentes,
  calcularAjusteSemestrais,
  calcularDevolucaoRetroativa,
  calcularPEPPaciente,
  type EntregaRecorrente,
  type PendenciaSemestral,
} from "./calculoPEP"

const V = 133.34

// Catálogo (Seção 7.1): pesos mensais dos 4 recorrentes.
const SUPERVISAO = { itemCodigo: "SUPERVISAO_TECNICA", pesoMensal: 0.30 }
const ESTUDO = { itemCodigo: "ESTUDO_TECNICO", pesoMensal: 0.30 }
const TAP = { itemCodigo: "TREINAMENTO_APLICADORES", pesoMensal: 0.25 }
const PARENTAL = { itemCodigo: "TREINAMENTO_PARENTAL", pesoMensal: 0.15 }

function recorrentesCompletos(quantidadeEsperadaSupervisaoEstudo = 4): EntregaRecorrente[] {
  return [
    { ...SUPERVISAO, quantidadeEsperada: quantidadeEsperadaSupervisaoEstudo, quantidadeEntregue: quantidadeEsperadaSupervisaoEstudo },
    { ...ESTUDO, quantidadeEsperada: quantidadeEsperadaSupervisaoEstudo, quantidadeEntregue: quantidadeEsperadaSupervisaoEstudo },
    { ...TAP, quantidadeEsperada: 2, quantidadeEntregue: 2 },
    { ...PARENTAL, quantidadeEsperada: 1, quantidadeEntregue: 1 },
  ]
}

const SEMESTRAIS_CATALOGO = {
  OE: { itemCodigo: "ORIENTACAO_ESCOLAR", percentualAjuste: 0.10 },
  RT: { itemCodigo: "RELATORIO_TECNICO", percentualAjuste: 0.20 },
  PIC: { itemCodigo: "PIC", percentualAjuste: 0.20 },
}

describe("calculoPEP — TC1-TC10 e TC12 (PRD Seção 14, V = 133,34)", () => {
  it("TC1 — 4 recorrentes feitas, sem periódico vencido → sem ajuste, 100%", () => {
    const r = calcularPEPPaciente({
      valorBruto: V,
      entregasRecorrentes: recorrentesCompletos(),
      pendenciasSemestrais: [],
    })
    expect(r.valorLiquido).toBe(133.34)
  })

  it("TC2 — faltaram 2 das 4 supervisões → -15% → R$ 113,34 (85%)", () => {
    const entregas = recorrentesCompletos()
    entregas[0] = { ...SUPERVISAO, quantidadeEsperada: 4, quantidadeEntregue: 2 }
    const r = calcularPEPPaciente({ valorBruto: V, entregasRecorrentes: entregas, pendenciasSemestrais: [] })
    expect(r.ajusteRecorrentesValor).toBeCloseTo(20.00, 2)
    expect(r.valorLiquido).toBe(113.34)
  })

  it("TC3 — 4 recorrentes + 3 periódicas todas feitas → sem ajuste, 100%", () => {
    const r = calcularPEPPaciente({
      valorBruto: V,
      entregasRecorrentes: recorrentesCompletos(),
      pendenciasSemestrais: [], // entregues => não entram como pendência
    })
    expect(r.valorLiquido).toBe(133.34)
  })

  it("TC4 — 4 feitas; PIC e Relatório não entregues → -40% → R$ 80,00 (60%)", () => {
    const pendencias: PendenciaSemestral[] = [SEMESTRAIS_CATALOGO.RT, SEMESTRAIS_CATALOGO.PIC]
    const r = calcularPEPPaciente({ valorBruto: V, entregasRecorrentes: recorrentesCompletos(), pendenciasSemestrais: pendencias })
    expect(r.ajusteSemestraisValor).toBeCloseTo(53.34, 2)
    expect(r.valorLiquido).toBe(80.00)
  })

  it("TC5 — 4 feitas; as 3 semestrais vencidas e não entregues → soma 50% → R$ 66,67", () => {
    const pendencias = Object.values(SEMESTRAIS_CATALOGO)
    const r = calcularPEPPaciente({ valorBruto: V, entregasRecorrentes: recorrentesCompletos(), pendenciasSemestrais: pendencias })
    expect(r.ajusteSemestraisValor).toBeCloseTo(66.67, 2)
    expect(r.valorLiquido).toBe(66.67)
  })

  it("TC6 — TC5 e as semestrais seguem pendentes no mês seguinte → ajuste reaplicado, R$ 66,67 de novo", () => {
    const pendencias = Object.values(SEMESTRAIS_CATALOGO)
    const mes1 = calcularPEPPaciente({ valorBruto: V, entregasRecorrentes: recorrentesCompletos(), pendenciasSemestrais: pendencias })
    const mes2 = calcularPEPPaciente({
      valorBruto: V,
      entregasRecorrentes: recorrentesCompletos(),
      pendenciasSemestrais: pendencias,
      saldoRemanescenteAnterior: mes1.saldoRemanescenteNovo, // 0 — o ajuste não excedeu V
    })
    expect(mes2.valorLiquido).toBe(66.67)
  })

  it("TC7 — PIC entregue e aceito no 3º mês → devolve todos os ajustes anteriores do PIC", () => {
    const historico = [
      { itemCodigo: "PIC", valor: 26.67 }, // mês 1
      { itemCodigo: "PIC", valor: 26.67 }, // mês 2
      { itemCodigo: "RELATORIO_TECNICO", valor: 26.67 }, // outro item, não deve entrar
    ]
    const devolucao = calcularDevolucaoRetroativa(historico, "PIC")
    expect(devolucao).toBeCloseTo(53.34, 2)
  })

  it("TC8 — relatório de reprogramação (impedimento terapêutico) aceito → sem ajuste, 100% enquanto vigente", () => {
    const pendencias: PendenciaSemestral[] = [{ ...SEMESTRAIS_CATALOGO.PIC, suspensaPorReprogramacao: true }]
    const r = calcularPEPPaciente({ valorBruto: V, entregasRecorrentes: recorrentesCompletos(), pendenciasSemestrais: pendencias })
    expect(r.ajusteSemestraisValor).toBe(0)
    expect(r.valorLiquido).toBe(133.34)
  })

  it("TC9 — mês de 3 semanas; 3 supervisões de 3 esperadas → sem ajuste (peso unitário 10%)", () => {
    const entregas = recorrentesCompletos(3)
    const linhas = calcularAjusteRecorrentes(entregas, V)
    const supervisao = linhas.find(l => l.itemCodigo === "SUPERVISAO_TECNICA")!
    expect(supervisao.percentual).toBe(0)
    const r = calcularPEPPaciente({ valorBruto: V, entregasRecorrentes: entregas, pendenciasSemestrais: [] })
    expect(r.valorLiquido).toBe(133.34)
  })

  it("TC10 — mês de 3 semanas; 2 supervisões de 3 → -10%", () => {
    const entregas = recorrentesCompletos(3)
    entregas[0] = { ...SUPERVISAO, quantidadeEsperada: 3, quantidadeEntregue: 2 }
    const linhas = calcularAjusteRecorrentes(entregas, V)
    const supervisao = linhas.find(l => l.itemCodigo === "SUPERVISAO_TECNICA")!
    expect(supervisao.percentual).toBeCloseTo(0.10, 5)
    const r = calcularPEPPaciente({ valorBruto: V, entregasRecorrentes: entregas, pendenciasSemestrais: [] })
    expect(r.valorLiquido).toBeCloseTo(V * 0.9, 2)
  })

  it("TC12 — competência de teste (agosto/2026) → apura e demonstra, mas não aplica ajuste, 100% pago", () => {
    const entregas = recorrentesCompletos()
    entregas[0] = { ...SUPERVISAO, quantidadeEsperada: 4, quantidadeEntregue: 0 } // ajuste enorme, mas em modo teste não aplica
    const r = calcularPEPPaciente({
      valorBruto: V,
      entregasRecorrentes: entregas,
      pendenciasSemestrais: Object.values(SEMESTRAIS_CATALOGO),
      modoTeste: true,
    })
    expect(r.valorLiquido).toBe(133.34)
    expect(r.modoTeste).toBe(true)
    // mesmo em modo teste, os ajustes continuam calculados/demonstrados
    expect(r.ajusteRecorrentesValor).toBeGreaterThan(0)
    expect(r.ajusteSemestraisValor).toBeGreaterThan(0)
  })
})

describe("calculoPEP — piso zero e saldo remanescente (Seção 9.10)", () => {
  it("ajustes superando V zeram o líquido e geram saldo remanescente para o mês seguinte", () => {
    const entregas = recorrentesCompletos()
    entregas[0] = { ...SUPERVISAO, quantidadeEsperada: 4, quantidadeEntregue: 0 }
    entregas[1] = { ...ESTUDO, quantidadeEsperada: 4, quantidadeEntregue: 0 }
    const pendencias = Object.values(SEMESTRAIS_CATALOGO) // 50%
    const r = calcularPEPPaciente({ valorBruto: V, entregasRecorrentes: entregas, pendenciasSemestrais: pendencias })
    // ajuste recorrentes = 60% (Supervisão + Estudo inteiras) + 50% semestrais = 110% > 100%
    expect(r.valorLiquido).toBe(0)
    expect(r.saldoRemanescenteNovo).toBeGreaterThan(0)
  })

  it("saldo remanescente da competência anterior reduz o líquido do mês seguinte", () => {
    const r = calcularPEPPaciente({
      valorBruto: V,
      entregasRecorrentes: recorrentesCompletos(),
      pendenciasSemestrais: [],
      saldoRemanescenteAnterior: 10,
    })
    expect(r.valorLiquido).toBe(arredondarLocal(V - 10))
  })

  function arredondarLocal(v: number) {
    return Math.round((v + Number.EPSILON) * 100) / 100
  }
})
