// XLSX consolidado da Análise Futura — porte de
// calculadora-remuneracao/src/views/AnaliseFutura/exportarAnalise.js.

import * as XLSX from "xlsx"
import toast from "react-hot-toast"
// novaBaseOcup/somaBaseOcup/finalizarBaseOcup vêm de ocupacaoProf.ts (não de
// lib/remuneracao/ocupacao.ts) porque é esse o motor que realmente produz
// `d.ocupacao.porEspecialidade`/`porUnidade` (ver calculo.ts) — usar o módulo
// antigo aqui fazia o texto de Base_do_Calculo/Base_Compacta do export
// divergir do que a tela mostra, mesmo com os números batendo.
import { novaBaseOcup, somaBaseOcup, finalizarBaseOcup } from "@/lib/cronograma/ocupacaoProf"
import type { ProfissionalAnalise } from "./calculo"

// ─── XLSX consolidado ──────────────────────────────────────────────────────

function linhasOcupacaoProfissional(lista: ProfissionalAnalise[]) {
  return lista.map(d => ({
    Profissional: d.prof,
    Unidade: d.ocupacao?.unidadeTexto || "",
    Especialidades: d.terapiaDetails.map(t => t.terp).join("; "),
    Ocupacao_pct: d.taxaOcupacao !== null ? +(d.taxaOcupacao * 100).toFixed(2) : null,
    Base_do_Calculo: d.ocupacao?.baseTexto || "",
    CH_Ocupada: +(d.ocupacao?.horasOcupadas || 0).toFixed(2),
    CH_Total: +(d.ocupacao?.horasTotal || 0).toFixed(2),
    CH_Livre: +(d.ocupacao?.horasLivres || 0).toFixed(2),
    Vagas_Preenchidas: +(d.ocupacao?.slotsOcupados || 0).toFixed(2),
    Vagas_Totais: +(d.ocupacao?.slotsTotal || 0).toFixed(2),
  }))
}

function linhasOcupacaoEspecialidade(lista: ProfissionalAnalise[]) {
  const mapa: Record<string, ReturnType<typeof novaBaseOcup> & { Especialidade: string }> = {}
  lista.forEach(d => d.ocupacao?.porEspecialidade?.forEach(e => {
    if (!mapa[e.terp]) mapa[e.terp] = { Especialidade: e.terp, ...novaBaseOcup() }
    somaBaseOcup(mapa[e.terp], e)
  }))
  return Object.values(mapa).sort((a, b) => a.Especialidade.localeCompare(b.Especialidade)).map(e => {
    const f = finalizarBaseOcup(e)
    return {
      Especialidade: e.Especialidade,
      Ocupacao_pct: f.pct !== null ? +(f.pct * 100).toFixed(2) : null,
      Ociosidade_pct: f.ociosidade !== null ? +(f.ociosidade * 100).toFixed(2) : null,
      Base_Compacta: f.baseCompacta,
      Base_do_Calculo: f.baseTexto,
      CH_Ocupada: +f.horasOcupadas.toFixed(2),
      CH_Total: +f.horasTotal.toFixed(2),
      CH_Livre: +f.horasLivres.toFixed(2),
    }
  })
}

function linhasOcupacaoUnidade(lista: ProfissionalAnalise[]) {
  const mapa: Record<string, ReturnType<typeof novaBaseOcup> & { Unidade: string }> = {}
  lista.forEach(d => d.ocupacao?.porUnidade?.forEach(u => {
    const nome = u.unidade || "Unidade não informada"
    if (!mapa[nome]) mapa[nome] = { Unidade: nome, ...novaBaseOcup() }
    somaBaseOcup(mapa[nome], u)
  }))
  return Object.values(mapa).sort((a, b) => a.Unidade.localeCompare(b.Unidade)).map(u => {
    const f = finalizarBaseOcup(u)
    return {
      Unidade: u.Unidade,
      Ocupacao_pct: f.pct !== null ? +(f.pct * 100).toFixed(2) : null,
      Ociosidade_pct: f.ociosidade !== null ? +(f.ociosidade * 100).toFixed(2) : null,
      Base_Compacta: f.baseCompacta,
      Base_do_Calculo: f.baseTexto,
      CH_Ocupada: +f.horasOcupadas.toFixed(2),
      CH_Total: +f.horasTotal.toFixed(2),
      CH_Livre: +f.horasLivres.toFixed(2),
    }
  })
}

export type ExportarAnaliseOpts = {
  dadosFiltrados: ProfissionalAnalise[]
  analMes: string | null
  presenca: number
  etaBonus: number
  ccPE: number
}

