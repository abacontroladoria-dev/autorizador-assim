"use client"

// Dashboard de topo da Análise de Tratativas — mostra EVOLUÇÃO (quanto do que
// deveria ter sido evoluído já foi), não só a contagem bruta de tratativas.
//
// Fonte dos números (ver lib/remuneracao/calculo.ts calcularRemuneracaoReal,
// que resumirTratativas.ts reveste sem valores monetários):
//   • cada sessão real vira UMA entrada `papel: "Agenda"` no profissional
//     originalmente escalado — sempre, incondicionalmente. É por isso que
//     contar entradas "Agenda" dá o total de sessões sem duplicar nada.
//   • quando outro profissional evolui a sessão, ela GANHA uma SEGUNDA entrada
//     `papel: "Substituição realizada"` no profissional que evoluiu — a mesma
//     sessão, sob duas pessoas. A entrada "Agenda" original fica com
//     classificacao "Substituição" e não conta como evoluída ali, então somar
//     as duas fontes não soma a sessão duas vezes.
//   • "Cancelado" e "Feriado/Ponto Fac." (papel "Agenda") saem do denominador:
//     não há o que evoluir numa sessão que não aconteceu.
//
// Este agregado NÃO é a soma das "evoluções esperadas" dos cards, e a diferença
// é de propósito — são duas perguntas diferentes:
//   • aqui: "quantas SESSÕES do período foram evoluídas?" Cada sessão entra uma
//     vez no denominador (pela entrada "Agenda", mesmo quando foi substituída) e
//     uma vez no numerador se alguém a evoluiu.
//   • no card/modal: "quanto da RESPONSABILIDADE desta pessoa ela cumpriu?" Ali
//     a sessão cedida sai do denominador dela e entra no de quem assumiu, então
//     a substituição é contada por pessoa (ver lib/remuneracao/evolucao.ts).
// Somar os cards e comparar com este número, portanto, não fecha — e não deveria.
//   • "Evolução normal" e "Evolução duplicada" (mesma pessoa salvando de novo,
//     a autoria não muda) contam como evoluídas; "Evolução sem presença",
//     "Cancelado evoluído" e "Evolução em conflito" são inconsistências — não
//     contam, porque a captura não deu para confiar nelas ainda.
//
// Nenhum dado novo foi necessário: tudo isto já vem de csv_grades_profissionais
// via vw_grade_base, e já estava disponível em ProfTratativas.sessoes.
//
// A ordenação da lista por especialidade é só apresentação (useMemo local,
// controlado pelo dropdown "ordenar por") — os números de cada especialidade
// não mudam, só a ordem em que aparecem.

import { useMemo, useState } from "react"
import { ArrowUpDown, ChevronDown, Filter, X } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { useToneColor, type Tone } from "@/hooks/useToneColor"
import { dataParaISO, formatDateBR } from "@/lib/remuneracao/datas"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ProfTratativas, SessaoTratativa } from "@/lib/remuneracao/tratativas"

interface DashboardProps {
  resultado: ProfTratativas[]
  especialidadeFiltro: string | null
  onFiltroEspecialidade: (esp: string | null) => void
}

type EspEvolucao = { especialidade: string; total: number; comTratativa: number; semTratativa: number; pct: number }

type ResumoEvolucao = {
  totalConsiderado: number
  comTratativa: number
  semTratativa: number
  pctEvolucao: number
  profissionaisComTratativa: number
  porEspecialidade: EspEvolucao[]
  /** dd/mm/aaaa até onde a contagem vai, só quando o período carregado inclui dias futuros. */
  cortadoEm: string | null
}

// Sessões que não deveriam entrar no denominador — não há o que evoluir nelas.
const FORA_DO_DENOMINADOR = new Set(["Cancelado", "Feriado/Ponto Fac."])
// Evolução feita pelo próprio profissional escalado (inclui "duplicada": a
// autoria é certa, só a captura registrou o salvamento duas vezes).
const EVOLUIDA_PROPRIA = new Set(["Evolução normal", "Evolução duplicada"])

