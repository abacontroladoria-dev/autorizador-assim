"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CalendarDays, CheckCircle2, Search, X, ChevronDown, ChevronUp,
  AlertTriangle, Users, TrendingUp, TrendingDown, Building2, FileQuestion,
  FileText, Download,
} from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { useAnaliseFutura } from "@/hooks/useRemuneracao"
import { useRemuneracaoConfig } from "@/hooks/useRemuneracaoConfig"
import { fmt, fmtH, fmtPct, fmtPctOcup, fmtNumBR } from "@/lib/remuneracao/formatacao"
import { B } from "@/lib/cronograma/constants"
import { DOW_PT } from "@/lib/cronograma/ocupacaoConst"
import {
  resumoOcupacaoProfissional, regrasCapacidadeTexto, temBaseOcupacaoLinha,
} from "@/lib/remuneracao/ocupacao"
import { gerarPDFAnaliseFuturaProfissional, exportarAnaliseXlsx, type AnaliseFuturaPdfOpts } from "@/lib/remuneracao/exportAnaliseFutura"
import type { ProfissionalAnalise, TerapiaDetalhe } from "@/lib/remuneracao/calculo"

// ─── Tooltip de info (mesmo padrão de CardRemun.tsx / ConfigTab.tsx) ──────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center justify-center cursor-help ml-1">
      <div className="w-3.5 h-3.5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-500 dark:text-slate-400">
        ?
      </div>
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 opacity-0 transition-opacity group-hover:opacity-100 z-50">
        <div className="rounded-lg bg-slate-800 dark:bg-slate-200 p-2 text-xs text-white dark:text-slate-900 shadow-xl text-center">
          {text}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800 dark:border-t-slate-200" />
      </div>
    </div>
  )
}

// ─── Chip / badge tonal (dark-mode aware — mesma convenção do item 7) ─────────

type Tone = "green" | "amber" | "blue" | "purple" | "red" | "slate"

const TONE_CLS: Record<Tone, { bg: string; text: string }> = {
  green:  { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400" },
  amber:  { bg: "bg-amber-50 dark:bg-amber-950/30",     text: "text-amber-700 dark:text-amber-400" },
  blue:   { bg: "bg-sky-50 dark:bg-sky-950/30",         text: "text-sky-700 dark:text-sky-400" },
  purple: { bg: "bg-violet-50 dark:bg-violet-950/30",   text: "text-violet-700 dark:text-violet-400" },
  red:    { bg: "bg-rose-50 dark:bg-rose-950/30",       text: "text-rose-700 dark:text-rose-400" },
  slate:  { bg: "bg-slate-100 dark:bg-slate-800/60",    text: "text-slate-600 dark:text-slate-400" },
}

function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  const c = TONE_CLS[tone]
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {children}
    </span>
  )
}

// ─── KPI agregado (linha de resumo do topo) ───────────────────────────────────

function SummaryTile({ label, value, tone = "slate" }: { label: string; value: React.ReactNode; tone?: Tone }) {
  const c = TONE_CLS[tone]
  return (
    <div className={`rounded-2xl border border-border p-4 ${tone === "slate" ? "bg-card" : c.bg}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone === "slate" ? "text-foreground" : c.text}`}>{value}</div>
    </div>
  )
}

// ─── Ocupação: badge principal por faixa ──────────────────────────────────────

function toneOcupacao(pct: number | null): Tone {
  if (pct === null) return "slate"
  if (pct >= 0.8) return "green"
  if (pct >= 0.6) return "blue"
  if (pct >= 0.4) return "amber"
  return "red"
}

// ─── Card: Contrato Antigo ─────────────────────────────────────────────────