export function exportarAnaliseXlsx(opts: ExportarAnaliseOpts): void {
  const { dadosFiltrados, analMes, presenca, etaBonus, ccPE } = opts
  if (!dadosFiltrados.length) {
    toast.error("Nenhum profissional para exportar com os filtros atuais.")
    return
  }

  const wb = XLSX.utils.book_new()

  const resumo = dadosFiltrados.map(d => ({
    Profissional: d.prof,
    Contrato: d.contrato || "",
    CH_Semanal_Contrato: d.chSemanal || 0,
    CH_Semanal_Atual: +(d.horasSemanaTotal || 0).toFixed(2),
    Contrato_Antigo: d.salAntigo || 0,
    Contrato_Antigo_Proporcional: d.salAntigoProporcional != null ? +d.salAntigoProporcional.toFixed(2) : null,
    Terapias: d.terapiaDetails.map(t => t.terp).join("; "),
    Sessoes_Mes_100: d.terapiaDetails.reduce((s, t) => s + (t.sessoesMes100 || 0), 0),
    Pacientes: d.allPacs.length,
    Horas_Ocupadas: +(d.ocupacao?.horasOcupadas || 0).toFixed(2),
    Horas_Livres: +(d.ocupacao?.horasLivres || 0).toFixed(2),
    Horas_Total: +(d.ocupacao?.horasTotal || 0).toFixed(2),
    Ocupacao_pct: d.taxaOcupacao !== null ? +(d.taxaOcupacao * 100).toFixed(2) : null,
    Tem_Contrato_Antigo: d.temAntigo ? "Sim" : "Não",
    Valor_100: +d.total100.toFixed(2),
    Valor_Presenca_Config: +d.totalX.toFixed(2),
    Percentual_Presenca_Config: presenca,
    Variacao_100_Prop_pct: d.deltaProp100 !== null ? +d.deltaProp100.toFixed(1) : null,
    Variacao_Presenca_Prop_pct: d.deltaPropX !== null ? +d.deltaPropX.toFixed(1) : null,
    Alerta_CC: d.alertaCC ? "Sim" : "Não",
    Pacientes_CC: d.pacCC || 0,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo analise")

  const detalhe: Record<string, unknown>[] = []
  dadosFiltrados.forEach(d => {
    d.terapiaDetails.forEach(t => {
      detalhe.push({
        Profissional: d.prof,
        Terapia: t.terp,
        PA_Sessao: t.pa,
        Diaria: t.diar,
        Bonus_ETA_Semana: t.isETA ? etaBonus : 0,
        Semanas_ETA_Mes: t.isETA ? (t.etaWeeks || 0) : 0,
        PE_por_Pac: t.isCC ? ccPE : 0,
        Sessoes_Semana: t.sessoes,
        Sessoes_Mes_100: t.sessoesMes100,
        Pacientes: t.pacientes,
        Valor_PPD_Mes: +t.mensalDiaria.toFixed(2),
        Valor_PA_100: +t.mensalPA100.toFixed(2),
        Valor_PA_Presenca: +t.mensalPAX.toFixed(2),
        Valor_Bonus_ETA: +(t.mensalETA100 || 0).toFixed(2),
        Total_100: +t.monthly100.toFixed(2),
        Total_Presenca: +t.monthlyX.toFixed(2),
      })
    })
    // PE (Coordenador de Caso) é apurado por profissional, não por terapia —
    // some `d.pe` diretamente em `Valor_100`/`Valor_Presenca_Config` do Resumo.
    // Sem esta linha, somar Total_100 das terapias não bate com o Resumo quando há CC.
    if (d.hasCC && d.pe > 0) {
      detalhe.push({
        Profissional: d.prof,
        Terapia: "PE (Coordenador de Caso)",
        PA_Sessao: 0,
        Diaria: 0,
        Bonus_ETA_Semana: 0,
        Semanas_ETA_Mes: 0,
        PE_por_Pac: ccPE,
        Sessoes_Semana: 0,
        Sessoes_Mes_100: 0,
        Pacientes: d.pacCC,
        Valor_PPD_Mes: 0,
        Valor_PA_100: 0,
        Valor_PA_Presenca: 0,
        Valor_Bonus_ETA: 0,
        Total_100: +d.pe.toFixed(2),
        Total_Presenca: +d.pe.toFixed(2),
      })
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), "Detalhe por terapia")

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasOcupacaoProfissional(dadosFiltrados)), "Ocupacao profissional")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasOcupacaoEspecialidade(dadosFiltrados)), "Ocupacao especialidade")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasOcupacaoUnidade(dadosFiltrados)), "Ocupacao unidade")

  const pendentes = dadosFiltrados.filter(d => !d.temAntigo).map(d => ({
    Profissional: d.prof,
    Contrato: d.contrato || "",
    Terapias: d.terapiaDetails.map(t => t.terp).join("; "),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendentes), "Contratos pendentes")

  XLSX.writeFile(wb, `Analise_projecao_${(analMes || "sem_mes").replace(/\s+/g, "_")}.xlsx`)
}