function calcularResumoEvolucao(resultado: ProfTratativas[]): ResumoEvolucao {
  const hoje = new Date()
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`

  let totalConsiderado = 0
  let comTratativa = 0
  let temSessaoFutura = false
  const porEsp: Record<string, { total: number; comTratativa: number }> = {}

  const bucket = (esp: string) => (porEsp[esp] ??= { total: 0, comTratativa: 0 })

  for (const p of resultado) {
    for (const s of p.sessoes as SessaoTratativa[]) {
      // Mês em curso: dia futuro ainda não aconteceu, não há o que evoluir —
      // contar como "pendente" derrubaria o percentual por um motivo errado.
      const dataIso = dataParaISO(s.data)
      if (dataIso && dataIso > hojeISO) { temSessaoFutura = true; continue }

      const esp = s.especialidade || "Sem especialidade"
      const cls = s.classificacao ?? ""

      if (s.papel === "Agenda") {
        if (FORA_DO_DENOMINADOR.has(cls)) continue
        totalConsiderado++
        bucket(esp).total++
        if (EVOLUIDA_PROPRIA.has(cls)) {
          comTratativa++
          bucket(esp).comTratativa++
        }
      } else if (s.papel === "Substituição realizada") {
        // A sessão em si já foi contada no denominador pela entrada "Agenda"
        // (classificacao "Substituição" ali) — aqui só soma ao numerador.
        comTratativa++
        bucket(esp).comTratativa++
      }
    }
  }

  const porEspecialidade = Object.entries(porEsp).map(([especialidade, x]) => ({
    especialidade,
    total: x.total,
    comTratativa: x.comTratativa,
    semTratativa: x.total - x.comTratativa,
    pct: x.total > 0 ? (x.comTratativa / x.total) * 100 : 0,
  }))

  return {
    totalConsiderado,
    comTratativa,
    semTratativa: totalConsiderado - comTratativa,
    pctEvolucao: totalConsiderado > 0 ? (comTratativa / totalConsiderado) * 100 : 0,
    profissionaisComTratativa: resultado.filter(p => p.evoluidasProprias + p.substituicoesRealizadas > 0).length,
    porEspecialidade,
    cortadoEm: temSessaoFutura ? formatDateBR(hojeISO) : null,
  }
}

// Tom semântico (não a cor final — a cor depende do tema, ver useToneColor).
// B.amber fixo falhava 4,5:1 no dark mode em texto pequeno/negrito (3,57:1);
// useToneColor já resolve isso corretamente, e CardTratativas.tsx no mesmo
// diretório já usava esse padrão — só não tinha sido reaproveitado aqui.
function tonePorPct(pct: number): Tone {
  return pct >= 80 ? "green" : pct >= 50 ? "amber" : "red"
}

function fmtPct(pct: number): string {
  return pct.toFixed(1).replace(".", ",")
}

function Metric({ label, value, cor, title }: { label: string; value: number; cor?: string; title?: string }) {
  return (
    <span className="flex flex-col" title={title}>
      <span className="text-base font-bold tabular-nums leading-tight" style={cor ? { color: cor } : undefined}>
        {value.toLocaleString("pt-BR")}
      </span>
      <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
    </span>
  )
}

type SortKey = "pct" | "total" | "comTratativa" | "semTratativa"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "pct", label: "Evolução" },
  { key: "total", label: "Total de sessões" },
  { key: "comTratativa", label: "Com evolução" },
  { key: "semTratativa", label: "Pendentes" },
]

const LIMITE_INICIAL = 10

export function TratativasDashboard({ resultado, especialidadeFiltro, onFiltroEspecialidade }: DashboardProps) {
  const resumo = useMemo(() => calcularResumoEvolucao(resultado), [resultado])
  const [verTodas, setVerTodas] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("pct")
  const toneColor = useToneColor()

  const especialidadesOrdenadas = useMemo(
    () => [...resumo.porEspecialidade].sort((a, b) => b[sortKey] - a[sortKey]),
    [resumo.porEspecialidade, sortKey],
  )

  if (resultado.length === 0) return null

  const especialidadesVisiveis = verTodas ? especialidadesOrdenadas : especialidadesOrdenadas.slice(0, LIMITE_INICIAL)
  const corHero = toneColor(tonePorPct(resumo.pctEvolucao))
  const larguraGeral = Math.max(resumo.pctEvolucao, resumo.comTratativa > 0 ? 2 : 0)

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${B.blue}, ${B.green})` }} />

      <div className="p-5 md:p-6 space-y-4">
        {/* Cabeçalho: título + controle de filtro ativo */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-foreground">
            Evolução por especialidade{resumo.cortadoEm && ` até ${resumo.cortadoEm}`}
          </h2>
          {especialidadeFiltro && (
            <button
              type="button"
              onClick={() => onFiltroEspecialidade(null)}
              aria-label={`Remover filtro: ${especialidadeFiltro}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground hover:opacity-70 transition-opacity"
            >
              <Filter size={11} />
              {especialidadeFiltro}
              <X size={11} />
            </button>
          )}
        </div>

        {/* Métricas: percentual em destaque à esquerda + apoio em coluna à direita da linha */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-black tabular-nums leading-none" style={{ color: corHero }}>
              {fmtPct(resumo.pctEvolucao)}%
            </span>
            <span className="text-xs font-semibold text-muted-foreground">Evoluído</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Metric
              label="Total de sessões"
              value={resumo.totalConsiderado}
              title={
                "Sessões que exigem evolução no período. Menor que o número de linhas da grade no"
                + " cabeçalho: ficam fora as especialidades administrativas (Operações Clínicas,"
                + " Especialista Técnico de Área, Supervisão ABA), os horários fictícios (bloqueado,"
                + " reservado, notificação) e as sessões canceladas ou em feriado."
              }
            />
            <Metric label="Com evolução" value={resumo.comTratativa} cor={toneColor("green")} />
            <Metric label="Pendentes" value={resumo.semTratativa} cor={toneColor("amber")} />
          </div>
        </div>

        {/* Progresso geral — a barra é o elemento de comparação principal */}
        <div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            {/* clip-path em vez de width: não força reflow a cada frame, e o
                arredondamento fica por conta do container (overflow-hidden),
                sem esticar o rounded-full em porcentagens baixas como
                transform:scaleX faria. */}
            <div
              className="h-full w-full"
              style={{
                background: corHero,
                clipPath: `inset(0 ${100 - larguraGeral}% 0 0)`,
                transition: "clip-path 500ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {resumo.comTratativa.toLocaleString("pt-BR")} de {resumo.totalConsiderado.toLocaleString("pt-BR")} sessões
          </div>
        </div>

        {/* Ranking por especialidade */}
        <div className="pt-1">
          <div className="flex items-center justify-end gap-2 mb-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Ordenar especialidades por"
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 sm:min-h-0"
                >
                  <ArrowUpDown size={11} />
                  {SORT_OPTIONS.find(o => o.key === sortKey)?.label}
                  <ChevronDown size={11} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                {SORT_OPTIONS.map(o => (
                  <DropdownMenuItem
                    key={o.key}
                    onSelect={() => setSortKey(o.key)}
                    className={sortKey === o.key ? "bg-muted font-semibold text-foreground" : ""}
                  >
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {especialidadesOrdenadas.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Sem sessões para detalhar por especialidade ainda.</p>
          ) : (
            <div>
              {/* Cabeçalho de colunas — só desktop, usa o mesmo grid-template das
                  linhas para que os rótulos fiquem exatamente sobre seus valores. */}
              <div className="hidden sm:grid sm:grid-cols-[35fr_20fr_30fr_10fr] sm:gap-4 px-2 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/70">Especialidade</span>
                <span className="text-[10px] font-semibold text-muted-foreground/70">Sessões</span>
                <span className="col-span-2 text-[10px] font-semibold text-muted-foreground/70">Evolução</span>
              </div>

              {especialidadesVisiveis.map(esp => {
                const selected = especialidadeFiltro === esp.especialidade
                const dimmed = !!especialidadeFiltro && !selected
                const cor = toneColor(tonePorPct(esp.pct))
                const widthPct = Math.max(esp.pct, esp.comTratativa > 0 ? 3 : 0)
                return (
                  <button
                    key={esp.especialidade}
                    type="button"
                    onClick={() => onFiltroEspecialidade(selected ? null : esp.especialidade)}
                    aria-pressed={selected}
                    aria-label={
                      selected
                        ? `Remover filtro de ${esp.especialidade}`
                        : `Filtrar por ${esp.especialidade}, ${fmtPct(esp.pct)}% de evolução`
                    }
                    title={esp.especialidade}
                    className={`grid min-h-11 w-full grid-cols-1 content-center items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-[opacity,background-color] duration-150 hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:grid-cols-[35fr_20fr_30fr_10fr] sm:gap-4 sm:py-2 ${
                      selected ? "bg-muted/60" : ""
                    } ${dimmed ? "opacity-35" : "opacity-100"}`}
                  >
                    {/* Mobile: nome + percentual na primeira linha. Desktop: `contents`
                        remove esta div do layout e as duas spans viram itens diretos do
                        grid (a primeira ocupa a coluna "Especialidade"). */}
                    <div className="flex items-center gap-3 sm:contents">
                      <span className={`min-w-0 flex-1 truncate text-sm ${selected ? "font-bold text-foreground" : "font-medium text-foreground/90"}`}>
                        {esp.especialidade}
                      </span>
                      <span className="shrink-0 text-right text-sm font-bold tabular-nums sm:hidden" style={{ color: cor }}>
                        {fmtPct(esp.pct)}%
                      </span>
                    </div>

                    {/* Mobile: números + barra na segunda linha. Desktop: idem, `contents`
                        — números viram a coluna "Sessões", a barra vira a coluna "Evolução"
                        (30fr, preenche a largura real do card em vez de um pixel fixo). */}
                    <div className="flex items-center gap-3 sm:contents">
                      <span className="min-w-0 flex-1 sm:flex-none">
                        <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
                          {esp.comTratativa.toLocaleString("pt-BR")} / {esp.total.toLocaleString("pt-BR")}
                        </span>
                        {/* Sempre ocupa a linha (mesmo sem pendência, via nbsp) para
                            todas as linhas terem a mesma altura — só o texto some. */}
                        <span className="block truncate text-[10px] text-muted-foreground/60">
                          {esp.semTratativa > 0
                            ? `${esp.semTratativa.toLocaleString("pt-BR")} pendente${esp.semTratativa > 1 ? "s" : ""}`
                            : " "}
                        </span>
                      </span>

                      <span className="h-2 min-w-0 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:w-full">
                        <span
                          className="block h-full w-full"
                          style={{
                            background: cor,
                            clipPath: `inset(0 ${100 - widthPct}% 0 0)`,
                            transition: "clip-path 500ms cubic-bezier(0.16, 1, 0.3, 1)",
                          }}
                        />
                      </span>
                    </div>

                    <span className="hidden text-right text-sm font-bold tabular-nums sm:block" style={{ color: cor }}>
                      {fmtPct(esp.pct)}%
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {especialidadesOrdenadas.length > LIMITE_INICIAL && (
            <button
              type="button"
              onClick={() => setVerTodas(v => !v)}
              className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-foreground hover:opacity-70 transition-opacity"
            >
              <ChevronDown size={13} className={`transition-transform ${verTodas ? "rotate-180" : ""}`} />
              {verTodas ? "Ver menos" : `Ver todas as especialidades (${especialidadesOrdenadas.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
