"use client"

// Estado de carregamento da Análise de Evolução.
//
// Existe porque a página abria carregando a grade do banco sozinha e não dizia
// nada: o corpo caía direto no vazio "Sem sessões nesta grade — troque o mês",
// que é a mensagem de NÃO EXISTE DADO sendo mostrada enquanto o dado está a
// caminho. O único sinal de vida era um spinner de 13px no header. Dava a
// impressão de tela quebrada.
//
// O esqueleto imita o layout real (painel de evolução + linhas de profissional)
// para a página não pular quando o conteúdo chega, e vem com a frase do que
// está sendo lido — o número de sessões não é previsível, mas o período é.

import { Loader2 } from "lucide-react"

/** Bloco cinza pulsante. `motion-safe` para respeitar prefers-reduced-motion. */
function Barra({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-muted motion-safe:animate-pulse ${className}`} />
}

/** Uma linha de profissional: bloco numérico, identificação, evolução, métricas. */
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
  /** Ex.: "Julho de 2026" — o que está sendo lido, já que o quanto é imprevisível. */
  periodo: string
}

export function TratativasSkeleton({ periodo }: Props) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy>
      {/* Painel de evolução */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <Barra className="h-1 w-full rounded-none" />
        <div className="space-y-4 p-5 md:p-6">
          <Barra className="h-4 w-56 max-w-full" />
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <Barra className="h-11 w-36" />
            <div className="flex flex-wrap gap-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="space-y-1.5">
                  <Barra className="h-4 w-14" />
                  <Barra className="h-2.5 w-24" />
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
                <Barra className="h-3 w-10 shrink-0" />
              </div>
            ))}
          </div>
        </div>
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
