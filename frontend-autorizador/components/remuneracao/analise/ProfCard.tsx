'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B, DOW_PT } from '../lib/constants'
import { fmt, fmtPct, fmtH } from '../lib/helpers'
import type { ProfData } from '../lib/types'

interface Props { d: ProfData }

export default function ProfCard({ d }: Props) {
  const { presenca, feriadosMes, expandido, setExpandido, ccPA, ccPME, etaBonus } = useCalculadora()

  const exp = expandido[d.prof] as string | null
  const cor = d.hasCC ? B.purple : d.hasTA ? B.blue : d.hasAE ? B.orange : B.navy

  const toggleExp = (prof: string, sub: string) =>
    setExpandido(e => ({ ...e, [prof]: e[prof] === sub ? null : sub }))

  return (
    <div className="rounded-xl shadow-sm mb-3 overflow-hidden bg-white" style={{ borderLeft: `4px solid ${cor}` }}>
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-bold text-base" style={{ color: B.navy }}>{d.prof}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {d.terapiaDetails.map(t => (
              <span key={t.terp} className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: t.isCC ? B.purpleLt : t.isETA ? B.orangeLt : B.blueLt,
                  color: t.isCC ? B.purple : t.isETA ? B.orange : B.blue,
                }}>
                {t.terp} · {t.sessoesMes100} sess/mês
                {t.isETA && t.etaSessoesMes100 > 0 && (
                  <span className="ml-1 opacity-70">+{t.etaSessoesMes100} ETA</span>
                )}
              </span>
            ))}
          </div>
          {d.contrato && (
            <span className="text-xs mt-1 inline-block px-2 py-0.5 rounded"
              style={{ background: B.navyLt, color: B.navy }}>
              📋 {d.contrato}
              {(d.chSemanal ?? 0) > 0 && <span className="ml-1 text-gray-400">· {d.chSemanal}h/sem contratadas</span>}
            </span>
          )}
          <div className="flex gap-3 mt-1 text-xs flex-wrap">
            <span style={{ color: B.green }}>🟢 {fmtH(d.horasComPac)} com paciente</span>
            <span style={{ color: d.horasAbertas > 0 ? B.orange : B.gray }}>🟡 {fmtH(d.horasAbertas)} abertas</span>
            <span style={{ color: B.gray }}>⏱ {fmtH(d.horasSemanaTotal)} total na clínica</span>
            {d.taxaOcupacao !== null && (
              <span className="font-semibold px-1.5 rounded"
                style={{
                  background: d.taxaOcupacao >= 0.8 ? '#dcfce7' : d.taxaOcupacao >= 0.5 ? '#fef3c7' : '#fee2e2',
                  color: d.taxaOcupacao >= 0.8 ? B.green : d.taxaOcupacao >= 0.5 ? B.amber : B.red,
                }}>
                📊 {(d.taxaOcupacao * 100).toFixed(1)}% ocupação
              </span>
            )}
          </div>
        </div>
        {d.alertaCC && (
          <span className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0"
            style={{ background: '#ffe0e0', color: B.red }}>
            ⚠️ CC: {d.pacCC}/{d.limiteCC} pac.
          </span>
        )}
      </div>

      {/* Totais */}
      <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-lg px-3 py-2" style={{ background: '#f3f4f6' }}>
          <div className="text-xs text-gray-500">Contrato Antigo / mês</div>
          {d.temAntigo
            ? <>
              <div className="font-bold text-base" style={{ color: B.gray }}>{fmt(d.salAntigo ?? 0)}</div>
              {(d.chSemanal ?? 0) > 0 && <div className="text-xs text-gray-400">{d.chSemanal}h/sem contratadas</div>}
            </>
            : <div className="text-sm italic text-gray-400">{d.contrato ? 'Novo modelo' : 'Sem dados'}</div>
          }
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: B.limeLt, borderLeft: `3px solid ${B.green}` }}>
          <div className="text-xs text-gray-500">100% presença / mês</div>
          <div className="font-bold text-base" style={{ color: B.green }}>{fmt(d.total100)}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {d.terapiaDetails.filter(t => !t.isCC && t.mensalDiaria > 0).length > 0 && (
              <span>PPD: {fmt(d.terapiaDetails.filter(t => !t.isCC).reduce((s, t) => s + (t.mensalDiaria || 0), 0))} · </span>
            )}
            PA: {fmt(d.terapiaDetails.reduce((s, t) => s + (t.mensalPA100 || 0), 0))}
            {d.terapiaDetails.some(t => t.isETA && t.mensalETA100 > 0) && (
              <span> · Bônus ETA: {fmt(d.terapiaDetails.reduce((s, t) => s + (t.mensalETA100 || 0), 0))}</span>
            )}
            {d.pme > 0 && <span> · PME: {fmt(d.pme)}</span>}
          </div>
          {d.delta100 !== null && (
            <div className="text-xs font-semibold" style={{ color: d.delta100 >= 0 ? B.green : B.red }}>
              {fmtPct(d.delta100)} vs antigo
            </div>
          )}
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: B.blueLt, borderLeft: `3px solid ${B.blue}` }}>
          <div className="text-xs text-gray-500">{presenca}% presença / mês</div>
          <div className="font-bold text-base" style={{ color: B.blue }}>{fmt(d.totalX)}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {d.terapiaDetails.filter(t => !t.isCC && t.mensalDiaria > 0).length > 0 && (
              <span>PPD: {fmt(d.terapiaDetails.filter(t => !t.isCC).reduce((s, t) => s + (t.mensalDiaria || 0), 0))} · </span>
            )}
            PA: {fmt(d.terapiaDetails.reduce((s, t) => s + (t.mensalPAX || 0), 0))}
            {d.terapiaDetails.some(t => t.isETA && t.mensalETA100 > 0) && (
              <span> · Bônus ETA: {fmt(d.terapiaDetails.reduce((s, t) => s + (t.mensalETA100 || 0), 0))}</span>
            )}
            {d.pme > 0 && <span> · PME: {fmt(d.pme)}</span>}
          </div>
          {d.deltaX !== null && (
            <div className="text-xs font-semibold" style={{ color: d.deltaX >= 0 ? B.green : B.red }}>
              {fmtPct(d.deltaX)} vs antigo
            </div>
          )}
        </div>
      </div>

      {/* Toggles */}
      <div className="px-4 pb-2 flex gap-4 border-t" style={{ borderColor: '#f0f0f0' }}>
        <button className="text-xs font-medium pt-2" style={{ color: cor }}
          onClick={() => toggleExp(d.prof, 'dias')}>
          {exp === 'dias' ? '▲' : '▼'} Ver dias trabalhados
        </button>
        <button className="text-xs font-medium pt-2" style={{ color: B.gray }}
          onClick={() => toggleExp(d.prof, 'pacs')}>
          {exp === 'pacs' ? '▲' : '▼'} Ver pacientes ({d.allPacs.length})
        </button>
      </div>

      {/* Detalhe dias */}
      {exp === 'dias' && (
        <div className="px-4 pb-4 space-y-3">
          {feriadosMes.length > 0 && (
            <div className="text-xs px-3 py-1.5 rounded-lg flex flex-wrap gap-2"
              style={{ background: '#fff8e1', color: '#b45309' }}>
              ⚠️ Feriados descontados:
              {feriadosMes.map(f => (
                <span key={f.date}><strong>{f.date.slice(5)}</strong> {f.nome} ({DOW_PT[f.dow as keyof typeof DOW_PT]})</span>
              ))}
            </div>
          )}
          {d.terapiaDetails.map(td => (
            <div key={td.terp} className="rounded-lg p-3"
              style={{ background: td.isCC ? B.purpleLt : B.blueLt }}>
              <div className="font-semibold text-xs mb-2" style={{ color: td.isCC ? B.purple : B.blue }}>
                {td.terp}
                {td.isCC
                  ? <span className="ml-2 font-normal">PA: {fmt(ccPA)}/sessão · PME: {fmt(ccPME)}/pac.</span>
                  : <span className="ml-2 font-normal">PA: {fmt(td.pa)}/sessão · PPD: {fmt(td.diar)}/dia</span>
                }
              </div>
              <table className="w-full text-xs mb-2">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-0.5">Dia</th>
                    <th className="text-center">Sess/sem</th>
                    <th className="text-center">Ocorr.</th>
                    <th className="text-center">Sess/mês</th>
                    <th className="text-right">PA 100%</th>
                    <th className="text-right">PA {presenca}%</th>
                  </tr>
                </thead>
                <tbody>
                  {td.dowBreak.map(b => (
                    <tr key={b.dow} className="border-t border-white/50">
                      <td className="py-0.5 font-medium">{DOW_PT[b.dow as keyof typeof DOW_PT]}</td>
                      <td className="text-center">{b.cnt}</td>
                      <td className="text-center">
                        {b.occ}
                        {b.feriados.length > 0 && (
                          <span className="ml-1 text-orange-500" title={b.feriados.map((f: {nome: string}) => f.nome).join(', ')}>
                            ⚠️-{b.feriados.length}
                          </span>
                        )}
                      </td>
                      <td className="text-center font-semibold">{b.mensal}</td>
                      <td className="text-right">{fmt(b.mensal * td.pa)}</td>
                      <td className="text-right">{fmt(b.mensal * (presenca / 100) * td.pa)}</td>
                    </tr>
                  ))}
                  {td.isCC && (
                    <tr style={{ color: B.purple }}>
                      <td colSpan={3} className="text-xs pt-1">PME ({td.pacientes} pac. × {fmt(ccPME)})</td>
                      <td /><td className="text-right font-bold">{fmt(td.pacientes * ccPME)}</td>
                      <td className="text-right font-bold">{fmt(td.pacientes * ccPME)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {!td.isCC && td.diar > 0 && td.diariasDetalhe.length > 0 && (
                <div className="border-t border-white/50 pt-2">
                  <div className="text-xs font-semibold mb-1" style={{ color: B.orange }}>
                    PPD — Pagamento por Disponibilidade ({fmt(td.diar)}/dia)
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left py-0.5">Dia presente</th>
                        <th className="text-center">Ocorr. mês</th>
                        <th className="text-right">Valor mês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {td.diariasDetalhe.map(dd => (
                        <tr key={dd.dow} className="border-t border-white/50">
                          <td className="py-0.5 font-medium">{DOW_PT[dd.dow as keyof typeof DOW_PT]}</td>
                          <td className="text-center">
                            {dd.occ}
                            {dd.feriados.length > 0 && <span className="ml-1 text-orange-500">⚠️-{dd.feriados.length}</span>}
                          </td>
                          <td className="text-right font-semibold" style={{ color: B.orange }}>{fmt(dd.valor)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 font-bold" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                        <td colSpan={2} className="py-1">Total PPD/mês</td>
                        <td className="text-right" style={{ color: B.orange }}>{fmt(td.mensalDiaria)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {td.isETA && (
                <div className="border-t border-white/50 pt-2 mt-2">
                  <div className="text-xs font-semibold mb-2" style={{ color: B.orange }}>
                    🏷️ Bônus ETA — Especialista Técnico de Área
                  </div>
                  <div className="rounded-lg p-2 mb-2 text-xs" style={{ background: B.orangeLt, color: '#7c2d12' }}>
                    Pago uma vez por semana, independente do nº de horas/dias de ETA naquela semana. Não afetado por % de presença.
                  </div>
                  {td.etaDownBreak && td.etaDownBreak.length > 0 && (
                    <table className="w-full text-xs mb-2">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left py-0.5">Dia admin (ETA)</th>
                          <th className="text-center">Slots/sem</th>
                          <th className="text-center">Ocorr. mês</th>
                        </tr>
                      </thead>
                      <tbody>
                        {td.etaDownBreak.map((b: {dow: string|number; cnt: number; occ: number; feriados: {nome:string}[]}) => (
                          <tr key={b.dow} className="border-t border-white/50">
                            <td className="py-0.5 font-medium">{DOW_PT[b.dow as keyof typeof DOW_PT]}</td>
                            <td className="text-center">{b.cnt}</td>
                            <td className="text-center">
                              {b.occ}
                              {b.feriados.length > 0 && (
                                <span className="ml-1 text-orange-500" title={b.feriados.map(f => f.nome).join(', ')}>
                                  ⚠️-{b.feriados.length}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="rounded-lg p-2 grid grid-cols-3 gap-1 text-xs" style={{ background: '#fff7ed' }}>
                    <div className="text-center">
                      <div className="text-gray-500">Semanas ETA no mês</div>
                      <div className="font-bold text-lg" style={{ color: B.orange }}>{td.etaWeeks}</div>
                      <div className="text-gray-400">max ocorr. dos dias admin</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Bônus por semana</div>
                      <div className="font-bold text-lg" style={{ color: B.orange }}>{fmt(etaBonus)}</div>
                      <div className="text-gray-400">fixo, independe de horas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Total bônus ETA/mês</div>
                      <div className="font-bold text-lg" style={{ color: B.orange }}>{fmt(td.mensalETA100)}</div>
                      <div className="text-gray-400">{td.etaWeeks} × {fmt(etaBonus)}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-white/50 grid grid-cols-2 gap-2 text-xs">
                {!td.isCC && <>
                  {!td.isETA && <>
                    <div>Total PA 100%: <strong>{fmt(td.mensalPA100)}</strong></div>
                    <div>Total PA {presenca}%: <strong>{fmt(td.mensalPAX)}</strong></div>
                    {td.diar > 0 && <>
                      <div>PPD: <strong>{fmt(td.mensalDiaria)}</strong></div>
                      <div style={{ color: B.green }}>Total (PPD+PA {presenca}%): <strong>{fmt(td.monthlyX)}</strong></div>
                    </>}
                  </>}
                  {td.isETA && (
                    <div className="col-span-2 rounded-lg p-2 space-y-1" style={{ background: '#fff7ed' }}>
                      <div className="font-bold text-xs mb-1" style={{ color: B.orange }}>Composição do total — 3 frentes de pagamento:</div>
                      <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                        <div className="rounded p-1" style={{ background: '#fed7aa' }}>
                          <div className="text-gray-600">① PPD ({fmt(td.diar)}/dia)</div>
                          <div className="font-bold" style={{ color: B.orange }}>{fmt(td.mensalDiaria)}</div>
                        </div>
                        <div className="rounded p-1" style={{ background: '#bbf7d0' }}>
                          <div className="text-gray-600">② PA sessões reais ({fmt(td.pa)}/sess)</div>
                          <div className="font-bold" style={{ color: B.green }}>{fmt(td.mensalPA100)}</div>
                          <div className="text-gray-400 text-[10px]">{presenca}%: {fmt(td.mensalPAX)}</div>
                        </div>
                        <div className="rounded p-1" style={{ background: '#fed7aa' }}>
                          <div className="text-gray-600">③ Bônus ETA ({fmt(etaBonus)}/sem)</div>
                          <div className="font-bold" style={{ color: B.orange }}>{fmt(td.mensalETA100)}</div>
                          <div className="text-gray-400 text-[10px]">não afetado por %</div>
                        </div>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-orange-200 font-bold">
                        <span style={{ color: B.green }}>Total 100%: {fmt(td.monthly100)}</span>
                        <span style={{ color: B.blue }}>Total {presenca}%: {fmt(td.monthlyX)}</span>
                      </div>
                    </div>
                  )}
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detalhe pacientes */}
      {exp === 'pacs' && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {d.allPacs.map(p => (
              <div key={p} className="text-xs px-2 py-1 rounded" style={{ background: '#f8f9fa', color: B.navy }}>{p}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
