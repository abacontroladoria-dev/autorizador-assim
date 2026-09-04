"use client"

// Linha de profissional da Rem. Mês - Total. Deliberadamente compacta: é uma
// visão de varredura ("quem precisa de atenção"), e o detalhamento vive em
// ModalRemuneracaoRP — antes ele abria inline aqui, empurrando a lista para
// baixo e escondendo quatro tabelas dentro de accordions dentro do card aberto.
//
// Não calcula nada: composicaoRP() é a mesma fonte que o modal usa, então os
// números do card e do modal não podem divergir (§3.1 do padrão de detalhamento
// em modal). Segue o desenho de CardTratativas.tsx, com uma diferença de
// domínio: a leitura principal desta tela é R$ a pagar, não só o percentual.

import { useMemo } from "react"
import { CheckCircle2, ChevronRight, Clock, HelpCircle, Repeat2, Wallet } from "lucide-react"

import { useToneColor, type Tone } from "@/hooks/useToneColor"
import { TONE_CHIP, StatusChip } from "@/components/ui/tones"
import { composicaoRP, corrigirTotalComPEP } from "@/lib/remuneracao/composicaoRP"
import { fmt } from "@/lib/remuneracao/formatacao"
import type { ProfRemunReal } from "@/lib/remuneracao/calculo"

const fmtPct = (pct: number) => pct.toFixed(1).replace(".", ",")

/**
 * Métrica do resumo: ícone acima, nome por extenso, valor em destaque abaixo.
 * A cor só aparece quando o número é diferente de zero — "0 inconsistências" em
 * vermelho grita por um problema que não existe, e quatro números coloridos em
 * sequência fazem nenhum deles chamar atenção (§3.5).
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

interface CardRemunRPProps {
  p: ProfRemunReal
  onAbrir: (prof: string) => void
  /** PEP apurada pra este prestador na competência — vem de pep_apuracao_mensal. */
  pepInfo?: { potencial: number; alcancado: number }
}

export default function CardRemunRP({ p, onAbrir, pepInfo }: CardRemunRPProps) {
  const toneColor = useToneColor()
  const c = useMemo(() => composicaoRP(p), [p])
  const isCC = useMemo(() => p.sessoes.some(s => s.especialidade === "Coordenador de Caso"), [p.sessoes])
  const pep = useMemo(() => corrigirTotalComPEP(c, isCC, pepInfo), [c, isCC, pepInfo])

  // Dois sinais diferentes, de propósito (§3.6):
  //  • statusTone (bloco numérico) = o que mais urge nesta pessoa — inconsistência,
  //    depois registro não realizado, depois sessão remunerada.
  //  • pctTone (barra e percentual) = a leitura da própria cobertura. O card
  //    antigo pintava a barra com a cor de status: uma única inconsistência
  //    deixava 90,9% de vermelho, dizendo "péssimo" sobre um número bom.
  const statusTone: Tone = c.inconsistencias > 0 ? "red"
    : c.pendentes > 0 ? "amber"
    : c.remuneradas > 0 ? "green"
    : "gray"

  const pctTone: Tone = c.baseRemuneravel === 0 ? "gray" : c.pct >= 80 ? "green" : c.pct >= 50 ? "amber" : "red"
  const larguraBarra = Math.max(0, Math.min(100, c.pct))

  return (
    <button
      type="button"
      onClick={() => onAbrir(p.prof)}
      aria-haspopup="dialog"
      aria-label={`Detalhar remuneração de ${p.prof} — ${fmt(pep.valorTotalAPagar)}`}
      className="mb-3 flex w-full flex-col gap-4 rounded-xl bg-card px-5 py-4 text-left shadow-sm transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none xl:flex-row xl:items-center xl:gap-6"
    >
      {/* Identificação — basis dá o piso de 288px e o grow absorve a sobra, para
          o nome caber inteiro (sem truncar) sem empurrar o valor nem as métricas,
          que ficam shrink-0. */}
      <div className="flex items-center gap-3 xl:basis-72 xl:shrink-0 xl:grow">
        <div className={`flex size-16 shrink-0 flex-col items-center justify-center rounded-xl ${TONE_CHIP[statusTone].bg} ${TONE_CHIP[statusTone].text}`}>
          <div className="text-2xl font-black tabular-nums leading-none">{c.agendadas}</div>
          <div className="mt-0.5 text-[9px] font-medium opacity-70">ag.</div>
        </div>

        <div className="min-w-0">
          <div className="text-base font-bold wrap-break-word text-foreground">{p.prof}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {c.agendadas} agendamentos
            {isCC && p.pacientesCCQtd > 0 && ` · ${p.pacientesCCQtd} pac. de CC`}
          </div>
          {c.emBancoDeHoras && (
            <div className="mt-1.5">
              {/* Mesmo vocabulário da Análise Futura, para as duas telas dizerem
                  a mesma coisa sobre o mesmo contrato. */}
              <StatusChip tone={c.fixoNaoCadastrado ? "red" : "amber"} dense>
                <Wallet size={11} aria-hidden />
                {c.fixoNaoCadastrado
                  ? "Banco de horas sem valor cadastrado"
                  : c.soFixo ? "Banco de horas" : "Banco de horas + PA"}
              </StatusChip>
            </div>
          )}
        </div>
      </div>

      {/* Leitura principal: quanto a empresa paga, e quanto da base foi coberto */}
      <div className="xl:shrink-0 xl:border-l xl:border-border xl:pl-6">
        <div className="mb-1 text-[11px] font-bold tracking-wider uppercase text-muted-foreground">A pagar</div>
        {/* Zero não tem cor (§3.5): "R$ 0,00" em verde diz "pago, tudo certo"
            justamente sobre quem não recebe nada — o caso do contrato de banco
            de horas sem valor cadastrado. */}
        <div className="text-2xl font-black tabular-nums leading-none" style={{ color: toneColor(pep.valorTotalAPagar > 0 ? "green" : "gray") }}>
          {fmt(pep.valorTotalAPagar)}
        </div>
        {isCC && !pep.pepApurada && (
          <div className="mt-0.5">
            <StatusChip tone="amber" dense>PEP não apurada</StatusChip>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2.5">
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
            {c.baseRemuneravel > 0 ? `${fmtPct(c.pct)}%` : "—"}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {c.baseRemuneravel > 0
            ? `${c.remuneradas} remuneradas de ${c.baseRemuneravel} da base`
            : "Sem base remunerável"}
        </div>
      </div>

      {/* Indicadores */}
      <div className="flex flex-wrap divide-x divide-border xl:ml-auto xl:shrink-0 xl:flex-nowrap xl:border-l xl:border-border">
        <MetricMini icon={<CheckCircle2 size={16} />} label="Remuneradas"   value={c.remuneradas}     tone="green" />
        <MetricMini icon={<Clock size={16} />}        label="Sem registro"  value={c.pendentes}       tone="amber" />
        <MetricMini icon={<Repeat2 size={16} />}      label="Substituições" value={c.substituicoes}   tone="purple" />
        <MetricMini icon={<HelpCircle size={16} />}   label="Inconsistências" value={c.inconsistencias} tone="red" />
      </div>

      <ChevronRight size={16} aria-hidden className="hidden shrink-0 text-muted-foreground xl:block" />
    </button>
  )
}
