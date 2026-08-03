import { cleanTxt, onlyDigits, htmlEsc } from "./formatacao"
import { normKey, ETA_ADMIN_NOMES } from "./constants"
import { abreviarNomePaciente } from "./pacientes"
import { PA_TEXTO_BANCO_HORAS, ProfRemunReal } from "./calculo"

export function formatCPF(v: string | null | undefined): string {
  const d = onlyDigits(v)
  if (d.length !== 11) return ""
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function formatCNPJ(v: string | null | undefined): string {
  const d = onlyDigits(v)
  if (d.length !== 14) return ""
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function findCadastroPrestador(cadastros: Record<string, any>, prof: string | null | undefined): any {
  if (!cadastros || !prof) return {}
  if (cadastros[prof]) return cadastros[prof] || {}
  const nk = normKey(prof)
  const key = Object.keys(cadastros).find(k => normKey(k) === nk)
  return key ? (cadastros[key] || {}) : {}
}

export function pickFirst(...vals: any[]): string {
  return vals.map(cleanTxt).find(Boolean) || ""
}

export function resolverContratoPrestador(cadastro: any, p: any, tipo: "pj" | "pf"): string {
  const contrato = tipo === "pj"
    ? pickFirst(cadastro.contratoPJ, cadastro.contratoPj, cadastro.contrato, p.contratoPJ, p.contratoPj, p.contratoNovo)
    : pickFirst(cadastro.contratoPF, cadastro.contratoPf, cadastro.contrato, p.contratoPF, p.contratoPf, p.contratoNovo)
  if (contrato) return contrato
  return tipo === "pj" ? "PS.ABA-01-00000001" : "PS.ABA-PF-00000001"
}

export interface DocInfo {
  tipo: "pj" | "pf"
  icone: string
  docLabel: string
  docNumero: string
  principal: string
  principalUpper: string
  responsavelLegal: string
  contrato: string
}

export function montarInfoDocumentoPrestador(p: any, modoSelecionado: string, cadastros: Record<string, any>): DocInfo {
  const cadastro = findCadastroPrestador(cadastros, p?.prof)
  const rawCNPJ = pickFirst(cadastro.cnpj, cadastro.CNPJ, p?.cnpj, p?.CNPJ)
  const rawCPF = pickFirst(cadastro.cpf, cadastro.CPF, p?.cpf, p?.CPF)
  const razaoSocial = pickFirst(cadastro.razaoSocial, cadastro.razao_social, cadastro.razao, cadastro.nomePJ, cadastro.pessoaJuridica, p?.razaoSocial, p?.razao_social)
  const temPJ = !!(formatCNPJ(rawCNPJ) || razaoSocial)
  const tipo = modoSelecionado === "pj" ? "pj" : modoSelecionado === "pf" ? "pf" : temPJ ? "pj" : "pf"
  const nomePF = pickFirst(cadastro.nome, cadastro.nomeCompleto, p?.prof) || "NOME DO PRESTADOR"
  const principal = tipo === "pj" ? (razaoSocial || "RAZÃO SOCIAL NÃO CADASTRADA") : nomePF
  const responsavelLegal = pickFirst(cadastro.responsavelLegal, cadastro.responsavel, cadastro.representanteLegal, p?.prof) || nomePF
  const docNumero = tipo === "pj" ? (formatCNPJ(rawCNPJ) || "00.000.000/0001-00") : (formatCPF(rawCPF) || "000.000.000-00")
  
  return {
    tipo,
    icone: tipo === "pj" ? "🏢" : "👤",
    docLabel: tipo === "pj" ? "CNPJ" : "CPF",
    docNumero,
    principal,
    principalUpper: principal.toUpperCase(),
    responsavelLegal,
    contrato: resolverContratoPrestador(cadastro, p || {}, tipo),
  }
}

export interface PdfOpts {
  remunIndPfPj: string
  remPeriodo?: { inicio: string, fim: string } | null
  ccPA: number
  ccPE: number
  etaBonus: number
  taxasPA: Record<string, number>
  cadastroPrestadores: Record<string, any>
  autoPrint?: boolean
  wordMode?: boolean
}

export function montarHtmlDocumentoFaturamento(p: ProfRemunReal, opts: PdfOpts): string {
  const { remunIndPfPj, remPeriodo, ccPA, ccPE, etaBonus, taxasPA, cadastroPrestadores, autoPrint = false, wordMode = false } = opts
  const totalSessoes = p.evoluidasProprias + p.substituicoesRealizadas
  const isCC = (p.pe ?? 0) > 0 || p.sessoes.some(s => s.especialidade === "Coordenador de Caso")
  const isETA = p.sessoes.some(s => s.especialidade === "Especialista Técnico de Área")
  const hasDiaria = (p.diariaPeriodo ?? 0) > 0
  const per = remPeriodo
  const periodoTxt = `${per?.inicio || "—"} a ${per?.fim || "—"}`
  const docInfo = montarInfoDocumentoPrestador(p, remunIndPfPj, cadastroPrestadores)
  
  const peConfirmadoDetalhe = p.peConfirmadoDetalhe ?? p.peIntegralConfirmadoDetalhe ?? []
  const peConfirmadoQtd = p.peProporcionalAtivo ? (p.peConfirmadoQtd ?? peConfirmadoDetalhe.length) : (p.pacientesCCQtd || 0)
  const peConfirmadoValor = p.peProporcionalAtivo ? (p.peConfirmadoValor ?? peConfirmadoDetalhe.reduce((s, x) => s + Number(x.valor || 0), 0)) : (p.pe || 0)
  // Valor fixo do contrato em banco de horas: não é apurado por sessão, então não
  // está em p.valorConfirmado — entra como linha própria e soma no total, senão o
  // demonstrativo do prestador sairia sem a parte principal do que ele recebe.
  const fixoBancoHoras = p.valorFixoBancoHoras ?? 0
  const valorConfirmadoPrestador = p.valorConfirmado - (p.pe || 0) + peConfirmadoValor + fixoBancoHoras

  const paBreakdown: Record<string, { count: number, rate: number, total: number, explicacao: string }> = {}
  const outroContratoBreakdown: Record<string, { count: number, explicacao: string, bancoHoras: boolean }> = {}
  
  p.sessoes
    .filter(s => (s.papel === "Agenda" && s.classificacao === "Evolução normal") || (s.papel === "Substituição realizada"))
    .forEach(s => {
      if (!s.especialidade) return
      const isAdm = ETA_ADMIN_NOMES.some(n => (s.paciente || "").includes(n))
      if (isAdm) return
      
      if (s.semPA || s.valorPATexto) {
        const key = s.especialidade
        if (!outroContratoBreakdown[key]) outroContratoBreakdown[key] = {
          count: 0,
          explicacao: s.explicacaoPA || "",
          // "Tratado em outro contrato" e "Banco de Horas" zeram o PA por motivos
          // diferentes e não podem sair com o mesmo texto no demonstrativo.
          bancoHoras: s.valorPATexto === PA_TEXTO_BANCO_HORAS,
        }
        outroContratoBreakdown[key].count++
        return
      }
      
      const rate = s.valorPA ?? (s.especialidade === "Coordenador de Caso" ? ccPA : (taxasPA[s.especialidade] || 0))
      const key = s.funcaoPA || s.especialidade
      if (!paBreakdown[key]) paBreakdown[key] = { count: 0, rate, total: 0, explicacao: s.explicacaoPA || "" }
      paBreakdown[key].count++
      paBreakdown[key].total += rate
      paBreakdown[key].rate = rate
    })

  const pacientesCC = isCC
    ? (p.peProporcionalAtivo
        ? Array.from(new Set(peConfirmadoDetalhe.map(x => String(x.paciente))))
        : Array.from(new Set(p.sessoes.filter(s => s.especialidade === "Coordenador de Caso" && s.paciente).map(s => String(s.paciente))))
      ).sort()
    : []
  const pacientesCCAbrev = pacientesCC.map(abreviarNomePaciente).filter(Boolean) as string[]
  
  const money = (v: number | string) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`
  const esc = htmlEsc

  let linhasFinanceiras = Object.entries(paBreakdown).map(([esp, d]) => {
    const detalhe = esp === "Coordenador de Caso" ? "Coordenação Técnica ABA de Caso" : esp
    return `<tr><td><strong>PA – Valor por Atendimento Realizado</strong><br><span>${esc(detalhe)}</span></td><td>${d.count} sessão(ões) × ${money(d.rate)}</td><td class="val">${money(d.total)}</td></tr>`
  }).join("")
  
  linhasFinanceiras += Object.entries(outroContratoBreakdown).map(([esp, d]) => {
    const titulo = d.bancoHoras ? "Atendimento coberto pelo banco de horas" : "Atendimento tratado em outro contrato"
    const valor = d.bancoHoras ? "Incluído no valor fixo" : "Tratado em outro contrato"
    return `<tr><td><strong>${titulo}</strong><br><span>${esc(esp)}</span></td><td>${d.count} sessão(ões)</td><td class="val">${valor}</td></tr>`
  }).join("")

  if (fixoBancoHoras > 0) {
    const nums = (p.numerosBancoHoras ?? []).join(" / ")
    linhasFinanceiras += `<tr><td><strong>Banco de Horas – valor fixo do contrato</strong>${nums ? `<br><span>${esc(nums)}</span>` : ""}</td><td>valor total do período (não por sessão)</td><td class="val">${money(fixoBancoHoras)}</td></tr>`
  }

  if (isCC && peConfirmadoValor > 0) {
    const calcPE = p.peProporcionalAtivo
      ? `${peConfirmadoQtd} paciente(s) com PE confirmado`
      : `${p.pacientesCCQtd} paciente(s) × ${money(ccPE)}`
    linhasFinanceiras += `<tr><td><strong>PE – Valor por Entregas Técnicas</strong></td><td>${calcPE}</td><td class="val">${money(peConfirmadoValor)}</td></tr>`
  }
  
  if (hasDiaria && p.diariaDetalhe) {
    p.diariaDetalhe.forEach(d => {
      linhasFinanceiras += `<tr><td><strong>PPD – Pagamento por Diária</strong><br><span>${esc(d.esp)}</span></td><td>${d.dias} dia(s) × ${money(d.rate)}</td><td class="val">${money(d.total)}</td></tr>`
    })
  }
  
  if (isETA && (p.etaBonusPeriodo ?? 0) > 0) {
    linhasFinanceiras += `<tr><td><strong>Bônus ETA</strong></td><td>${p.etaWeeksPeriodo} semana(s) × ${money(etaBonus)}</td><td class="val">${money(p.etaBonusPeriodo ?? 0)}</td></tr>`
  }
  
  if (!linhasFinanceiras) linhasFinanceiras = `<tr><td colspan="3" class="muted">Nenhum valor confirmado para o período.</td></tr>`

  const siglasHTML = isCC
    ? `<div class="siglas"><div><strong>PE</strong> – Valor unitário vinculado às entregas técnico-metodológicas por paciente</div><div><strong>PA</strong> – Valor unitário por atendimento efetivamente realizado</div></div>`
    : `<div class="siglas"><div><strong>PA</strong> – Valor unitário por atendimento efetivamente realizado e aceito pela CONTRATANTE</div></div>`

  const fluxoHTML = `<div class="section-title">Resumo das Sessões do Período</div>
    <table class="cards"><tbody><tr>
      <td class="card navy"><div class="card-ico">📅</div><div class="card-num">${p.agendadas}</div><div class="card-title">Total vinculadas</div></td>
      <td class="card green"><div class="card-ico">✅</div><div class="card-num">${p.evoluidasProprias}</div><div class="card-title">Evoluções próprias</div></td>
      <td class="card blue"><div class="card-ico">🔄</div><div class="card-num">${p.substituicoesRealizadas}</div><div class="card-title">Substituições</div></td>
      <td class="card total"><div class="card-ico">💰</div><div class="card-num">${totalSessoes}</div><div class="card-title">${p.modalidade === "banco_horas" ? "Cobertas pelo valor fixo" : "Total elegíveis ao PA"}</div></td>
    </tr></tbody></table>`

  const pacientesHTML = isCC && pacientesCCAbrev.length > 0 ? `
    <div class="section-title">Pacientes Vinculados (CC) — ${pacientesCCAbrev.length}</div>
    <table class="pac-grid"><tbody>${pacientesCCAbrev.reduce((acc, pac, i) => {
      if (i % 3 === 0) acc += "<tr>"
      acc += `<td>${esc(pac)}</td>`
      if (i % 3 === 2) acc += "</tr>"
      return acc
    }, "")}${pacientesCCAbrev.length % 3 ? "</tr>" : ""}</tbody></table>` : ""

  const responsavelPJ = docInfo.tipo === "pj" ? `<div class="meta-line"><strong>Responsável Legal:</strong> ${esc(docInfo.responsavelLegal)}</div>` : ""
  const headerHTML = `<table class="header"><tbody><tr>
    <td class="header-icon">${docInfo.icone}</td>
    <td>
      <div class="doc-id">${docInfo.docLabel} ${esc(docInfo.docNumero)} – ${esc(docInfo.principalUpper)}</div>
      ${responsavelPJ}
      <div class="meta-line"><strong>Contrato:</strong> ${esc(docInfo.contrato)}</div>
    </td>
  </tr></tbody></table>`

  const wordXml = wordMode ? `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->` : ""
  const printScript = autoPrint ? `<script>window.addEventListener("load",()=>{window.print();})</script>` : ""
  const htmlAttrs = wordMode ? 'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : ""

  return `<!DOCTYPE html><html lang="pt-BR" ${htmlAttrs}><head><meta charset="UTF-8">
<title>Universo ABA — ${esc(p.prof)}</title>${wordXml}
<style>
@page{margin:1.8cm;size:A4}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:#222847;line-height:1.42;margin:0;background:#fff}
.header{width:100%;border-collapse:collapse;border-bottom:3px solid #222847;margin-bottom:14px;padding-bottom:10px}.header td{vertical-align:middle;padding:0 0 10px 0}.header-icon{width:48px;font-size:32px}.doc-id{font-size:17px;font-weight:800;color:#222847;margin-bottom:5px}.meta-line{font-size:10px;color:#555;line-height:1.65}
.banner{background:#222847;color:#fff;border-radius:8px;padding:12px 16px;margin:12px 0 10px}.banner-title{font-size:13px;font-weight:bold;margin-bottom:4px}.banner-sub{font-size:10px;opacity:.86}
.siglas{font-size:10px;color:#444;background:#f8fafc;border-left:3px solid #2A92C0;padding:8px 12px;margin:8px 0 14px;line-height:1.55}
.section-title{font-size:12px;font-weight:bold;color:#222847;border-left:3px solid #2A92C0;padding-left:8px;margin:15px 0 8px}
.cards{width:100%;border-collapse:separate;border-spacing:6px;margin:0 0 6px}.card{vertical-align:top;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;padding:8px;width:25%}.card-ico{font-size:15px}.card-num{font-size:20px;font-weight:bold;line-height:1;color:#222847}.card-title{font-size:10px;font-weight:bold;margin:2px 0}.card.green{background:#f0fdf4;border-color:#86efac}.card.green .card-num{color:#16a34a}.card.blue{background:#eff6ff;border-color:#93c5fd}.card.blue .card-num{color:#2563eb}.card.total{background:#222847;border-color:#222847;color:#fff}.card.total .card-num{color:#86efac}.card.navy{background:#e8e9f0}.card.navy .card-num{color:#222847}
table.fin{width:100%;border-collapse:collapse;margin-bottom:12px}table.fin th{background:#f0f4f8;text-align:left;padding:7px 10px;font-size:10px;color:#555;border-bottom:2px solid #e2e8f0}table.fin td{padding:7px 10px;font-size:10.5px;border-bottom:1px solid #f0f0f0}table.fin td span{font-size:9px;color:#666}.val{text-align:right;font-weight:bold}.total-row td{font-weight:bold;font-size:13px;background:#f0fdf4;padding:10px!important}.total-row .val{color:#3aaa5c;font-size:15px}.muted{color:#777;text-align:center}
.pac-grid{width:100%;border-collapse:separate;border-spacing:4px}.pac-grid td{background:#f0f4f8;border-radius:4px;padding:5px 8px;font-size:9.5px;width:33.33%}
.footer{margin-top:18px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:8.5px;color:#777;text-align:center;line-height:1.55}.conf{margin-top:8px;padding:8px 10px;background:#fafafa;border:1px solid #e5e7eb;border-radius:4px;font-size:8px;color:#555}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
${headerHTML}
<div class="banner"><div class="banner-title">Demonstrativo de Faturamento – Contraprestação dos Serviços · ${periodoTxt}</div><div class="banner-sub">Documento informativo e estimativo. Valores condicionados à efetiva execução dos serviços e à validação das entregas correspondentes.</div></div>
${siglasHTML}
${fluxoHTML}
<div class="section-title">Apuração do Faturamento · ${periodoTxt}</div>
<table class="fin"><thead><tr><th>Componente</th><th>Cálculo</th><th style="text-align:right">Total no período</th></tr></thead><tbody>
${linhasFinanceiras}
<tr class="total-row"><td colspan="2">TOTAL CONFIRMADO DO PERÍODO</td><td class="val">${money(valorConfirmadoPrestador)}</td></tr>
</tbody></table>
${pacientesHTML}
<div class="footer">Documento elaborado em ${new Date().toLocaleDateString("pt-BR")} · Universo ABA · Uso exclusivo do prestador identificado acima.</div>
<div class="conf"><strong>DOCUMENTO CONFIDENCIAL</strong> — Informações protegidas pela Lei nº 13.709/2018 (LGPD). Destinado exclusivamente ao prestador identificado. Vedado o compartilhamento sem autorização prévia da Universo ABA.</div>
${printScript}</body></html>`
}

export function gerarPDF(p: ProfRemunReal, opts: PdfOpts): void {
  const html = montarHtmlDocumentoFaturamento(p, { ...opts, autoPrint: true })
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "width=900,height=700")
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export function gerarWord(p: ProfRemunReal, opts: PdfOpts): void {
  const html = montarHtmlDocumentoFaturamento(p, { ...opts, wordMode: true })
  const blob = new Blob(["\uFEFF", html], { type: "application/msword;charset=utf-8" }) // BOM character is \uFEFF
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  const docInfo = montarInfoDocumentoPrestador(p, opts.remunIndPfPj, opts.cadastroPrestadores)
  const nomeArq = p.prof.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "")
  const periodo = opts.remPeriodo?.inicio ? opts.remPeriodo.inicio.replace(/\//g, "-") : "periodo"
  a.download = `Faturamento_${docInfo.tipo.toUpperCase()}_${nomeArq}_${periodo}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
