"use client"

// Painel "Onde já dá pra aproveitar internamente" — equivalente, na visão
// por Unidade/Dia/Especialidade, ao painel "Sugestões automáticas de
// contratação" da Simulação de Novo Prestador (SugestoesContratacaoPanel.tsx):
// em vez de indicar onde CONTRATAR renderia mais ocupação, aponta quais
// combinações turno+especialidade já têm mais oportunidade (direto +
// remanejamento) com quem já está contratado, sem precisar abrir vaga nova.
// Clicar em "Aplicar" preenche os filtros abaixo (unidade/dia+turno/
// especialidade), reaproveitando a mesma grade já renderizada.

import { useMemo, useState } from "react"
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { rankearOportunidadesInternas, type CategoriaComOportunidade } from "@/lib/cronograma/ocupacaoCategoria"
import { diaCurto, turnoNome } from "@/lib/cronograma/helpers"
import { Button } from "@/components/ui/button"
import { InlineNotice } from "@/components/cronograma/ui/InlineNotice"
import type { GapItem, Turno } from "@/lib/cronograma/simulacaoNovoPrestador"
import type { CsvRow } from "@/types/cronograma"

const ITENS_POR_PAGINA = 12

interface Props {
  cRows: CsvRow[]
  gapMap: Record<string, GapItem>
  onAplicar: (unidade: string, dia: string, turno: Turno, especialidade: string) => void
}

function CardOportunidade({ item, onAplicar }: { item: CategoriaComOportunidade; onAplicar: () => void }) {
  const total = item.qtdDireto + item.qtdRemanejamento
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-extrabold text-foreground">{item.especialidade}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-[12.5px] font-bold text-foreground">{item.unidade}</span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {diaCurto(item.dia)} · {turnoNome[item.turno]}
        </div>
        <div className="mt-1.5 text-[11px] text-foreground">
          {total} oportunidade(s) — {item.qtdDireto} direta(s), {item.qtdRemanejamento} via remanejamento
          {item.qtdLivre > 0 && ` · ${item.qtdLivre} livre(s) sem oportunidade`}
        </div>
      </div>
      <Button size="xs" onClick={onAplicar} className="shrink-0 gap-1">
        Aplicar <ArrowRight size={12} />
      </Button>
    </div>
  )
}

export function OportunidadesInternasPanel({ cRows, gapMap, onAplicar }: Props) {
  const [pagina, setPagina] = useState(0)
  const ranking = useMemo(() => rankearOportunidadesInternas(cRows, gapMap), [cRows, gapMap])

  const totalPaginas = Math.max(1, Math.ceil(ranking.length / ITENS_POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const itensDaPagina = ranking.slice(paginaAtual * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA + ITENS_POR_PAGINA)

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={15} className="text-violet-600 dark:text-violet-400" />
        <span className="text-[15px] font-extrabold text-foreground">Onde já dá pra aproveitar internamente</span>
      </div>
      <div className="mb-3 text-xs text-muted-foreground">
        Ranqueado por turno+especialidade com mais oportunidade (direto + remanejamento) usando quem já está contratado — sem precisar abrir vaga nova.
      </div>

      {!ranking.length ? (
        <InlineNotice tone="slate">Nenhuma combinação com oportunidade interna no momento.</InlineNotice>
      ) : (
        <>
          <div className="mb-2 text-[11px] text-muted-foreground">{ranking.length} combinação(ões) com oportunidade</div>
          <div className="flex flex-col gap-2">
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
