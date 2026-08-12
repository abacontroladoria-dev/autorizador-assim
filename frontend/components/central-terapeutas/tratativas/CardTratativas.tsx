"use client"

// Linha de profissional da Análise de Evolução. Deliberadamente compacta: é uma
// visão gerencial de varredura, e o detalhamento vive no modal de análise
// (ModalAnaliseTerapeuta) — antes ele abria inline aqui, empurrando a lista
// para baixo e escondendo quatro tabelas dentro de accordions.
//
// Não calcula nada: composicaoEvolucao() é a mesma fonte que o modal usa, então
// os números do card e do modal não podem divergir. Como o resto da tela, não
// existe NADA monetário aqui (ver lib/remuneracao/tratativas.ts).

import { useMemo } from "react"
import { CheckCircle2, ChevronRight, Clock, HelpCircle, Repeat2 } from "lucide-react"
import { useToneColor, type Tone } from "@/hooks/useToneColor"
import { composicaoEvolucao } from "@/lib/remuneracao/evolucao"
import type { ProfTratativas } from "@/lib/remuneracao/tratativas"
import { TONE_CHIP } from "@/components/ui/tones"

const fmtPct = (pct: number) => pct.toFixed(1).replace(".", ",")

/**
 * Métrica do resumo: ícone acima, nome por extenso, valor em destaque abaixo.
 * A cor só aparece quando o número é diferente de zero — "0 inconsistências" em
 * vermelho grita por um problema que não existe, e quatro números coloridos em
 * sequência fazem nenhum deles chamar atenção.
 */
function MetricMini({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number; tone: Tone
}) {
  const toneColor = useToneColor()
  const cor = toneColor(value > 0 ? tone : "gray")
  return (
    <div className="flex min-w-22.5 flex-col items-center gap-1 px-4 text-center">
      <span style={{ color: cor }}>{icon}</span>
      <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">{label}</span>
      <span className="text-lg font-black tabular-nums leading-none" style={{ color: cor }}>{value}</span>
    </div>
  )
}

interface CardTratativasProps {
  p: ProfTratativas
  onAbrir: (prof: string) => void
}

export default function CardTratativas({ p, onAbrir }: CardTratativasProps) {
  const toneColor = useToneColor()
  const c = useMemo(() => composicaoEvolucao(p), [p])
  const isCC = useMemo(() => p.sessoes.some(s => s.especialidade === "Coordenador de Caso"), [p.sessoes])

  // Dois sinais diferentes, de propósito:
  //  • statusTone (bloco numérico) = o que mais urge nesta pessoa — inconsistência,
  //    depois pendência, depois evolução feita; cinza = sem atividade.
  //  • pctTone (barra e percentual) = a leitura da própria evolução. Antes a barra
  //    usava statusTone e pintava 90,9% de vermelho porque havia 1 inconsistência,
  //    dizendo "evolução péssima" sobre um número bom. A inconsistência já tem
  //    métrica própria à direita; a barra fala só da cobertura.
  const statusTone: Tone = c.inconsistencias > 0 ? "red"
    : c.pendentes > 0 ? "amber"
    : c.comEvolucao > 0 ? "green"
    : "gray"

  const pctTone: Tone = c.esperadas === 0 ? "gray" : c.pct >= 80 ? "green" : c.pct >= 50 ? "amber" : "red"
  const larguraBarra = Math.max(0, Math.min(100, c.pct))

  return (
    <button
      type="button"
      onClick={() => onAbrir(p.prof)}
      aria-haspopup="dialog"
      aria-label={`Analisar ${p.prof} — ${fmtPct(c.pct)}% de evolução`}
      className="mb-3 flex w-full flex-col gap-4 rounded-xl bg-card px-5 py-4 text-left shadow-sm transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none xl:flex-row xl:items-center xl:gap-6"
    >
      {/* Identificação — basis dá o piso de 288px e o grow absorve a sobra, para
          o nome caber inteiro (sem truncar) sem empurrar a evolução nem as
          métricas, que ficam shrink-0. */}
      <div className="flex items-center gap-3 xl:basis-72 xl:shrink-0 xl:grow">
        <div className={`flex size-16 shrink-0 items-center justify-center rounded-xl ${TONE_CHIP[statusTone].bg} ${TONE_CHIP[statusTone].text}`}>
          <div className="text-2xl font-black tabular-nums leading-none">{c.previstos}</div>
        </div>

        <div className="min-w-0">
          <div className="text-base font-bold wrap-break-word text-foreground">{p.prof}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {c.previstos} agendamentos previstos
            {isCC && p.pacientesCCQtd > 0 && ` · ${p.pacientesCCQtd} pac. de CC`}
          </div>
        </div>
      </div>

      {/* Evolução */}
      <div className="xl:shrink-0 xl:border-l xl:border-border xl:pl-6">
        <div className="mb-1.5 text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Evolução</div>
        <div className="flex items-center gap-2.5">
          {/* flex-1 + min-w-0 em vez de w-full: assim o percentual (shrink-0) é
              medido primeiro e a barra fica com a sobra até o teto de 200px —
              com w-full ela reservava os 200px e empurrava o número para fora
              da tela em largura apertada. */}
          <div className="h-2.5 min-w-0 max-w-50 flex-1 overflow-hidden rounded-full border border-border bg-muted xl:min-w-35">
            <div
              className="h-full w-full"
              style={{
                background: toneColor(pctTone),
                clipPath: `inset(0 ${100 - larguraBarra}% 0 0)`,
                transition: "clip-path 500ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>
          <span className="shrink-0 text-sm font-black tabular-nums" style={{ color: toneColor(pctTone) }}>
            {c.esperadas > 0 ? `${fmtPct(c.pct)}%` : "—"}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {c.esperadas > 0
            ? `${c.comEvolucao} com evolução de ${c.esperadas} esperadas`
            : "Sem evoluções esperadas"}
        </div>
      </div>

      {/* Indicadores */}
      <div className="flex flex-wrap divide-x divide-border xl:ml-auto xl:shrink-0 xl:flex-nowrap xl:border-l xl:border-border">
        <MetricMini icon={<CheckCircle2 size={16} />} label="Com evolução"    value={c.comEvolucao}     tone="green" />
        <MetricMini icon={<Clock size={16} />}        label="Pendentes"       value={c.pendentes}       tone="amber" />
        <MetricMini icon={<Repeat2 size={16} />}      label="Substituições"   value={c.substituicoes}   tone="purple" />
        <MetricMini icon={<HelpCircle size={16} />}   label="Inconsistências" value={c.inconsistencias} tone="red" />
      </div>

      <ChevronRight size={16} aria-hidden className="hidden shrink-0 text-muted-foreground xl:block" />
    </button>
  )
}
