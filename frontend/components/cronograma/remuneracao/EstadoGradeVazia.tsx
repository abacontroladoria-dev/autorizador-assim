"use client"

// O que ocupa o corpo da página enquanto não há remuneração para mostrar.
//
// Antes havia um texto só, fixo: "Faça upload do relatório csv_grade_profissionais
// (mês completo)...". Ele nasceu quando a grade só vinha de upload manual e ficou
// para trás quando a leitura passou a ser do banco. O resultado é que a página
// pedia um upload enquanto carregava sozinha, e continuava pedindo o mesmo upload
// quando o problema era outro — dava uma instrução errada em dois estados
// diferentes.
//
// São três situações distintas e cada uma merece a sua frase:
//
//   carregando  — a grade está vindo. Diga isso, com o período, para a espera ter
//                 tamanho conhecido.
//   reprovada   — o modal já explicou e tem os botões. Aqui fica só um lembrete
//                 curto, sem repetir a explicação nem competir com ela.
//   vazia       — não há grade e ninguém está carregando.

import { Database, Loader2 } from "lucide-react"

const CAIXA = "rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground"

/** "2026-07-01" → "01/07". */
const diaMes = (iso: string) => {
  const [, m, d] = iso.split("-")
  return d && m ? `${d}/${m}` : iso
}

export interface EstadoGradeVaziaProps {
  carregando: boolean
  periodo: { de: string; ate: string }
  /** Título curto da reprovação, quando houver. A explicação mora no modal. */
  erroResumo: string | null
}

export function EstadoGradeVazia({ carregando, periodo, erroResumo }: EstadoGradeVaziaProps) {
  if (carregando) {
    return (
      <div className={CAIXA}>
        <span className="flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Lendo a grade de {diaMes(periodo.de)} a {diaMes(periodo.ate)}...
        </span>
        <span className="mt-1 block text-xs">São cerca de 19 mil sessões por mês; leva alguns segundos.</span>
      </div>
    )
  }

  if (erroResumo) {
    return (
      <div className={CAIXA}>
        <span className="font-medium text-destructive">{erroResumo}</span>
        <span className="mt-1 block text-xs">
          Nada foi calculado para {diaMes(periodo.de)} a {diaMes(periodo.ate)}. Abra o aviso no topo
          da página para ver o motivo e como resolver.
        </span>
      </div>
    )
  }

  return (
    <div className={CAIXA}>
      <span className="flex items-center justify-center gap-2">
        <Database size={14} aria-hidden />
        Nenhuma grade carregada.
      </span>
      <span className="mt-1 block text-xs">
        Escolha o mês no seletor do topo — a grade carrega na escolha.
      </span>
    </div>
  )
}
