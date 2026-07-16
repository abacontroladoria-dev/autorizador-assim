"use client"

// TerapiaChip — chip de especialidade. Substitui o hack de alpha-hex
// (`tc + "22"` / `tc + "88"`) do GapsTab por um chip neutro dark-safe com um
// dot na cor da terapia (TERAPIA_CORES). O dot é um accent minúsculo — único
// uso legítimo de hex de paleta sobre superfície (§2.1/§2.4/§3.4 do plano).
//
// Fundo/texto neutros (bg-muted/foreground) garantem contraste em light e dark;
// a identidade cromática da terapia vem só do dot, como na legenda.

import { tCor } from "@/lib/cronograma/constants"

export function TerapiaChip({ esp, dense = false }: { esp: string; dense?: boolean }) {
  const cor = tCor(esp, true)
  const sizing = dense ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1"
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 font-medium text-foreground whitespace-nowrap ${sizing}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cor }} />
      {esp}
    </span>
  )
}