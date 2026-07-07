// PDF individual e XLSX consolidado da Análise Futura — porte de
// calculadora-remuneracao/src/views/AnaliseFutura/{gerarPDFAnalise,exportarAnalise}.js.
// Mesmo padrão já usado em documento.ts (gerarPDF/gerarWord): HTML em Blob +
// window.open + auto-print (não é jsPDF real, é impressão do navegador para PDF).

import * as XLSX from "xlsx"
import { htmlEsc, fmt, fmtH, fmtNumBR, fmtPct, fmtPctOcup } from "./formatacao"
import { DOW_PT_LONG, novaBaseOcup, somaBaseOcup, finalizarBaseOcup, resumoOcupacaoProfissional, regraMusicoterapiaTexto, temBaseOcupacaoLinha } from "./ocupacao"
import { DOW_PT } from "@/lib/cronograma/ocupacaoConst"
import type { ProfissionalAnalise } from "./calculo"

export type AnaliseFuturaPdfOpts = {
  analMes: string | null
  csvName?: string | null
  presenca: number
  ccPA: number
  ccPE: number
  etaBonus: number
}

// ─── PDF individual (janela de impressão) ─────────────────────────────────────

export function montarHtmlAnaliseFuturaProfissional(d: ProfissionalAnalise, opts: AnaliseFuturaPdfOpts): string {
  const { analMes, csvName, presenca, ccPE } = opts
  const esc = htmlEsc
  const dataHoje = new Date().toLocaleDateString("pt-BR")
  const resumo = resumoOcupacaoProfissional(d)
  const temMusic = d.terapiaDetails.some(t => t.terp === "Musicoterapia")
  const temETA = d.terapiaDetails.some(t => t.terp === "Especialista Técnico de Área")
  const bruto100 = d.delta100 !== null ? fmtPct(d.delta100) : "—"
  const brutoX = d.deltaX !== null ? fmtPct(d.deltaX) : "—"

  const linhasTerapias = d.terapiaDetails.map(t => `
    <tr>
      <td><strong>${esc(t.terp)}</strong>${t.isETA ? `<br><span>Inclui Horário Administrativo quando houver.</span>` : ""}</td>
      <td>${t.sessoes || 0} sess/sem<br><span>${t.sessoesMes100 || 0} sess/mês previstas</span></td>
      <td>${t.pacientes || 0}</td>
      <td>${t.isCC ? `PE: ${fmt(ccPE)} / paciente` : `PPD: ${fmt(t.diar)} / dia`}<br><span>PA: ${fmt(t.pa)} / sessão</span></td>
      <td class="val">${fmt(t.monthly100)}</td>
      <td class="val">${fmt(t.monthlyX)}</td>
    </tr>`).join("")

  const diasComBase = (d.ocupacao?.porDia || []).filter(temBaseOcupacaoLinha)
  const turnosComBase = (d.ocupacao?.porTurno || []).filter(temBaseOcupacaoLinha)

  const linhasDias = diasComBase.map(x => `
    <tr>
      <td>${esc(x.dia)}${x.unidadeTexto ? `<br><span>${esc(x.unidadeTexto)}</span>` : ""}</td>
      <td>${esc(x.baseTexto)}</td>
      <td>${fmtH(x.horasOcupadas)}</td>
      <td>${fmtH(x.horasLivres)}</td>
      <td class="val">${fmtPctOcup(x.pct)}${x.baseCompacta ? `<br><span>(${esc(x.baseCompacta)})</span>` : ""}</td>
    </tr>`).join("") || `<tr><td colspan="5">Sem dias com base de agenda para exibir.</td></tr>`

  const linhasTurnos = turnosComBase.map(x => `
    <tr>
      <td>${esc(DOW_PT[x.dow])} · ${esc(x.turno)}${x.unidadeTexto ? `<br><span>${esc(x.unidadeTexto)}</span>` : ""}</td>
      <td>${esc(x.baseTexto)}</td>
      <td>${fmtH(x.horasOcupadas)}</td>
      <td>${fmtH(x.horasLivres)}</td>
      <td class="val">${fmtPctOcup(x.pct)}${x.baseCompacta ? `<br><span>(${esc(x.baseCompacta)})</span>` : ""}</td>
    </tr>`).join("") || `<tr><td colspan="5">Sem recortes por turno com base de agenda para exibir.</td></tr>`

  const linhasSlots = temMusic
    ? (d.ocupacao?.slots || []).filter(s => s.terp === "Musicoterapia").map(s => `
    <tr>
      <td>${esc(DOW_PT_LONG[s.dow as 1 | 2 | 3 | 4 | 5] || "")}</td>
      <td>${String(Math.floor(s.ini / 60)).padStart(2, "0")}:${String(s.ini % 60).padStart(2, "0")}–${String(Math.floor(s.fim / 60)).padStart(2, "0")}:${String(s.fim % 60).padStart(2, "0")}</td>
      <td>${s.capacidade}</td><td>${s.ocupados}</td><td>${s.livres}</td>
      <td class="val">${fmtPctOcup(s.pct)}</td>
    </tr>`).join("")
    : ""

  const notaMusic = temMusic ? `<div class="note purple"><strong>${esc(regraMusicoterapiaTexto(d.prof))}</strong></div>` : ""
  const notaETA = temETA ? `<div class="note orange"><strong>Especialista Técnico de Área:</strong> quando existir "Horário Administrativo", o documento separa esse tempo dos horários com paciente.</div>` : ""

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Análise Futura — ${esc(d.prof)}</title>
<style>
@page{margin:1.35cm;size:A4}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;font-size:10.5px;color:#222847;margin:0;background:#fff;line-height:1.42}
.header{border-bottom:3px solid #222847;padding-bottom:12px;margin-bottom:12px}.eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#8f6aa8;font-weight:800}.h1{font-size:20px;font-weight:900;color:#222847;margin-top:2px}.sub{font-size:10px;color:#6b7280;margin-top:2px}
.banner{background:#222847;color:#fff;border-radius:8px;padding:11px 14px;margin:10px 0 12px}.banner strong{font-size:13px}.banner span{opacity:.86}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin:10px 0}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:10px 0}
.card{border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#f8fafc}.card.blue{background:#eff6ff;border-color:#bfdbfe}.card.lime{background:#f0fdf4;border-color:#bbf7d0}.card.purple{background:#f5f3ff;border-color:#ddd6fe}.card.orange{background:#fff7ed;border-color:#fed7aa}
.label{font-size:9px;color:#6b7280;font-weight:700}.num{font-size:18px;font-weight:900;color:#222847;margin-top:2px}.small{font-size:9px;color:#6b7280;margin-top:4px;line-height:1.5}
.pos{color:#15803d;font-weight:900}.neg{color:#dc2626;font-weight:900}
.section{font-size:12px;font-weight:900;color:#222847;border-top:2px solid #e2e8f0;padding-top:8px;margin:14px 0 7px}
table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#f0f4f8;text-align:left;font-size:9px;color:#555;padding:6px;border-bottom:2px solid #dbe3ea}td{padding:6px;border-bottom:1px solid #edf2f7;vertical-align:top}td span{font-size:8.5px;color:#6b7280}.val{text-align:right;font-weight:900}
.note{font-size:9px;color:#555;border-radius:6px;padding:8px 10px;margin:8px 0}.note.purple{background:#f5f3ff}.note.orange{background:#fff7ed}
.footer{margin-top:14px;border-top:1px solid #e5e7eb;padding-top:8px;text-align:center;font-size:8px;color:#777}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="header"><div class="eyebrow">Universo ABA · Análise Futura Individual</div><div class="h1">${esc(d.prof)}</div><div class="sub">${esc(d.terapiaDetails.map(t => t.terp).join(" · "))} · ${analMes ? esc(analMes) : "mês não identificado"} · Base: ${esc(csvName || "grade importada")}</div></div>
<div class="banner"><strong>Projeção individual de faturamento e ocupação</strong><br><span>Documento de planejamento. Não utiliza canceladas, cedidas, substituições ou registros pendentes, porque a análise é futura.</span></div>
<div class="grid">
  <div class="card"><div class="label">Contrato antigo / mês</div><div class="num">${d.temAntigo ? fmt(d.salAntigo!) : "Sem valor cadastrado"}</div><div class="small">${d.contrato ? `Contrato ${esc(d.contrato)}<br>` : ""}${d.chSemanal ? `${fmtNumBR(d.chSemanal, d.chSemanal % 1 ? 2 : 0)}h/sem contratadas<br>` : ""}${d.valorHoraSemAntigo !== null ? `Valor anterior por h/sem: ${fmt(d.valorHoraSemAntigo)}` : ""}</div></div>
  <div class="card purple"><div class="label">Carga agendada</div><div class="num">${fmtH(d.horasSemanaTotal)}</div><div class="small">${d.jornadaResumo ? `${esc(d.jornadaResumo)}<br>` : ""}Antigo proporcional: <strong>${d.salAntigoProporcional ? fmt(d.salAntigoProporcional) : "—"}</strong></div></div>
</div>
<div class="grid3">
  <div class="card lime"><div class="label">100% presença / mês</div><div class="num">${fmt(d.total100)}</div><div class="small"><span class="${(d.deltaProp100 ?? 0) >= 0 ? "pos" : "neg"}">${d.deltaProp100 !== null ? fmtPct(d.deltaProp100) : "—"}</span> vs antigo proporcional<br>Comparação bruta: ${bruto100}</div></div>
  <div class="card blue"><div class="label">${presenca}% presença / mês</div><div class="num">${fmt(d.totalX)}</div><div class="small"><span class="${(d.deltaPropX ?? 0) >= 0 ? "pos" : "neg"}">${d.deltaPropX !== null ? fmtPct(d.deltaPropX) : "—"}</span> vs antigo proporcional<br>Comparação bruta: ${brutoX}</div></div>
  <div class="card orange"><div class="label">Ocupação semanal</div><div class="num">${fmtPctOcup(d.taxaOcupacao)}</div><div class="small">${esc(d.ocupacao?.baseTexto || "—")}</div></div>
</div>
<div class="note purple"><strong>Base visual da ocupação:</strong> ${esc(resumo.principal)}</div>
${notaMusic}${notaETA}
<div class="section">Composição da projeção por terapia</div>
<table><thead><tr><th>Terapia</th><th>Volume previsto</th><th>Pacientes</th><th>Parâmetros</th><th style="text-align:right">100%</th><th style="text-align:right">${presenca}%</th></tr></thead><tbody>${linhasTerapias}</tbody></table>
<div class="section">Ocupação por dia da semana</div>
<table><thead><tr><th>Dia</th><th>Base do cálculo</th><th>CH ocupada</th><th>CH livre</th><th style="text-align:right">% ocup.</th></tr></thead><tbody>${linhasDias}</tbody></table>
<div class="section">Ocupação por dia e turno</div>
<table><thead><tr><th>Recorte</th><th>Base do cálculo</th><th>CH ocupada</th><th>CH livre</th><th style="text-align:right">% ocup.</th></tr></thead><tbody>${linhasTurnos}</tbody></table>
${temMusic ? `<div class="section">Musicoterapia — capacidade por horário</div><table><thead><tr><th>Dia</th><th>Horário</th><th>Capacidade</th><th>Preenchidas</th><th>Livres</th><th style="text-align:right">% capacidade</th></tr></thead><tbody>${linhasSlots}</tbody></table>` : ""}
<div class="footer">Documento elaborado em ${dataHoje} · Universo ABA · uso interno para planejamento de cronograma e projeção financeira individual.</div>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350))</script></body></html>`
}

export function gerarPDFAnaliseFuturaProfissional(d: ProfissionalAnalise, opts: AnaliseFuturaPdfOpts): void {
  const html = montarHtmlAnaliseFuturaProfissional(d, opts)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "width=900,height=800")
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

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
    alert("Nenhum profissional para exportar com os filtros atuais.")
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
  dadosFiltrados.forEach(d => d.terapiaDetails.forEach(t => {
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
  }))
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
