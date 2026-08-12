"use client"

// Estado de carregamento da Rem. Mês - Total.
//
// Existe porque a página, enquanto lia a grade do banco, mostrava só um
// "Carregando configuração…" de uma linha acima do vazio — a mensagem de NÃO
// EXISTE DADO ocupando a tela enquanto o dado está a caminho. Lê-se como tela
// quebrada (§3.9 do padrão de detalhamento em modal).
//
// O esqueleto imita o layout real (painel do dashboard + barra de ferramentas +
// linhas de profissional) para a página não pular quando o conteúdo chega, e vem
// com a frase do que está sendo lido — o número de sessões não é previsível, mas
// o período é.
//
// Só aparece quando NÃO há nada na tela. Na recarga com dado visível, a lista
// fica onde está e o aviso vira "Atualizando…" (ver RemunRPTab): esconder o que
// a pessoa está lendo é pior que fazê-la esperar.

import { Loader2 } from "lucide-react"

/** Bloco cinza pulsante. `motion-safe` para respeitar prefers-reduced-motion. */
function Barra({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-muted motion-safe:animate-pulse ${className}`} />
}

/** Uma linha de profissional: bloco numérico, identificação, valor, métricas. */
function LinhaFantasma() {
  return (
    <div className="mb-3 flex flex-col gap-4 rounded-xl bg-card px-5 py-4 shadow-sm xl:flex-row xl:items-center xl:gap-6">
      <div className="flex items-center gap-3 xl:basis-72 xl:shrink-0 xl:grow">
        <Barra className="size-16 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Barra className="h-4 w-48 max-w-full" />
          <Barra className="h-3 w-32 max-w-full" />
        </div>
      </div>

      <div className="space-y-2 xl:shrink-0 xl:border-l xl:border-border xl:pl-6">
        <Barra className="h-2.5 w-16" />
        <Barra className="h-6 w-28" />
        <Barra className="h-2.5 w-50 rounded-full" />
        <Barra className="h-3 w-40" />
      </div>

      <div className="flex flex-wrap gap-6 xl:ml-auto xl:shrink-0 xl:flex-nowrap xl:border-l xl:border-border xl:pl-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex min-w-22.5 flex-col items-center gap-1.5">
            <Barra className="size-4 rounded-full" />
            <Barra className="h-2.5 w-16" />
            <Barra className="h-4 w-6" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  /** Ex.: "01/08 a 31/08" — o que está sendo lido, já que o quanto é imprevisível. */
  periodo: string
}

export function RemuneracaoRPSkeleton({ periodo }: Props) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy>
      {/* Painel: total do mês, composição e ranking por especialidade */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <Barra className="h-1 w-full rounded-none" />
        <div className="space-y-4 p-5 md:p-6">
          <Barra className="h-4 w-56 max-w-full" />
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <Barra className="h-11 w-64 max-w-full" />
            <div className="flex flex-wrap gap-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="space-y-1.5">
                  <Barra className="h-4 w-24" />
                  <Barra className="h-2.5 w-28" />
                </div>
              ))}
            </div>
          </div>
          <Barra className="h-3 w-full rounded-full" />
          <div className="space-y-2 pt-1">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4">
                <Barra className="h-3 flex-1" />
                <Barra className="h-2 w-24 shrink-0 rounded-full sm:w-40" />
                <Barra className="h-3 w-20 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Barra de ferramentas: busca, filtro de inconsistência, exportar */}
      <div className="flex items-center gap-3">
        <Barra className="h-8 flex-1 rounded-lg" />
        <Barra className="h-8 w-48 shrink-0 rounded-lg" />
        <Barra className="h-8 w-32 shrink-0 rounded-lg" />
      </div>

      <p className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden />
        Lendo a grade de {periodo}…
      </p>

      <div>
        {[0, 1, 2, 3].map(i => <LinhaFantasma key={i} />)}
      </div>
    </div>
  )
}
