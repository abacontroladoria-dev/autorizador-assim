'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B, ETA_ADMIN_NOMES, DEFAULT_CC_LIM } from '../lib/constants'
import { fmt, normKey, isSim } from '../lib/helpers'
import { InteractivePieChart } from '../shared/Charts'
import type { RealProfData, NormalizedSession } from '../lib/types'

interface Props {
  p: RealProfData
  modoRP: boolean
}

function gerarPDF(
  p: RealProfData,
  { ccPA, ccPME, taxasPA, etaBonus, dadosPorProf, remPeriodo }: {
    ccPA: number; ccPME: number; taxasPA: Record<string,number>; etaBonus: number;
    dadosPorProf: import('../lib/types').ProfData[];
    remPeriodo: { inicio: string; fim: string } | null;
  }
) {
  const totalSessoes = p.evoluidasProprias + p.substituicoesRealizadas
  const baseCalcPdf = p.agendadas - p.canceladas
  const isCC = p.pme > 0 || p.sessoes.some(s => s.especialidade === 'Coordenador de Caso')
  const isETA = p.sessoes.some(s => s.especialidade === 'Especialista Técnico de Área')
  const hasDiaria = p.diariaPeriodo > 0
  const per = remPeriodo

  const paBreakdown: Record<string, { count: number; rate: number; total: number }> = {}
  p.sessoes
    .filter(s => (s.papel === 'Agenda' && s.classificacao === 'Evolução normal') || s.papel === 'Substituição realizada')
    .forEach(s => {
      if (!s.especialidade) return
      const isAdm = ETA_ADMIN_NOMES.some(n => (s.paciente || '').includes(n))
      if (isAdm) return
      const rate = s.especialidade === 'Coordenador de Caso' ? ccPA : (taxasPA[s.especialidade] || 0)
      if (!paBreakdown[s.especialidade]) paBreakdown[s.especialidade] = { count: 0, rate, total: 0 }
      paBreakdown[s.especialidade].count++
      paBreakdown[s.especialidade].total += rate
    })

  const pacientesCC = isCC
    ? [...new Set(p.sessoes.filter(s => s.especialidade === 'Coordenador de Caso' && s.paciente).map(s => s.paciente))].sort()
    : []

  let linhasFinanceiras = Object.entries(paBreakdown).map(([esp, d]) =>
    `<tr>
      <td>${esp.replace('Coordenador de Caso', 'Coordenação de Caso')}</td>
      <td class="calc">PA · ${d.count} sessão(ões) × R$ ${d.rate.toFixed(2).replace('.', ',')} <span class="tag">PA</span></td>
      <td class="val">R$ ${d.total.toFixed(2).replace('.', ',')}</td>
    </tr>`
  ).join('')

  if (isCC && p.pme > 0) linhasFinanceiras +=
    `<tr>
      <td>PME · Coordenação de Caso</td>
      <td class="calc">${p.pacientesCCQtd} paciente(s) único(s) × R$ ${ccPME.toFixed(2).replace('.', ',')} <span class="tag pme">PME</span></td>
      <td class="val">R$ ${p.pme.toFixed(2).replace('.', ',')}</td>
    </tr>`

  if (hasDiaria) p.diariaDetalhe.forEach(d => {
    linhasFinanceiras +=
      `<tr>
        <td>PPD · ${d.esp}</td>
        <td class="calc">${d.dias} dia(s) presente(s) × R$ ${d.rate.toFixed(2).replace('.', ',')} <span class="tag ppd">PPD</span></td>
        <td class="val">R$ ${d.total.toFixed(2).replace('.', ',')}</td>
      </tr>`
  })

  if (isETA && p.etaBonusPeriodo > 0) linhasFinanceiras +=
    `<tr>
      <td>Bônus ETA · Especialista Técnico de Área</td>
      <td class="calc">${p.etaWeeksPeriodo} semana(s) × R$ ${etaBonus.toFixed(2).replace('.', ',')} <span class="tag eta">ETA</span></td>
      <td class="val">R$ ${p.etaBonusPeriodo.toFixed(2).replace('.', ',')}</td>
    </tr>`

  const pacientesHTML = isCC && pacientesCC.length > 0
    ? `<div class="section-title">Pacientes Vinculados — Coordenação de Caso (${pacientesCC.length})</div>
       <div class="pac-grid">${pacientesCC.map(pac => `<div class="pac-chip">${pac}</div>`).join('')}</div>`
    : ''

  const fluxoHTML = `
    <div class="fluxo">
      <div class="fluxo-row">
        <div class="fluxo-step step-gray"><div class="fluxo-ico">🚫</div><div class="fluxo-body">
          <div class="fluxo-num gray">${p.canceladas}</div>
          <div class="fluxo-label">Canceladas</div>
          <div class="fluxo-desc">Sessões registradas como canceladas. Não geram PA.</div>
        </div></div>
        <div class="fluxo-step step-red"><div class="fluxo-ico">🔁</div><div class="fluxo-body">
          <div class="fluxo-num red">${p.substituidoPorOutro}</div>
          <div class="fluxo-label">Cedidas para outro profissional</div>
          <div class="fluxo-desc">Sessões evoluídas por outra pessoa. O PA destas pertence a quem evoluiu.</div>
        </div></div>
        ${(p.pendentes + p.naoEvoluidas) > 0
          ? `<div class="fluxo-step step-amber-hi"><div class="fluxo-ico">⏳</div><div class="fluxo-body">
              <div class="fluxo-num amber">${p.pendentes + p.naoEvoluidas}</div>
              <div class="fluxo-label">REGISTRO NÃO REALIZADO</div>
              <div class="fluxo-desc">Sessões sem evolução/tratativa registrada pelo profissional.</div>
             </div></div>`
          : `<div class="fluxo-step step-ok"><div class="fluxo-ico">✅</div><div class="fluxo-body">
              <div class="fluxo-num green">0</div>
              <div class="fluxo-label">Todos os registros realizados</div>
              <div class="fluxo-desc">Nenhuma sessão com registro não realizado neste período. ✓</div>
             </div></div>`
        }
      </div>
      <div class="fluxo-sep"></div>
      <div class="fluxo-row">
        <div class="fluxo-step step-default"><div class="fluxo-ico">📅</div><div class="fluxo-body">
          <div class="fluxo-num default">${p.agendadas}</div>
          <div class="fluxo-label">Total de sessões agendadas</div>
          <div class="fluxo-desc">Todos os registros na agenda entre ${per?.inicio || '—'} e ${per?.fim || '—'}.</div>
        </div></div>
        <div class="fluxo-step step-green"><div class="fluxo-ico">✅</div><div class="fluxo-body">
          <div class="fluxo-num green">${p.evoluidasProprias}</div>
          <div class="fluxo-label">Evoluções dos próprios agendamentos</div>
          <div class="fluxo-desc">Sessões da agenda deste profissional que ele mesmo evoluiu. Geram PA.</div>
        </div></div>
        <div class="fluxo-step step-blue"><div class="fluxo-ico">🔄</div><div class="fluxo-body">
          <div class="fluxo-num blue">${p.substituicoesRealizadas}</div>
          <div class="fluxo-label">Substituições realizadas</div>
          <div class="fluxo-desc">Sessões de outro profissional que este evoluiu. Também geram PA.</div>
        </div></div>
        <div class="fluxo-step step-total"><div class="fluxo-ico">💰</div><div class="fluxo-body">
          <div class="fluxo-num white">${totalSessoes}</div>
          <div class="fluxo-label">Total de sessões remuneráveis</div>
          <div class="fluxo-desc">${p.evoluidasProprias} evoluções próprias + ${p.substituicoesRealizadas} substituições = base de cálculo do PA.</div>
        </div></div>
      </div>
    </div>`

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Universo ABA — ${p.prof}</title>
<style>
@page{margin:1.8cm;size:A4}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1a2e;line-height:1.4}
.header{display:flex;align-items:flex-start;gap:20px;border-bottom:3px solid #222847;padding-bottom:14px;margin-bottom:16px}
.logo-text{font-size:11px;font-weight:900;color:#222847;letter-spacing:0.05em;text-transform:uppercase}
.logo-text span{color:#2A92C0;font-size:22px;display:block;line-height:1}
.prof-name{font-size:17px;font-weight:bold;color:#222847;margin-bottom:4px}
.prof-meta{font-size:10px;color:#666;line-height:1.7}
.banner{background:#222847;color:#fff;border-radius:8px;padding:12px 16px;margin-bottom:16px}
.banner-title{font-size:13px;font-weight:bold;margin-bottom:3px}
.banner-sub{font-size:10px;opacity:.75}
.metrics{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;flex:1}
.metric{background:#f8fafc;border-radius:8px;padding:10px 12px;text-align:center}
.metric .lbl{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
.metric .val-m{font-size:19px;font-weight:bold}
.section-title{font-size:12px;font-weight:bold;color:#222847;border-left:3px solid #2A92C0;padding-left:8px;margin:16px 0 8px}
table.fin{width:100%;border-collapse:collapse;margin-bottom:12px}
table.fin th{background:#f0f4f8;text-align:left;padding:6px 10px;font-size:10px;color:#555}
table.fin td{padding:6px 10px;font-size:11px;border-bottom:1px solid #f0f0f0}
table.fin .val{text-align:right;font-weight:600}
table.fin .calc{font-size:10px;color:#666}
.tag{display:inline-block;font-size:9px;font-weight:bold;padding:1px 5px;border-radius:3px;margin-left:4px;background:#e0f2fe;color:#0369a1}
.tag.pme{background:#f3e8ff;color:#7c3aed}
.tag.ppd{background:#fff7ed;color:#c2410c}
.tag.eta{background:#fef9c3;color:#92400e}
table.fin .total-row td{font-weight:bold;font-size:14px;background:#f0fdf4;padding:10px}
.total-row .val{color:#3aaa5c;font-size:16px}
.pac-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:4px}
.pac-chip{background:#f0f4f8;padding:4px 8px;border-radius:4px;font-size:10px}
.footer{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9px;color:#aaa;text-align:center;line-height:1.6}
.fluxo{margin-bottom:12px}
.fluxo-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:8px}
.fluxo-step{border-radius:8px;padding:10px 12px;border:1px solid #e2e8f0;display:flex;align-items:flex-start;gap:8px}
.fluxo-step.step-default{background:#f8fafc;border-color:#e2e8f0}
.fluxo-step.step-green{background:#f0fdf4;border-color:#86efac}
.fluxo-step.step-blue{background:#eff6ff;border-color:#93c5fd}
.fluxo-step.step-total{background:#222847;border-color:#222847;color:#fff}
.fluxo-step.step-gray{background:#f9fafb;border-color:#d1d5db}
.fluxo-step.step-red{background:#fff5f5;border-color:#fca5a5}
.fluxo-step.step-amber-hi{background:#fffbeb;border:2px solid #f59e0b}
.fluxo-step.step-ok{background:#f0fdf4;border-color:#86efac}
.fluxo-sep{height:1px;background:#e2e8f0;margin:8px 0}
.fluxo-ico{font-size:16px;flex-shrink:0;padding-top:2px}
.fluxo-body{flex:1}
.fluxo-num{font-size:22px;font-weight:bold;line-height:1}
.fluxo-num.green{color:#16a34a}.fluxo-num.blue{color:#2563eb}.fluxo-num.white{color:#86efac}
.fluxo-num.gray{color:#6b7280}.fluxo-num.red{color:#dc2626}.fluxo-num.amber{color:#b45309}.fluxo-num.default{color:#222847}
.fluxo-label{font-size:10px;font-weight:bold;margin:2px 0;line-height:1.3}
.fluxo-desc{font-size:9px;color:#666;line-height:1.4}
</style></head><body>
<div class="header">
  <div>
    <div class="logo-text"><span>Universo ABA</span>Relatório de Remuneração</div>
  </div>
  <div style="flex:1">
    <div class="prof-name">${p.prof}</div>
    <div class="prof-meta">
      Período: ${per?.inicio || '—'} a ${per?.fim || '—'}<br>
      ${p.contrato ? `Contrato: ${p.contrato}<br>` : ''}
      Gerado em: ${new Date().toLocaleDateString('pt-BR')}
    </div>
  </div>
</div>
<div class="banner">
  <div class="banner-title">💰 Apuração Financeira do Período</div>
  <div class="banner-sub">Baseado nas evoluções registradas · sem percentuais (documento individual)</div>
</div>
<div class="metrics">
  <div class="metric"><div class="lbl">Sessões agendadas</div><div class="val-m" style="color:#222847">${p.agendadas}</div></div>
  <div class="metric"><div class="lbl">Sessões remuneráveis</div><div class="val-m" style="color:#16a34a">${totalSessoes}</div></div>
  <div class="metric"><div class="lbl">Total a receber</div><div class="val-m" style="color:#16a34a">R$ ${p.valorConfirmado.toFixed(2).replace('.', ',')}</div></div>
</div>
<div class="section-title">Fluxo de Sessões do Período</div>
${fluxoHTML}
<div class="section-title">Apuração Financeira Detalhada</div>
<table class="fin">
  <thead><tr><th>Especialidade / Modalidade</th><th>Cálculo</th><th class="val">Valor</th></tr></thead>
  <tbody>
    ${linhasFinanceiras}
    <tr class="total-row">
      <td colspan="2" style="font-weight:bold">Total confirmado a receber</td>
      <td class="val">R$ ${p.valorConfirmado.toFixed(2).replace('.', ',')}</td>
    </tr>
  </tbody>
</table>
${pacientesHTML}
<div class="footer">
  Universo ABA · Documento gerado automaticamente pela Calculadora de Remuneração · ${new Date().toLocaleDateString('pt-BR')}<br>
  Os valores são baseados nos dados do relatório de evolução detalhada importado nesta sessão.
</div>
</body></html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)
  window.open(blobUrl, '_blank', 'width=900,height=700')
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
}

export default function ProfCardRemun({ p, modoRP }: Props) {
  const {
    dadosPorProf, limites, ccPA, ccPME, taxasPA, etaBonus,
    expandido, setExpandido, remBusca, remPeriodo,
  } = useCalculadora()

  const isCC = p.sessoes.some(s => s.especialidade === 'Coordenador de Caso')
  const analProf = dadosPorProf.find(d => normKey(d.prof) === normKey(p.prof))
  const limiteCC = analProf?.limiteCC ?? limites[p.prof] ?? DEFAULT_CC_LIM
  const alertaCC = analProf?.alertaCC ?? false
  const totalRecebeHoje = p.evoluidasProprias + p.substituicoesRealizadas
  const baseCalc = p.agendadas - p.canceladas
  const pctEv = baseCalc > 0 ? (totalRecebeHoje / baseCalc * 100) : 0
  const corBorda = p.inconsistencias > 0 ? B.red : p.pendentes > 0 ? B.amber : totalRecebeHoje > 0 ? B.green : B.gray

  const aberto = modoRP
    ? expandido[`rem:${p.prof}`] === true
    : expandido[`rem:${p.prof}`] !== false

  const blocoAberto = (key: string) => expandido[`rem:${p.prof}:${key}`] === true
  const togBloco = (key: string) =>
    setExpandido(e => ({ ...e, [`rem:${p.prof}:${key}`]: !blocoAberto(key) }))

  const sRecebe = p.sessoes.filter(s =>
    s.papel === 'Substituição realizada' || (s.papel === 'Agenda' && s.classificacao === 'Evolução normal')
  ).sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora))

  const sPendentes = p.sessoes.filter(s => s.papel === 'Agenda' && s.classificacao === 'Pendente retroativa')
    .sort((a, b) => a.data.localeCompare(b.data))
  const sPerdidas = p.sessoes.filter(s => s.papel === 'Agenda' && s.classificacao === 'Substituição')
    .sort((a, b) => a.data.localeCompare(b.data))
  const sCanceladas = p.sessoes.filter(s => s.papel === 'Agenda' && s.classificacao === 'Cancelado')
    .sort((a, b) => a.data.localeCompare(b.data))
  const sInc = p.sessoes.filter(s => ['Evolução sem presença', 'Cancelado evoluído'].includes(s.classificacao))
    .sort((a, b) => a.data.localeCompare(b.data))
  const sNaoEv = p.sessoes.filter(s => s.papel === 'Agenda' && s.classificacao === 'Não evoluído')
    .sort((a, b) => a.data.localeCompare(b.data))

  const q = normKey(remBusca)
  const filtrarSessoes = (ss: NormalizedSession[]) => !q ? ss : ss.filter(s =>
    normKey(`${s.paciente} ${s.especialidade} ${s.data} ${s.hora} ${s.profAgenda} ${s.profCsv}`).includes(q)
  )

  const getPARow = (s: NormalizedSession) => {
    if (s.especialidade === 'Coordenador de Caso') return ccPA
    const isEtaAdmin = s.especialidade === 'Especialista Técnico de Área' &&
      ETA_ADMIN_NOMES.some(n => (s.paciente || '').includes(n))
    if (isEtaAdmin) return 0
    return taxasPA[s.especialidade] ?? 0
  }

  const classBadge = (cls: string) => {
    const map: Record<string, [string, string]> = {
      'Evolução normal': [B.limeLt, B.green],
      'Substituição': [B.blueLt, B.blue],
      'Pendente retroativa': [B.amberLt, B.amber],
      'Evolução sem presença': ['#fee2e2', B.red],
      'Cancelado evoluído': ['#fee2e2', B.red],
      'Cancelado': ['#f3f4f6', B.gray],
      'Não evoluído': ['#fef3c7', '#92400e'],
    }
    const [bg, cor] = map[cls] || ['#f3f4f6', B.gray]
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
        style={{ background: bg, color: cor }}>{cls}</span>
    )
  }

  const SessoesTabela = ({ sessoes, mostrarPapel = false, valorCor = B.green }: {
    sessoes: NormalizedSession[]; mostrarPapel?: boolean; valorCor?: string
  }) => (
    <div className="overflow-x-auto mt-1">
      <table className="w-full text-xs">
        <thead style={{ background: '#f8fafc' }}>
          <tr className="text-gray-500">
            <th className="text-left p-1.5 whitespace-nowrap">Data</th>
            <th className="text-left p-1.5">Hora</th>
            <th className="text-left p-1.5">Paciente</th>
            <th className="text-left p-1.5">Especialidade</th>
            {mostrarPapel && <th className="text-left p-1.5">Papel</th>}
            <th className="text-left p-1.5 whitespace-nowrap">Prof. Agenda</th>
            <th className="text-left p-1.5 whitespace-nowrap">Evoluído por</th>
            <th className="text-center p-1.5">Presença</th>
            <th className="text-center p-1.5">Tratativa</th>
            <th className="text-right p-1.5 whitespace-nowrap font-semibold" style={{ color: valorCor }}>Valor PA</th>
            <th className="text-left p-1.5">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {sessoes.map((s, i) => {
            const paVal = getPARow(s)
            return (
              <tr key={`${s._idx}-${i}`} className="border-t hover:bg-gray-50">
                <td className="p-1.5 whitespace-nowrap font-medium">{s.data}</td>
                <td className="p-1.5 whitespace-nowrap">{s.hora}</td>
                <td className="p-1.5">{s.paciente}</td>
                <td className="p-1.5">{s.especialidade}</td>
                {mostrarPapel && <td className="p-1.5">{classBadge(s.classificacao)}</td>}
                <td className="p-1.5 text-gray-600">{s.profAgenda}</td>
                <td className="p-1.5 text-gray-600">{s.profCsv || '—'}</td>
                <td className="p-1.5 text-center">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isSim(s.presencaOrbita) ? '#dcfce7' : '#fee2e2',
                      color: isSim(s.presencaOrbita) ? '#166534' : '#991b1b',
                    }}>
                    {s.presencaOrbita || '—'}
                  </span>
                </td>
                <td className="p-1.5 text-center">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isSim(s.possuiTratativa) ? '#dcfce7' : '#fef3c7',
                      color: isSim(s.possuiTratativa) ? '#166534' : '#92400e',
                    }}>
                    {s.possuiTratativa || '—'}
                  </span>
                </td>
                <td className="p-1.5 text-right font-bold whitespace-nowrap" style={{ color: valorCor }}>
                  {paVal > 0 ? fmt(paVal) : '—'}
                </td>
                <td className="p-1.5 text-gray-500 text-[11px]">{s.motivo}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sessoes.length === 0 && (
        <div className="text-xs text-gray-400 p-3 text-center">Nenhuma sessão nesta categoria.</div>
      )}
    </div>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-3" style={{ borderLeft: `4px solid ${corBorda}` }}>
      {/* Header */}
      <div className="p-4 flex items-start gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3">
          {modoRP
            ? <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-col text-center flex-shrink-0"
                style={{ background: p.inconsistencias > 0 ? '#fee2e2' : p.pendentes > 0 ? B.amberLt : B.limeLt, color: corBorda }}>
                <div className="text-xl font-bold leading-none">{p.agendadas}</div>
                <div className="text-[9px] mt-0.5 font-medium opacity-70">ag.</div>
              </div>
            : <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl"
                style={{ background: B.navyLt }}>👤</div>
          }
          <div>
            <div className="font-bold text-base" style={{ color: B.navy }}>{p.prof}</div>
            <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-1">
              {modoRP
                ? p.contrato
                  ? <><span>{p.contrato}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: '#fef3c7', color: '#92400e' }}>📋 contrato antigo</span></>
                  : <span>sem contrato cadastrado</span>
                : null
              }
              {isCC
                ? <span> · <span style={{ color: B.purple }}>🎯 {p.pacientesCCQtd} pac. únicos CC</span></span>
                : <span> · {p.agendadas} sessões agendadas</span>
              }
            </div>
            {remPeriodo && (
              <div className="text-xs mt-0.5" style={{ color: B.gray }}>
                Período: {remPeriodo.inicio} a {remPeriodo.fim}
              </div>
            )}
            {modoRP && (
              <div className="text-xs mt-1 font-semibold"
                style={{ color: pctEv >= 80 ? B.green : pctEv >= 50 ? B.amber : B.red }}>
                {pctEv.toFixed(1)}% base corrigida
                <span className="font-normal text-gray-400 ml-1">
                  ({totalRecebeHoje} remun. / {baseCalc} válidas)
                </span>
              </div>
            )}
            {p.inconsistencias > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
                style={{ background: '#fee2e2', color: B.red }}>
                ⚠️ {p.inconsistencias} inconsistência(s)
              </span>
            )}
          </div>
        </div>
        {!modoRP && (
          <button
            onClick={() => gerarPDF(p, { ccPA, ccPME, taxasPA, etaBonus, dadosPorProf, remPeriodo })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: B.navy }}
          >
            📄 Gerar PDF
          </button>
        )}
      </div>

      {/* Gráficos interativos (somente RP) */}
      {modoRP && p.agendadas > 0 && (
        <div className="px-4 pb-3">
          <div className="flex gap-6 flex-wrap justify-center">
            <InteractivePieChart size={150} title="Base total (todas as agendadas)"
              centerLabel={`${p.agendadas} ag.`}
              segments={[
                { value: p.evoluidasProprias, color: B.green, label: 'Evol. próprias' },
                { value: p.substituicoesRealizadas, color: B.blue, label: 'Subs. realizadas' },
                { value: p.canceladas, color: B.gray, label: 'Canceladas' },
                { value: p.pendentes, color: B.amber, label: 'Pendentes' },
                { value: p.substituidoPorOutro, color: B.red, label: 'Cedidas p/ outro' },
                { value: p.naoEvoluidas, color: '#d1d5db', label: 'Sem reg. — ausente' },
              ]} />
            <InteractivePieChart size={150}
              title={`Base corrigida (−${p.canceladas} cancel.)`}
              centerLabel={baseCalc > 0 ? `${((p.evoluidasProprias + p.substituicoesRealizadas) / baseCalc * 100).toFixed(1)}%` : '0%'}
              segments={[
                { value: p.evoluidasProprias, color: B.green, label: 'Evol. próprias' },
                { value: p.substituicoesRealizadas, color: B.blue, label: 'Subs. realizadas' },
                { value: p.pendentes, color: B.amber, label: 'Pendentes' },
                { value: p.substituidoPorOutro, color: B.red, label: 'Cedidas p/ outro' },
                { value: p.naoEvoluidas, color: '#d1d5db', label: 'Sem reg. — ausente' },
              ]} />
          </div>
          <div className="text-[10px] text-gray-400 mt-2 text-center italic">
            ⓘ Passe o cursor sobre os segmentos para ver o detalhamento.
          </div>
        </div>
      )}

      {/* Semáforo financeiro */}
      <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl p-3" style={{ background: B.limeLt, borderLeft: `3px solid ${B.green}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: B.green }}>✅ Recebe agora</div>
          <div className="text-xl font-bold" style={{ color: B.green }}>{fmt(p.valorConfirmado)}</div>
          <div className="text-xs text-gray-600 mt-2 space-y-0.5">
            {p.evoluidasProprias > 0 && <div>• {p.evoluidasProprias} evolução(ões) própria(s)</div>}
            {p.substituicoesRealizadas > 0 && <div>• {p.substituicoesRealizadas} substituição(ões)</div>}
            {isCC && p.pacientesCCQtd > 0 && <div>• PME: {p.pacientesCCQtd} pac. × {fmt(ccPME)}</div>}
            {p.diariaPeriodo > 0 && <div>• PPD: {fmt(p.diariaPeriodo)}</div>}
            {p.etaBonusPeriodo > 0 && <div>• Bônus ETA: {p.etaWeeksPeriodo}sem × {fmt(etaBonus)}</div>}
            <div className="font-semibold border-t border-green-200 pt-1 mt-1">
              {totalRecebeHoje} sessão(ões) remunerável(is)
            </div>
          </div>
        </div>
        <div className="rounded-xl p-3" style={{ background: B.amberLt, borderLeft: `3px solid ${B.amber}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: B.amber }}>⚠️ Registro não realizado</div>
          <div className="text-xl font-bold" style={{ color: B.amber }}>{p.pendentes + p.naoEvoluidas}</div>
          <div className="text-xs text-gray-600 mt-2 space-y-0.5">
            <div>• {p.pendentes} registro(s) não realizado(s) — paciente presente</div>
            {p.pendentes > 0 && (
              <div className="text-[10px] rounded p-1 mt-1" style={{ background: '#fef3c7', color: '#92400e' }}>
                Registro não realizado — verificar com o profissional.
              </div>
            )}
            {(p.pendentes + p.naoEvoluidas) === 0 && (
              <div className="text-green-600 font-semibold">Todos os registros realizados ✓</div>
            )}
          </div>
        </div>
        <div className="rounded-xl p-3" style={{ background: '#fff5f5', borderLeft: `3px solid ${B.red}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: B.red }}>❌ Não recebe</div>
          <div className="text-xl font-bold" style={{ color: B.red }}>
            {p.substituidoPorOutro + p.canceladas + p.naoEvoluidas + p.inconsistencias}
          </div>
          <div className="text-xs text-gray-600 mt-2 space-y-0.5">
            {p.substituidoPorOutro > 0 && <div>• {p.substituidoPorOutro} cedida(s) para outro profissional</div>}
            {p.canceladas > 0 && <div>• {p.canceladas} cancelada(s)</div>}
            {p.naoEvoluidas > 0 && <div>• {p.naoEvoluidas} registro(s) não realizado(s) — paciente ausente</div>}
            {p.inconsistencias > 0 && (
              <div className="font-semibold" style={{ color: B.red }}>
                • ⚠️ {p.inconsistencias} inconsistência(s) — investigar
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CC carteira info */}
      {isCC && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: B.purpleLt, color: B.purple }}>
              🎯 {p.pacientesCCQtd} paciente(s) único(s) CC
            </span>
            <span className="px-2 py-1 rounded-lg" style={{ background: B.navyLt, color: B.navy }}>
              Teto: {limiteCC} pac.
            </span>
            {modoRP && alertaCC && (
              <span className="px-2 py-1 rounded-lg font-bold" style={{ background: '#fee2e2', color: B.red }}>
                ⚠️ Alerta: {p.pacientesCCQtd}/{limiteCC} — acima do limite
              </span>
            )}
          </div>
        </div>
      )}

      {/* CC detalhe */}
      {isCC && p.pacientesCCQtd > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-xl p-3" style={{ background: B.purpleLt }}>
            <div className="text-xs font-bold mb-2" style={{ color: B.purple }}>🎯 Psicólogo Analista (CC) — PA + PME</div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-gray-500">PA por sessões evoluídas</div>
                <div className="font-bold mt-0.5">{totalRecebeHoje} sess. × {fmt(ccPA)}</div>
                <div className="font-bold text-base mt-1" style={{ color: B.purple }}>{fmt(totalRecebeHoje * ccPA)}</div>
              </div>
              <div>
                <div className="text-gray-500">PME por pacientes únicos</div>
                <div className="font-bold mt-0.5">{p.pacientesCCQtd} pac. × {fmt(ccPME)}</div>
                <div className="font-bold text-base mt-1" style={{ color: B.purple }}>{fmt(p.pme)}</div>
              </div>
              <div>
                <div className="text-gray-500">Total confirmado</div>
                <div className="font-bold text-lg mt-1" style={{ color: B.green }}>{fmt(p.valorConfirmado)}</div>
                {p.valorRecuperavel > 0 && (
                  <div className="text-xs" style={{ color: B.amber }}>+ {fmt(p.valorRecuperavel)} potencial</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toggle sessões */}
      <div className="px-4 pb-2 border-t flex items-center justify-between" style={{ borderColor: '#f0f0f0' }}>
        <button className="text-xs font-semibold pt-2" style={{ color: B.blue }}
          onClick={() => setExpandido(e => ({
            ...e,
            [`rem:${p.prof}`]: modoRP
              ? (aberto ? null : true)
              : (aberto ? false : true),
          }))}>
          {aberto ? '▲ Ocultar sessões' : '▼ Ver sessões detalhadas'}
        </button>
        {aberto && <span className="text-xs text-gray-400 pt-2">{p.sessoes.length} registro(s)</span>}
      </div>

      {/* Sessões por bloco */}
      {aberto && (
        <div className="px-4 pb-4 space-y-2">
          {[
            { key: 'recebe', list: sRecebe, cor: B.green, bg: B.limeLt, icon: '✅', titulo: 'Recebe agora', mostrarPapel: true,
              extra: (ss: NormalizedSession[]) => fmt(ss.reduce((a, s) => a + getPARow(s), 0)) },
            { key: 'pendentes', list: sPendentes, cor: B.amber, bg: B.amberLt, icon: '⏳', titulo: 'Registro não realizado — paciente presente',
              desc: 'Presença confirmada pela recepção, mas sem evolução registrada pelo profissional',
              extra: (ss: NormalizedSession[]) => `${ss.length} sessão(ões)` },
            { key: 'cedidas', list: sPerdidas, cor: B.red, bg: '#fee2e2', icon: '🔁', titulo: 'Cedidas para outro profissional' },
            { key: 'canceladas', list: sCanceladas, cor: B.gray, bg: '#f3f4f6', icon: '🚫', titulo: 'Canceladas' },
            { key: 'naoevu', list: sNaoEv, cor: '#92400e', bg: '#fef3c7', icon: '⬜', titulo: 'Registro não realizado — paciente ausente',
              desc: 'Ausência registrada pela recepção e sem evolução pelo profissional' },
            { key: 'inc', list: sInc, cor: B.red, bg: '#fee2e2', icon: '⚠️', titulo: 'INCONSISTÊNCIAS — investigar antes de pagar', always: true },
          ].map(bloco => {
            if (!bloco.list.length && !bloco.always) return null
            const filt = filtrarSessoes(bloco.list)
            const open = blocoAberto(bloco.key)
            return (
              <div key={bloco.key}>
                <button
                  className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left"
                  style={{ background: bloco.bg }}
                  onClick={() => togBloco(bloco.key)}
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs font-bold" style={{ color: bloco.cor }}>
                      {bloco.icon} {bloco.titulo} · {filt.length} sessão(ões)
                    </span>
                    {bloco.desc && (
                      <span className="text-[10px] opacity-75 mt-0.5" style={{ color: bloco.cor }}>{bloco.desc}</span>
                    )}
                  </div>
                  {bloco.extra && (
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: bloco.cor }}>
                      {bloco.extra(filt)}
                    </span>
                  )}
                  <span className="text-xs flex-shrink-0" style={{ color: bloco.cor }}>{open ? '▲' : '▼'}</span>
                </button>
                {open && bloco.key === 'inc' && (
                  <div className="text-xs p-2 rounded mb-1" style={{ background: '#fff5f5', color: B.red }}>
                    Presença Órbita ≠ Possui Tratativa. Possíveis causas: recepção marcou ausência incorretamente;
                    profissional evoluiu sessão indevidamente; ou sessão cancelada foi evoluída. Confirme antes de pagar.
                  </div>
                )}
                {open && (
                  <SessoesTabela
                    sessoes={filt}
                    mostrarPapel={bloco.key === 'recebe' || bloco.key === 'inc'}
                    valorCor={bloco.cor}
                  />
                )}
              </div>
            )
          })}

          {p.sessoes.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-4">Nenhuma sessão vinculada a este profissional.</div>
          )}
        </div>
      )}
    </div>
  )
}
