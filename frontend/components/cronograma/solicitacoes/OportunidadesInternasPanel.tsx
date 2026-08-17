"use client"

// Painel "Onde já dá pra aproveitar internamente" — equivalente, na visão
// por Unidade/Dia/Especialidade, ao painel "Sugestões automáticas de
// contratação" da Simulação de Novo Prestador (SugestoesContratacaoPanel.tsx):
// em vez de indicar onde CONTRATAR renderia mais ocupação, aponta quais
// combinações turno+especialidade já têm mais oportunidade (direto +
// remanejamento) com quem já está contratado, sem precisar abrir vaga nova.
// Clicar em "Aplicar" preenche os filtros abaixo (unidade/dia+turno/
// especialidade), reaproveitando a mesma grade já renderizada.
//
// Visual alinhado ao painel-irmão (mesmo badge de % colorido por faixa, mesma
// especialidade colorida, mesmo indicador dia/turno minimalista e mesmo
// filtro de faixa ≥70/60/50%) — dois painéis com a mesma pergunta ("onde
// olhar primeiro?") devem parecer a mesma ferramenta.

import { startTransition, useMemo, useState } from "react"
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { rankearOportunidadesInternas, TODAS_FAIXAS_OPORTUNIDADE, type CategoriaComOportunidade } from "@/lib/cronograma/ocupacaoCategoria"
import { corTerapiaBadge, escurecerHex, hexParaRgba } from "@/lib/cronograma/constants"
import { Button } from "@/components/ui/button"
import { InlineNotice } from "@/components/cronograma/ui/InlineNotice"
import { BadgeOcupacao, COR_OCUPACAO } from "@/components/cronograma/ui/BadgeOcupacao"
import { IndicadorDiaTurno } from "@/components/cronograma/ui/IndicadorDiaTurno"
import type { FaixaCascata } from "@/lib/cronograma/sugestaoContratacao"
import type { GapItem, Turno } from "@/lib/cronograma/simulacaoNovoPrestador"
import type { CsvRow } from "@/types/cronograma"

const ITENS_POR_PAGINA = 5
const FAIXAS_FILTRO: FaixaCascata[] = [70, 60, 50]

interface Props {
  cRows: CsvRow[]
  gapMap: Record<string, GapItem>
  onAplicar: (unidade: string, dia: string, turno: Turno, especialidade: string) => void
}

function CardOportunidade({ item, onAplicar }: { item: CategoriaComOportunidade; onAplicar: () => void }) {
  const total = item.qtdDireto + item.qtdRemanejamento + item.qtdNovoDia
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-3.5">
      <BadgeOcupacao pct={item.pctAproveitamento} faixa={item.faixa} label="aproveitado" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-full border px-2 py-0.5 text-[12.5px] font-extrabold"
            style={{
              backgroundColor: hexParaRgba(corTerapiaBadge(item.especialidade), 0.16),
              borderColor: hexParaRgba(corTerapiaBadge(item.especialidade), 0.4),
              color: escurecerHex(corTerapiaBadge(item.especialidade), 0.35),
            }}
          >
            {item.especialidade}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-[12.5px] font-bold text-foreground">{item.unidade}</span>
        </div>
        <IndicadorDiaTurno dia={item.dia} turnos={[item.turno]} corBar={COR_OCUPACAO[item.faixa].bar} />

        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 font-semibold text-foreground">
            {total} oportunidade(s) — {item.qtdDireto} direta(s), {item.qtdRemanejamento} via remanejamento, {item.qtdNovoDia} via novo dia
          </span>
          {item.qtdLivre > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
              {item.qtdLivre} livre(s) sem oportunidade
            </span>
          )}
        </div>
      </div>

      <Button size="xs" onClick={onAplicar} className="shrink-0 gap-1">
        Aplicar <ArrowRight size={12} />
      </Button>
    </div>
  )
}

export function OportunidadesInternasPanel({ cRows, gapMap, onAplicar }: Props) {
  const [faixasSelecionadas, setFaixasSelecionadas] = useState<ReadonlySet<FaixaCascata>>(TODAS_FAIXAS_OPORTUNIDADE)
  const [pagina, setPagina] = useState(0)
  const ranking = useMemo(() => rankearOportunidadesInternas(cRows, gapMap, faixasSelecionadas), [cRows, gapMap, faixasSelecionadas])

  // startTransition: recalcular o ranking varre unidade × dia × especialidade
  // (~195 combinações) — sem isso, marcar/desmarcar uma faixa trava o clique
  // até o recálculo terminar (mesmo cuidado de SugestoesContratacaoPanel.tsx).
  const alternarFaixa = (faixa: FaixaCascata) => startTransition(() => {
    setFaixasSelecionadas(prev => {
      const proxima = new Set(prev)
      if (proxima.has(faixa)) {
        if (proxima.size === 1) return prev // sempre precisa sobrar pelo menos 1 faixa marcada
        proxima.delete(faixa)
      } else {
        proxima.add(faixa)
      }
      return proxima
    })
    setPagina(0)
  })

  const totalPaginas = Math.max(1, Math.ceil(ranking.length / ITENS_POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const itensDaPagina = ranking.slice(paginaAtual * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA + ITENS_POR_PAGINA)

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={15} className="text-violet-600 dark:text-violet-400" />
        <span className="text-[15px] font-extrabold text-foreground">Onde já dá pra aproveitar internamente</span>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
          {ranking.length} combinação(ões)
        </span>
      </div>
      <div className="mb-3 text-xs text-muted-foreground">
        Ranqueado por % da capacidade "Livre" já aproveitada (direto + remanejamento) com quem já está contratado — sem precisar abrir vaga nova.
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/40 px-3 py-2.5">
        <span className="text-[11px] font-bold text-muted-foreground">Faixa:</span>
        <div className="flex gap-1">
          {FAIXAS_FILTRO.map(faixa => {
            const ativa = faixasSelecionadas.has(faixa)
            return (
              <button
                key={faixa}
                type="button"
                onClick={() => alternarFaixa(faixa)}
                aria-pressed={ativa}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  ativa
                    ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                }`}
              >
                ≥ {faixa}%
              </button>
            )
          })}
        </div>
      </div>

      {!ranking.length ? (
        <InlineNotice tone="slate">
          Nenhuma combinação com oportunidade interna ≥ {Math.min(...faixasSelecionadas)}% no momento — tente marcar uma faixa mais baixa acima.
        </InlineNotice>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {itensDaPagina.map((item, i) => (
              <CardOportunidade
                key={`${item.unidade}-${item.dia}-${item.turno}-${item.especialidade}-${i}`}
                item={item}
                onAplicar={() => onAplicar(item.unidade, item.dia, item.turno, item.especialidade)}
              />
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline" size="icon-xs"
                disabled={paginaAtual === 0}
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft size={13} />
              </Button>
              {Array.from({ length: totalPaginas }, (_, i) => i).map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPagina(i)}
                  className={`h-7 min-w-7 rounded-full border px-2 text-[11px] font-bold transition-colors ${
                    i === paginaAtual
                      ? "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500"
                      : "border-border bg-card text-foreground hover:bg-muted/50"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <Button
                variant="outline" size="icon-xs"
                disabled={paginaAtual === totalPaginas - 1}
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                aria-label="Próxima página"
              >
                <ChevronRight size={13} />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