function ContratoAntigoCard({ d }: { d: ProfissionalAnalise }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 h-fit">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <Building2 size={13} />
        Contrato antigo / mês
      </div>

      {d.temAntigo ? (
        <>
          {d.contrato && (
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-foreground mt-2">
              {d.contrato}
            </div>
          )}
          <div className="font-black text-xl leading-tight mt-2 text-foreground tabular-nums">{fmt(d.salAntigo!)}</div>

          <div className="mt-2 space-y-1.5 text-[13px]">
            {(d.chSemanal ?? 0) > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Carga contratada</span>
                <strong className="text-foreground tabular-nums">{fmtNumBR(d.chSemanal!, d.chSemanal! % 1 ? 2 : 0)}h/sem</strong>
              </div>
            )}
            {d.valorHoraSemAntigo !== null && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground/70">Valor anterior por h/sem</span>
                <strong className="text-muted-foreground tabular-nums">{fmt(d.valorHoraSemAntigo)}</strong>
              </div>
            )}
          </div>

          {d.salAntigoProporcional != null && (
            <div className="mt-3 rounded-xl border border-border bg-card px-3 py-3 text-[13px] space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Carga agendada</span>
                <strong className="text-foreground tabular-nums">{fmtH(d.horasSemanaTotal)}</strong>
              </div>
              {d.jornadaResumo && <div className="text-[11px] leading-snug text-muted-foreground">{d.jornadaResumo}</div>}
              <div className="pt-2 border-t border-border flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Antigo proporcional</span>
                <strong className="text-foreground tabular-nums">{fmt(d.salAntigoProporcional)}</strong>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-1.5 py-3 text-center">
          <FileQuestion size={20} className="text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground italic">
            {d.contrato ? "Novo modelo" : "Sem contrato antigo cadastrado"}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Card: projeção de presença (100% / X%) ───────────────────────────────────

function PresencaCard({
  d, variante, presenca,
}: {
  d: ProfissionalAnalise
  variante: "100" | "x"
  presenca: number | null
}) {
  const is100 = variante === "100"
  const total = is100 ? d.total100 : d.totalX
  const delta = is100 ? d.deltaProp100 : d.deltaPropX
  const ppd = d.terapiaDetails.filter(t => !t.isCC).reduce((s, t) => s + (t.mensalDiaria || 0), 0)
  const pa = d.terapiaDetails.reduce((s, t) => s + (is100 ? t.mensalPA100 : t.mensalPAX), 0)
  const etaBonusTotal = d.terapiaDetails.reduce((s, t) => s + (t.mensalETA100 || 0), 0)
  const temPpd = d.terapiaDetails.some(t => !t.isCC && t.mensalDiaria > 0)
  const temEta = d.terapiaDetails.some(t => t.isETA && t.mensalETA100 > 0)
  const tone: Tone = is100 ? "green" : "blue"
  const c = TONE_CLS[tone]

  return (
    <div className={`rounded-2xl border border-border p-4 h-fit ${c.bg}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {is100 ? "100% presença / mês" : `${presenca ?? "—"}% presença / mês`}
      </div>
      <div className={`font-bold text-xl mt-1 tabular-nums ${c.text}`}>{fmt(total)}</div>
      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
        {temPpd && <>PPD: {fmt(ppd)} · </>}
        PA: {fmt(pa)}
        {is100 && temEta && <> · Bônus ETA: {fmt(etaBonusTotal)}</>}
        {d.pe > 0 && <> · PE: {fmt(d.pe)}</>}
      </div>
      {delta !== null && (
        <div className={`flex items-center gap-1 text-xs font-semibold mt-2 ${delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {fmtPct(delta)} vs antigo proporcional
        </div>
      )}
    </div>
  )
}

// ─── Expansível: dias trabalhados ─────────────────────────────────────────────

function TerapiaDiasBloco({ td, presenca, ccPA, ccPE, etaBonus }: {
  td: TerapiaDetalhe; presenca: number; ccPA: number; ccPE: number; etaBonus: number
}) {
  const tone: Tone = td.isCC ? "purple" : "blue"
  const c = TONE_CLS[tone]
  return (
    <div className={`rounded-xl p-3 ${c.bg}`}>
      <div className={`font-semibold text-xs mb-2 ${c.text}`}>
        {td.terp}
        <span className="ml-2 font-normal text-muted-foreground">
          {td.isCC ? <>PA: {fmt(ccPA)}/sessão · PE: {fmt(ccPE)}/pac.</> : <>PA: {fmt(td.pa)}/sessão · PPD: {fmt(td.diar)}/dia</>}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs mb-1">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left py-0.5 font-medium">Dia</th>
              <th className="text-center font-medium">Sess/sem</th>
              <th className="text-center font-medium">Ocorr.</th>
              <th className="text-center font-medium">Sess/mês</th>
              <th className="text-right font-medium">PA 100%</th>
              <th className="text-right font-medium">PA {presenca}%</th>
            </tr>
          </thead>
          <tbody>
            {td.dowBreak.map(b => (
              <tr key={b.dow} className="border-t border-white/40 dark:border-black/20">
                <td className="py-1 font-medium text-foreground">{DOW_PT[b.dow]}</td>
                <td className="text-center text-foreground">{b.cnt}</td>
                <td className="text-center text-foreground">
                  {b.occ}
                  {b.feriados.length > 0 && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400" title={b.feriados.map(f => f.nome).join(", ")}>
                      −{b.feriados.length}
                    </span>
                  )}
                </td>
                <td className="text-center font-semibold text-foreground">{b.mensal}</td>
                <td className="text-right text-foreground tabular-nums">{fmt(b.mensal * td.pa)}</td>
                <td className="text-right text-foreground tabular-nums">{fmt(b.mensal * (presenca / 100) * td.pa)}</td>
              </tr>
            ))}
            {td.isCC && (
              <tr className={c.text}>
                <td colSpan={3} className="text-xs pt-1.5">PE ({td.pacientes} pac. × {fmt(ccPE)})</td>
                <td />
                <td className="text-right font-bold tabular-nums">{fmt(td.pacientes * ccPE)}</td>
                <td className="text-right font-bold tabular-nums">{fmt(td.pacientes * ccPE)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!td.isCC && td.diar > 0 && td.diariasDetalhe.length > 0 && (
        <div className="border-t border-white/40 dark:border-black/20 pt-2 mt-1">
          <div className="text-xs font-semibold mb-1 text-orange-700 dark:text-orange-400">
            PPD — Pagamento por Diária ({fmt(td.diar)}/dia)
          </div>
          <table className="w-full text-xs">
            <tbody>
              {td.diariasDetalhe.map(dd => (
                <tr key={dd.dow} className="border-t border-white/40 dark:border-black/20">
                  <td className="py-0.5 font-medium text-foreground">{DOW_PT[dd.dow]}</td>
                  <td className="text-center text-foreground">
                    {dd.occ}
                    {dd.feriados.length > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">−{dd.feriados.length}</span>}
                  </td>
                  <td className="text-right font-semibold text-orange-700 dark:text-orange-400 tabular-nums">{fmt(dd.valor)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-black/10 dark:border-white/10 font-bold">
                <td colSpan={2} className="py-1 text-foreground">Total PPD/mês</td>
                <td className="text-right text-orange-700 dark:text-orange-400 tabular-nums">{fmt(td.mensalDiaria)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {td.isETA && (
        <div className="border-t border-white/40 dark:border-black/20 pt-2 mt-2">
          <div className="text-xs font-semibold mb-2 text-orange-700 dark:text-orange-400">Bônus ETA</div>
          <div className="rounded-lg p-2 grid grid-cols-3 gap-1 text-xs bg-orange-50/70 dark:bg-orange-950/30">
            <div className="text-center">
              <div className="text-muted-foreground">Semanas ETA</div>
              <div className="font-bold text-lg text-orange-700 dark:text-orange-400">{td.etaWeeks}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Bônus/semana</div>
              <div className="font-bold text-lg text-orange-700 dark:text-orange-400">{fmt(etaBonus)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Total ETA/mês</div>
              <div className="font-bold text-lg text-orange-700 dark:text-orange-400">{fmt(td.mensalETA100)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Card do profissional ──────────────────────────────────────────────────

type SecaoExpandida = "dias" | "ocup" | "pacs" | null

function ProfissionalCard({
  d, exp, onToggle, presenca, ccPA, ccPE, etaBonus, feriadosMes, pdfOpts,
}: {
  d: ProfissionalAnalise
  exp: SecaoExpandida
  onToggle: (tipo: Exclude<SecaoExpandida, null>) => void
  presenca: number
  ccPA: number
  ccPE: number
  etaBonus: number
  feriadosMes: Array<{ date: string; nome: string; dow: number }>
  pdfOpts: AnaliseFuturaPdfOpts
}) {
  const resumoOcup = resumoOcupacaoProfissional(d)
  const regraTexto = regrasCapacidadeTexto(d)
  const corTopo = d.hasCC ? B.purple : d.hasTA ? B.blue : d.hasAE ? B.orange : B.navy

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${corTopo}cc, ${corTopo}33)` }} />

      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold text-base text-foreground">{d.prof}</div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {d.terapiaDetails.map(t => (
              <Chip key={t.terp} tone={t.isCC ? "purple" : t.isETA ? "amber" : "blue"}>
                {t.terp} · {t.sessoesMes100} sess/mês
                {t.isETA && t.etaSessoesSemana > 0 && <span className="opacity-70">+{t.etaSessoesSemana} ETA</span>}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2 items-stretch">
            <Chip tone="green">
              <span className="flex flex-col leading-tight py-0.5">
                <span>{resumoOcup.linha1}</span>
                <span className="text-[10px] font-bold opacity-80">{resumoOcup.linha1Sub}</span>
              </span>
            </Chip>
            <Chip tone={resumoOcup.modo === "capacidade" ? "purple" : "amber"}>
              <span className="flex flex-col leading-tight py-0.5">
                <span>{resumoOcup.linha2}</span>
                <span className="text-[10px] font-bold opacity-80">{resumoOcup.linha2Sub}</span>
              </span>
            </Chip>
            {d.taxaOcupacao !== null && (
              <Chip tone={toneOcupacao(d.taxaOcupacao)} title={d.ocupacao?.baseTexto}>
                {resumoOcup.principal}
              </Chip>
            )}
          </div>

          {regraTexto && <div className="text-[11px] mt-1.5 text-violet-700 dark:text-violet-400">{regraTexto}</div>}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
          {d.alertaCC && (
            <Chip tone="red">
              <AlertTriangle size={12} />
              CC: {d.pacCC}/{d.limiteCC} pac.
            </Chip>
          )}
          <button
            type="button"
            onClick={() => gerarPDFAnaliseFuturaProfissional(d, pdfOpts)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
            style={{ background: B.navy }}
          >
            <FileText size={13} />
            PDF individual
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ContratoAntigoCard d={d} />
        <PresencaCard d={d} variante="100" presenca={presenca} />
        <PresencaCard d={d} variante="x" presenca={presenca} />
      </div>

      <div className="px-4 pb-3 pt-1 flex gap-4 flex-wrap border-t border-border">
        <button
          type="button"
          onClick={() => onToggle("dias")}
          className="inline-flex items-center gap-1 text-xs font-semibold pt-2 text-foreground hover:opacity-70 transition-opacity"
        >
          {exp === "dias" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Dias trabalhados
        </button>
        <button
          type="button"
          onClick={() => onToggle("ocup")}
          className="inline-flex items-center gap-1 text-xs font-semibold pt-2 text-sky-700 dark:text-sky-400 hover:opacity-70 transition-opacity"
        >
          {exp === "ocup" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Ocupação detalhada
        </button>
        <button
          type="button"
          onClick={() => onToggle("pacs")}
          className="inline-flex items-center gap-1 text-xs font-semibold pt-2 text-muted-foreground hover:opacity-70 transition-opacity"
        >
          {exp === "pacs" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Pacientes ({d.allPacs.length})
        </button>
      </div>

      {exp === "dias" && (
        <div className="px-4 pb-4 space-y-3 pt-1">
          {feriadosMes.length > 0 && (
            <div className="rounded-lg px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-1 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">
              <span className="font-semibold flex items-center gap-1"><CalendarDays size={12} /> Feriados descontados:</span>
              {feriadosMes.map(f => (
                <span key={f.date}><strong>{f.date.slice(5)}</strong> {f.nome} ({DOW_PT[f.dow]})</span>
              ))}
            </div>
          )}
          {d.terapiaDetails.map(td => (
            <TerapiaDiasBloco key={td.terp} td={td} presenca={presenca} ccPA={ccPA} ccPE={ccPE} etaBonus={etaBonus} />
          ))}
        </div>
      )}

      {exp === "ocup" && (
        <div className="px-4 pb-4 space-y-3 pt-1">
          <div className="rounded-xl p-3 bg-sky-50 dark:bg-sky-950/30">
            <div className="font-bold text-xs mb-1 text-foreground">Base da ocupação semanal</div>
            <div className="text-sm font-semibold text-sky-700 dark:text-sky-400">{d.ocupacao?.baseTexto}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {d.ocupacao?.baseHorasTexto} · ociosidade {fmtPctOcup(d.ocupacao?.ociosidade)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg p-3 bg-card border border-border">
              <div className="font-semibold text-xs mb-2 text-foreground">Por dia</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground"><th className="text-left font-medium">Dia</th><th className="text-right font-medium">Ocup.</th><th className="text-right font-medium">Livre</th></tr>
                </thead>
                <tbody>
                  {(d.ocupacao?.porDia || []).filter(temBaseOcupacaoLinha).map(x => (
                    <tr key={x.dow} className="border-t border-border">
                      <td className="py-1 text-foreground">{x.dia}</td>
                      <td className="text-right font-semibold text-foreground tabular-nums">{fmtH(x.horasOcupadas)}</td>
                      <td className="text-right text-muted-foreground tabular-nums">{fmtH(x.horasLivres)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg p-3 bg-card border border-border">
              <div className="font-semibold text-xs mb-2 text-foreground">Por turno</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground"><th className="text-left font-medium">Recorte</th><th className="text-right font-medium">% ocup.</th><th className="text-right font-medium">Livre</th></tr>
                </thead>
                <tbody>
                  {(d.ocupacao?.porTurno || []).filter(temBaseOcupacaoLinha).map(x => (
                    <tr key={`${x.dow}-${x.turno}`} className="border-t border-border">
                      <td className="py-1 text-foreground">{DOW_PT[x.dow]} · {x.turno}</td>
                      <td className="text-right font-semibold text-foreground tabular-nums">{fmtPctOcup(x.pct)}</td>
                      <td className="text-right text-muted-foreground tabular-nums">{fmtH(x.horasLivres)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {exp === "pacs" && (
        <div className="px-4 pb-4 pt-1">
          {d.allPacs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum paciente nesta grade.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {d.allPacs.map(p => (
                <div key={p} className="text-xs px-2.5 py-1.5 rounded-lg bg-muted/50 text-foreground">{p}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

type SortKey = "alpha" | "delta_desc" | "delta_asc" | "ocup_desc" | "ocup_asc"

const SORT_OPTIONS: { k: SortKey; l: string }[] = [
  { k: "alpha", l: "A–Z" },
  { k: "delta_desc", l: "Maior % vs antigo" },
  { k: "delta_asc", l: "Menor % vs antigo" },
  { k: "ocup_desc", l: "Maior ocupação" },
  { k: "ocup_asc", l: "Menor ocupação" },
]

export function AnaliseFuturaTab() {
  const { resultado, refWeek, analMes, presenca, loading, error, gradeVazia, totalGrade } = useAnaliseFutura()
  const { config } = useRemuneracaoConfig()
  const { setHeader, setRightContent } = useHeader()

  const ccPA = config?.cc_pa_default ?? 50
  const ccPE = config?.cc_pe_default ?? 100
  const etaBonus = config?.eta_bonus_default ?? 100
  const presencaNum = presenca ?? 80

  const pdfOpts: AnaliseFuturaPdfOpts = { analMes, presenca: presencaNum, ccPA, ccPE, etaBonus }

  const [busca, setBusca] = useState("")
  const [filtrosEsp, setFiltrosEsp] = useState<string[]>(["todos"])
  const [sortKey, setSortKey] = useState<SortKey>("alpha")
  const [expandido, setExpandido] = useState<Record<string, SecaoExpandida>>({})

  useEffect(() => {
    setHeader("Rem. Mês - Previsão", "Relacionamento Prestador")
    setRightContent(
      <div className="flex items-center gap-4">
        {totalGrade > 0 && (
          <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400 px-3 py-1 text-xs font-medium">
            <CheckCircle2 size={11} className="text-green-500" />
            Grade · {totalGrade.toLocaleString("pt-BR")} horários
          </span>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays size={11} />
          <span className="font-medium text-foreground/60">Período</span>
          <span>{refWeek.label}</span>
        </div>
      </div>
    )
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent, refWeek.label, totalGrade])

  const dadosPorProf = resultado?.dadosPorProf ?? []

  const allTerps = resultado?.allTerps ?? []

  const dadosFiltrados = useMemo(() => {
    let r = dadosPorProf
    const q = busca.trim().toLowerCase()
    if (q) r = r.filter(d => d.prof.toLowerCase().includes(q))
    if (filtrosEsp.length > 0 && !filtrosEsp.includes("todos")) {
      r = r.filter(d => filtrosEsp.some(f => d.terapiaDetails.some(t => t.terp === f)))
    }
    return r
  }, [dadosPorProf, busca, filtrosEsp])

  const dadosOrdenados = useMemo(() => {
    return [...dadosFiltrados].sort((a, b) => {
      if (sortKey === "delta_desc" || sortKey === "delta_asc") {
        if (a.deltaProp100 === null && b.deltaProp100 === null) return a.prof.localeCompare(b.prof)
        if (a.deltaProp100 === null) return 1
        if (b.deltaProp100 === null) return -1
        return sortKey === "delta_desc" ? b.deltaProp100 - a.deltaProp100 : a.deltaProp100 - b.deltaProp100
      }
      if (sortKey === "ocup_desc" || sortKey === "ocup_asc") {
        if (a.taxaOcupacao === null && b.taxaOcupacao === null) return a.prof.localeCompare(b.prof)
        if (a.taxaOcupacao === null) return 1
        if (b.taxaOcupacao === null) return -1
        return sortKey === "ocup_desc" ? b.taxaOcupacao - a.taxaOcupacao : a.taxaOcupacao - b.taxaOcupacao
      }
      return a.prof.localeCompare(b.prof)
    })
  }, [dadosFiltrados, sortKey])

  const { tot100, totX, alerts, totalAntigo, pendContr } = useMemo(() => ({
    tot100: dadosFiltrados.reduce((s, d) => s + d.total100, 0),
    totX: dadosFiltrados.reduce((s, d) => s + d.totalX, 0),
    alerts: dadosPorProf.filter(d => d.alertaCC).length,
    totalAntigo: dadosFiltrados.filter(d => d.temAntigo).reduce((s, d) => s + (d.salAntigoProporcional || d.salAntigo || 0), 0),
    pendContr: dadosFiltrados.filter(d => !d.temAntigo).length,
  }), [dadosFiltrados, dadosPorProf])

  const toggleFiltro = (key: string) => {
    if (key === "todos") { setFiltrosEsp(["todos"]); return }
    setFiltrosEsp(cur => {
      const sem = cur.filter(x => x !== "todos")
      if (sem.includes(key)) {
        const next = sem.filter(x => x !== key)
        return next.length ? next : ["todos"]
      }
      return [...sem, key]
    })
  }
  const filtroAtivo = (key: string) => (key === "todos" ? filtrosEsp.includes("todos") || !filtrosEsp.length : filtrosEsp.includes(key))
  const toggleExp = (prof: string, tipo: Exclude<SecaoExpandida, null>) =>
    setExpandido(e => ({ ...e, [prof]: e[prof] === tipo ? null : tipo }))

  if (loading) {
    return <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Carregando…</div>
  }

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>
  }

  if (gradeVazia || !resultado) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhum agendamento encontrado para a semana de referência ({refWeek.label}).
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Projeção mensal com base na semana de referência: <strong className="text-foreground">{refWeek.label}</strong>
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryTile label="Exibindo" value={dadosFiltrados.length} tone="blue" />
        <SummaryTile label="Total 100% / mês" value={fmt(tot100)} tone="green" />
        <SummaryTile label={`Total ${presenca ?? "—"}% / mês`} value={fmt(totX)} tone="blue" />
        <SummaryTile label="Total antigo proporcional" value={fmt(totalAntigo)} tone="slate" />
        <SummaryTile label="Dados contratuais pendentes" value={pendContr} tone={pendContr > 0 ? "red" : "slate"} />
        {alerts > 0 && (
          <SummaryTile
            label="Alertas CC"
            value={<span className="inline-flex items-center gap-1"><AlertTriangle size={18} />{alerts}</span>}
            tone="red"
          />
        )}
      </div>

      {resultado.feriadosMes.length > 0 && (
        <div className="rounded-xl px-4 py-2.5 text-xs flex flex-wrap gap-x-3 gap-y-1 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">
          <span className="font-semibold flex items-center gap-1"><CalendarDays size={12} /> Feriados no mês:</span>
          {resultado.feriadosMes.map(f => (
            <span key={f.date} className="font-medium">{f.date.slice(5)} {f.nome} ({DOW_PT[f.dow]})</span>
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar profissional…"
              className="w-full rounded-lg border border-border bg-muted/50 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {busca && (
            <button type="button" onClick={() => setBusca("")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <X size={12} /> limpar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground mr-1">Especialidade:</span>
          <button
            type="button"
            onClick={() => toggleFiltro("todos")}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filtroAtivo("todos")
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white"
                : "bg-transparent text-foreground border-border hover:bg-muted/50"
            }`}
          >
            Todos
          </button>
          <select
            value=""
            onChange={e => { if (e.target.value) toggleFiltro(e.target.value) }}
            className="rounded-full border border-border bg-transparent px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">+ Outra especialidade</option>
            {allTerps.map(t => (
              <option key={t} value={t}>{filtrosEsp.includes(t) ? "✓ " : ""}{t}</option>
            ))}
          </select>
          {filtrosEsp.filter(f => f !== "todos").map(f => (
            <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-600 text-white">
              {f}
              <button type="button" onClick={() => toggleFiltro(f)} className="opacity-70 hover:opacity-100 transition-opacity">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Ordenar por:</span>
            {SORT_OPTIONS.map(({ k, l }) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortKey(k)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  sortKey === k
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white"
                    : "bg-transparent text-foreground border-border hover:bg-muted/50"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => exportarAnaliseXlsx({ dadosFiltrados, analMes, presenca: presencaNum, etaBonus, ccPE })}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
            style={{ background: B.green }}
          >
            <Download size={13} />
            Exportar XLSX
          </button>
        </div>
      </div>

      {dadosOrdenados.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Users size={20} className="text-muted-foreground/50" />
          Nenhum profissional encontrado com esses filtros.
        </div>
      )}

      <div className="space-y-3">
        {dadosOrdenados.map(d => (
          <ProfissionalCard
            key={d.prof}
            d={d}
            exp={expandido[d.prof] ?? null}
            onToggle={tipo => toggleExp(d.prof, tipo)}
            presenca={presencaNum}
            ccPA={ccPA}
            ccPE={ccPE}
            etaBonus={etaBonus}
            feriadosMes={resultado.feriadosMes}
            pdfOpts={pdfOpts}
          />
        ))}
      </div>
    </div>
  )
}
