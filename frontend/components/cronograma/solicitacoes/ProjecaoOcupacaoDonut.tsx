"use client"

// ProjecaoOcupacaoDonut — donut de "quanto a ocupação pode crescer se as
// sugestões (direto + remanejamento) forem adotadas". Mesmo estilo visual do
// painel "Carga semanal" de SimulacaoNovoPrestadorTab.tsx (PieChart do
// recharts, % no centro, stat-rows coloridos abaixo) — usado tanto em
// AgendaProfissional (DisponibilidadeInternaView) quanto em GradeCategoria
// (OcupacaoCategoriaView), só trocando a fonte das 3 contagens.

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"
import { TONE_ACCENT } from "@/components/cronograma/ui/tones"

interface Props {
  titulo: string
  ocupado: number
  oportunidade: number
  livre: number
}

export function ProjecaoOcupacaoDonut({ titulo, ocupado, oportunidade, livre }: Props) {
  const total = ocupado + oportunidade + livre
  const pctAtual = total > 0 ? Math.round((ocupado / total) * 100) : 0
  const pctProjetado = total > 0 ? Math.round(((ocupado + oportunidade) / total) * 100) : 0

  const dados = [
    { name: "Ocupado", value: ocupado, color: TONE_ACCENT.green },
    { name: "Pode crescer (oportunidades)", value: oportunidade, color: TONE_ACCENT.blue },
    { name: "Livre, sem oportunidade", value: livre, color: TONE_ACCENT.slate },
  ].filter(d => d.value > 0)

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
                  {dados.map((d, i) => <Cell key={i} fill={d.color} />)}
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
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Ocupado</span>
              <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400">{ocupado}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-sky-50 dark:bg-sky-950/30 px-3 py-2">
              <span className="text-[11px] font-bold text-sky-700 dark:text-sky-400">Pode crescer</span>
              <span className="text-sm font-extrabold text-sky-700 dark:text-sky-400">+{oportunidade}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <span className="text-[11px] font-bold text-muted-foreground">Livre, sem oportunidade</span>
              <span className="text-sm font-extrabold text-muted-foreground">{livre}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
