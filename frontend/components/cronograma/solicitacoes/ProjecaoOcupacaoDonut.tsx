"use client"

// ProjecaoOcupacaoDonut — donut de "quanto a ocupação pode crescer se as
// sugestões (direto + remanejamento) forem adotadas". Mesmo estilo visual do
// painel "Carga semanal" de SimulacaoNovoPrestadorTab.tsx (PieChart do
// recharts, % no centro, stat-rows coloridos abaixo) — usado tanto em
// AgendaProfissional (DisponibilidadeInternaView) quanto em GradeCategoria
// (OcupacaoCategoriaView), só trocando a fonte das 3 contagens.
//
// Interativo (2026-08-17): fatia OU stat-row clicável seleciona um segmento
// — o pai usa `segmentoSelecionado`/`onSelecionarSegmento` pra destacar/
// esmaecer a grade de horários correspondente, sem esse componente saber
// nada sobre como essa grade é montada.

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"
import { TONE_ACCENT } from "@/components/cronograma/ui/tones"

export type SegmentoOcupacao = "ocupado" | "oportunidade" | "livre"

interface Props {
  titulo: string
  ocupado: number
  oportunidade: number
  livre: number
  segmentoSelecionado?: SegmentoOcupacao | null
  onSelecionarSegmento?: (segmento: SegmentoOcupacao | null) => void
}

const SEGMENTOS: { key: SegmentoOcupacao; nome: string; color: string; linha: string; texto: string; anel: string }[] = [
  { key: "ocupado", nome: "Ocupado", color: TONE_ACCENT.green, linha: "bg-emerald-50 dark:bg-emerald-950/30", texto: "text-emerald-700 dark:text-emerald-400", anel: "ring-emerald-400 dark:ring-emerald-600" },
  { key: "oportunidade", nome: "Oportunidade para agendar", color: TONE_ACCENT.blue, linha: "bg-sky-50 dark:bg-sky-950/30", texto: "text-sky-700 dark:text-sky-400", anel: "ring-sky-400 dark:ring-sky-600" },
  { key: "livre", nome: "Livre, sem oportunidade", color: TONE_ACCENT.slate, linha: "bg-muted", texto: "text-muted-foreground", anel: "ring-slate-400 dark:ring-slate-500" },
]

export function ProjecaoOcupacaoDonut({ titulo, ocupado, oportunidade, livre, segmentoSelecionado, onSelecionarSegmento }: Props) {
  const valores: Record<SegmentoOcupacao, number> = { ocupado, oportunidade, livre }
  const total = ocupado + oportunidade + livre
  const pctAtual = total > 0 ? Math.round((ocupado / total) * 100) : 0
  const pctProjetado = total > 0 ? Math.round(((ocupado + oportunidade) / total) * 100) : 0

  const dados = SEGMENTOS.filter(s => valores[s.key] > 0).map(s => ({ ...s, value: valores[s.key] }))
  const interativo = !!onSelecionarSegmento

  function alternar(segmento: SegmentoOcupacao) {
    onSelecionarSegmento?.(segmentoSelecionado === segmento ? null : segmento)
  }

  return (
    <div className="w-full shrink-0 rounded-xl bg-muted/40 p-4">
      <div className="text-sm font-extrabold text-foreground">{titulo}</div>
      <div className="mb-3 text-[11px] text-muted-foreground">Projeção se as sugestões forem adotadas</div>

      {!total ? (
        <div className="py-6 text-center text-[11px] text-muted-foreground">Sem horários pra projetar ainda.</div>
      ) : (
        <>
          <div className="relative mx-auto aspect-square w-[150px] sm:w-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dados}
                  cx="50%" cy="50%" innerRadius="62%" outerRadius="88%"
                  dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}
                >
                  {dados.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.color}
                      opacity={!segmentoSelecionado || segmentoSelecionado === d.key ? 1 : 0.3}
                      onClick={() => interativo && alternar(d.key)}
                      style={{ cursor: interativo ? "pointer" : "default", transition: "opacity 150ms" }}
                    />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(val, name) => [`${val ?? 0} horário(s)`, name]} contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-black text-foreground">{pctAtual}%</span>
              {oportunidade > 0 && (
                <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400">→ {pctProjetado}%</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {SEGMENTOS.map(s => {
              const ativo = segmentoSelecionado === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={!interativo}
                  onClick={() => alternar(s.key)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-left transition-all ${s.linha} ${interativo ? "cursor-pointer hover:brightness-95" : ""} ${ativo ? `ring-2 ring-offset-1 ring-offset-background ${s.anel}` : ""}`}
                >
                  <span className={`text-[11px] font-bold ${s.texto}`}>{s.nome}</span>
                  <span className={`text-sm font-extrabold ${s.texto}`}>{s.key === "oportunidade" ? `+${valores[s.key]}` : valores[s.key]}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
