"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Wallet, Users, X, ChevronRight, FileClock } from "lucide-react"
import { fmt } from "@/lib/remuneracao/formatacao"
import { B } from "@/lib/cronograma/constants"
import { calcularTotalPorEspecialidade } from "@/lib/remuneracao/dashboardRP"
import { SemContratoAnteriorModal } from "./SemContratoAnteriorModal"
import type { ProfRemunReal } from "@/lib/remuneracao/calculo"

// ─── Contagem animada do valor total (respeita prefers-reduced-motion) ───────

function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target)
  const prevTarget = useRef(0)
  const firstRun = useRef(true)

  useEffect(() => {
    const prefersReduced = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (prefersReduced) {
      setValue(target)
      prevTarget.current = target
      firstRun.current = false
      return
    }

    const from = firstRun.current ? 0 : prevTarget.current
    firstRun.current = false
    const start = performance.now()
    let raf = 0

    function tick(now: number) {
      const t = Math.min((now - start) / durationMs, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else prevTarget.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return value
}

// ─── Barra horizontal de especialidade (cresce ao montar) ────────────────────

function useReveal(): boolean {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const prefersReduced = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) { setRevealed(true); return }
    const raf = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return revealed
}

interface DashboardProps {
  resultado: ProfRemunReal[]
  especialidadeFiltro: string | null
  onFiltroEspecialidade: (esp: string | null) => void
}

export function RemuneracaoRPDashboard({ resultado, especialidadeFiltro, onFiltroEspecialidade }: DashboardProps) {
  const { totalMes, totalVariavel, totalBancoHoras, profsBancoHoras, porEspecialidade } =
    useMemo(() => calcularTotalPorEspecialidade(resultado), [resultado])
  const animatedTotal = useCountUp(totalMes)
  const revealed = useReveal()
  const [hoverEsp, setHoverEsp] = useState<string | null>(null)
  const [semAnteriorAberto, setSemAnteriorAberto] = useState(false)
  const gatilhoSemAnterior = useRef<HTMLButtonElement>(null)

  const semContratoAnterior = useMemo(() => resultado.filter(p => !p.temAntigo), [resultado])

  const maxValor = porEspecialidade[0]?.valor ?? 0

  if (resultado.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${B.green}, ${B.blue})` }} />

      <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Hero: total do mês ── */}
        <div className="lg:col-span-2 flex flex-col justify-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <Wallet size={13} className="text-emerald-600 dark:text-emerald-400" />
            Total do mês que a empresa vai pagar
          </div>
          <div className="mt-2 text-4xl md:text-5xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">
            {fmt(animatedTotal)}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users size={13} />
            {resultado.length} profissiona{resultado.length !== 1 ? "is" : "l"} com remuneração neste mês
          </div>

          {/* Banco de horas é valor fixo de contrato, não apuração por sessão —
              some no hero mas fica decomposto aqui, senão o total viraria um
              número sem origem para quem confere a folha. */}
          {totalBancoHoras > 0 && (
            <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
              <span className="tabular-nums font-semibold text-foreground">{fmt(totalVariavel)}</span> em PA/PPD/PE/ETA
              {" + "}
              <span className="tabular-nums font-semibold text-amber-700 dark:text-amber-400">{fmt(totalBancoHoras)}</span>
              {" "}fixo de banco de horas ({profsBancoHoras} profissiona{profsBancoHoras !== 1 ? "is" : "l"})
            </div>
          )}

          {/* Pendência de cadastro, não de folha — mas tem de PARECER botão.
              Como frase sublinhada em cinza-mudo passava batido, virou controle
              com moldura, fundo próprio, rótulo em contraste cheio e contagem
              em pastilha: o mesmo vocabulário do botão "Contém Inconsistência"
              logo abaixo na página, que é o que a pessoa já reconhece como
              clicável aqui. Neutro de propósito — nesta tela vermelho é
              inconsistência (dinheiro em dúvida) e âmbar é banco de horas; um
              terceiro sentido no mesmo matiz apagaria os dois. */}
          {semContratoAnterior.length > 0 && (
            <button
              ref={gatilhoSemAnterior}
              type="button"
              onClick={() => setSemAnteriorAberto(true)}
              aria-haspopup="dialog"
              aria-expanded={semAnteriorAberto}
              aria-label={
                semContratoAnterior.length === 1
                  ? "Ver o profissional sem contrato anterior cadastrado"
                  : `Ver os ${semContratoAnterior.length} profissionais sem contrato anterior cadastrado`
              }
              className="group mt-4 inline-flex w-fit max-w-full items-center gap-2 self-start rounded-lg border border-border bg-background px-3 py-2 text-left shadow-sm transition-colors hover:border-foreground/25 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FileClock size={14} className="shrink-0 text-muted-foreground" aria-hidden />
              {/* Rótulo curto + contagem em pastilha, e não a frase inteira:
                  a coluna tem ~330px em notebook e "34 profissionais sem
                  contrato anterior" não cabe sem truncar. A frase completa vive
                  no aria-label e no título do modal. */}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                Sem contrato anterior
              </span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-foreground">
                {semContratoAnterior.length}
              </span>
              <ChevronRight
                size={14}
                className="shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                aria-hidden
              />
            </button>
          )}
        </div>

        {/* ── Barras: total por especialidade ── */}
        <div className="lg:col-span-3 lg:border-l lg:border-border lg:pl-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Total por especialidade
            </div>
            {especialidadeFiltro ? (
              <button
                type="button"
                onClick={() => onFiltroEspecialidade(null)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground hover:opacity-70 transition-opacity"
              >
                <X size={11} /> limpar filtro
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">clique para filtrar</span>
            )}
          </div>

          {porEspecialidade.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem valores para detalhar por especialidade ainda.</p>
          ) : (
            <div className="space-y-2.5">
              {porEspecialidade.map(esp => {
                const selected = especialidadeFiltro === esp.especialidade
                const dimmed = !!especialidadeFiltro && !selected
                const isHover = hoverEsp === esp.especialidade
                const widthPct = maxValor > 0 ? Math.max((esp.valor / maxValor) * 100, 4) : 0

                return (
                  <button
                    key={esp.especialidade}
                    type="button"
                    onClick={() => onFiltroEspecialidade(selected ? null : esp.especialidade)}
                    onMouseEnter={() => setHoverEsp(esp.especialidade)}
                    onMouseLeave={() => setHoverEsp(null)}
                    onFocus={() => setHoverEsp(esp.especialidade)}
                    onBlur={() => setHoverEsp(null)}
                    title={`${esp.especialidade}: ${fmt(esp.valor)} · ${(esp.pct * 100).toFixed(1)}% do total do mês · ${esp.profissionais.length} profissional(is)`}
                    aria-pressed={selected}
                    className={`w-full text-left transition-opacity duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md ${dimmed ? "opacity-35" : "opacity-100"}`}
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className={`text-xs truncate ${selected ? "font-bold text-foreground" : "font-semibold text-foreground/90"}`}>
                        {esp.especialidade}
                      </span>
                      <span className="text-xs font-bold tabular-nums text-foreground shrink-0">
                        {fmt(esp.valor)}
                      </span>
                    </div>
                    <div className="h-3 rounded-md bg-muted overflow-hidden">
                      <div
                        className="h-full transition-[width] duration-500 ease-out"
                        style={{
                          width: revealed ? `${widthPct}%` : "0%",
                          borderRadius: "2px 5px 5px 2px",
                          background: selected || isHover ? B.blue : `${B.blue}b3`,
                        }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {totalBancoHoras > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
              As barras somam {fmt(totalMes)} e já incluem o valor fixo de banco de horas — cada contrato em banco de horas tem uma especialidade só, então o valor dele entra direto na barra dela.
            </p>
          )}
        </div>
      </div>

      <SemContratoAnteriorModal
        aberto={semAnteriorAberto}
        onOpenChange={setSemAnteriorAberto}
        pendentes={semContratoAnterior}
        total={resultado.length}
        gatilho={gatilhoSemAnterior}
      />
    </div>
  )
}
