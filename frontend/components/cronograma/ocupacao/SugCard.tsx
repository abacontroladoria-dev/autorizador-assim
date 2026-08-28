"use client"

import { useState } from "react"
import { Ban, CalendarDays, CheckCircle2, Clock, Repeat, Users, XCircle } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { fmtName } from "@/lib/cronograma/helpers"
import { PBadge } from "@/components/cronograma/ui/PBadge"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { type Tone } from "@/components/cronograma/ui/tones"
import type { Sugestao, WaStatus } from "@/types/cronograma"

const REGRA_LABEL: Record<string, string> = {
  "R1":          "Regra 1 — Completar Grupo",
  "R2":          "Regra 2 — Sessão Livre Adjacente",
  "R3":          "Regra 3 — Novo Dia",
  "R4":          "Regra 4 — Remanejamento",
  "Ocup. R2":    "Regra 2 — Sessão Livre Adjacente",
  "Foco adj.":   "Foco — Sessão Adjacente",
  "Foco novo dia": "Foco — Novo Dia",
}

// Status WhatsApp → par tonal + ícone Lucide (substitui os hex + emoji).
const WA_ST: Record<string, { lbl: string; tone: Tone; icon: React.ReactNode } | null> = {
  "":         null,
  aguardando: { lbl: "Aguardando WA", tone: "blue",  icon: <Clock size={11} /> },
  aceito:     { lbl: "Aceito",        tone: "green", icon: <CheckCircle2 size={11} /> },
  recusado:   { lbl: "Recusado",      tone: "red",   icon: <XCircle size={11} /> },
  inviavel:   { lbl: "Inviável",      tone: "slate", icon: <Ban size={11} /> },
}

export interface SugCardProps {
  s: Sugestao
  waStatus: WaStatus | null
  onWA: (s: Sugestao) => void
  onInv: (s: Sugestao) => void
  onCron: (s: Sugestao) => void
  fila?: boolean
}

export function SugCard({ s, waStatus, onWA, onInv, onCron, fila = false }: SugCardProps) {
  const [confirming, setConfirming] = useState(false)

  const isGrupo = s.colegas !== "—"
  const isR4    = s.regra === "R4"

  const railColor = isGrupo ? B.purple : B.blue
  const wa = WA_ST[waStatus ?? ""] ?? null

  return (
    <>
      <div
        className={`rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden mb-1 ${
          isGrupo ? "bg-violet-50/40 dark:bg-violet-950/20" : "bg-card"
        } ${confirming ? "ring-2 ring-emerald-400/60" : ""} ${waStatus === "aceito" ? "opacity-50" : ""}`}
        style={{ borderLeft: `4px solid ${railColor}` }}
      >
        <div className="p-3">
          {/* ── Header: badges + ações ── */}
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill tone={isGrupo ? "purple" : "blue"} dense>
                {isGrupo ? <><Users size={11} /> Montar Grupo</> : <><CalendarDays size={11} /> Ocupar Vaga Livre</>}
              </StatusPill>
              <StatusPill tone="slate" dense>{REGRA_LABEL[s.regra] ?? s.regra}</StatusPill>
              <PBadge prio={s.prio} />
              {fila && s.filaM && <StatusPill tone="amber" dense>Fila: {s.filaM}</StatusPill>}
              {s.obs && <StatusPill tone={s.obs.includes("Juliana") ? "red" : "amber"} dense>{s.obs}</StatusPill>}
              {wa && (
                <StatusPill
                  tone={wa.tone} variant="solid" dense
                  title={waStatus === "aguardando" ? "Vaga reservada: só libera com Recusado, Inviável ou Desfazer envio." : "Status da proposta."}
                >
                  {wa.icon} {wa.lbl}
                </StatusPill>
              )}
            </div>

            {!confirming && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button" onClick={() => onCron(s)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                >
                  <CalendarDays size={12} /> Ver
                </button>
                {!waStatus && (
                  <button
                    type="button" onClick={() => setConfirming(true)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                  >
                    <CheckCircle2 size={12} /> Aceitar
                  </button>
                )}
                {!waStatus && (
                  <button
                    type="button" onClick={() => onInv(s)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
                  >
                    <Ban size={12} /> Inviável
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Grid de detalhes ── */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <Detalhe label="Paciente" strong>{s.pac}</Detalhe>
            <Detalhe label="Profissional">{fmtName(s.prof)}</Detalhe>
            <Detalhe label="Terapia (Exibição)">{s.tP}{s.esp && s.esp !== s.tP ? ` (${s.esp})` : ""}</Detalhe>
            <Detalhe label="Unidade">{s.unidade}</Detalhe>
            <Detalhe label="Dia / Hora" strong>{s.dia} {s.hora}</Detalhe>
            <Detalhe label="Gap / Convênio">{s.gap > 0 ? `+${s.gap}x` : "—"} · {s.conv || "—"}</Detalhe>

            {s.colegas !== "—" && (() => {
              const membros = s.colegas.split(", ").filter(Boolean)
              const total = membros.length + 1
              return (
                <div className="col-span-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    Grupo na sessão
                    <StatusPill tone="purple" dense>{total} pessoas</StatusPill>
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {membros.map((m, i) => (
                      <div key={i} className="flex items-baseline gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400">
                        <span className="min-w-[14px] text-[10px] font-extrabold tabular-nums">{i + 1}.</span>
                        {m}
                      </div>
                    ))}
                    <div className="flex items-baseline gap-1.5 text-xs italic text-muted-foreground">
                      <span className="min-w-[14px] text-[10px] font-extrabold tabular-nums">{total}.</span>
                      {s.pac} <span className="text-[10px]">(este paciente)</span>
                    </div>
                  </div>
                </div>
              )
            })()}

            {s.vComp && s.vComp !== "—" && (
              <div className="col-span-2">
                <div className="flex items-center gap-1 text-muted-foreground">
                  {isR4 ? <><Repeat size={11} /> Remanejamento</> : s.regra?.startsWith("Foco") ? "Atenção para oferta" : "Vaga complementar (R3 — oferecer junto)"}
                </div>
                <div className="font-semibold text-amber-700 dark:text-amber-400">{s.vComp}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal de confirmação ── */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirming(false) }}
        >
          <div className="w-full max-w-[400px] rounded-2xl bg-card p-6 shadow-2xl">
            <div className="text-lg font-black text-foreground mb-1">
              Aceitar e enviar para Acompanhamento
            </div>
            <div className="text-xs text-muted-foreground mb-4">
              A vaga ficará reservada e aparecerá em Acompanhamento → Aguardando Resposta.
            </div>

            {/* Resumo da proposta */}
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3.5 mb-4">
              <div className="text-md font-extrabold text-foreground mb-1.5">{s.pac}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <ResumoItem label="Terapia">{s.tP}</ResumoItem>
                <ResumoItem label="Profissional">{fmtName(s.prof)}</ResumoItem>
                <ResumoItem label="Dia / Hora" strong>{s.dia} {s.hora}</ResumoItem>
                <ResumoItem label="Unidade">{s.unidade}</ResumoItem>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { onWA(s); setConfirming(false) }}
                className="flex-1 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-colors"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg px-4 py-2.5 text-[13px] font-semibold bg-muted text-foreground hover:bg-muted/70 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Detalhe({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={strong ? "font-bold text-foreground text-[13px]" : "text-foreground"}>{children}</div>
    </div>
  )
}

function ResumoItem({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={strong ? "font-bold text-foreground" : "font-semibold text-foreground"}>{children}</div>
    </div>
  )
}