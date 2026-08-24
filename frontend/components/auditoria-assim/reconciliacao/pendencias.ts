import { AlertOctagon, Ban, Link2, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import type { TipoPendencia } from '../types'

/**
 * As cinco espécies de pendência — em UM lugar só.
 *
 * Vivia dentro de `ListaPendencias.tsx`, e o modal da semana tinha um segundo
 * conjunto de cinco números com outros nomes (liberadas, utilizadas, sem
 * vínculo, glosas, cancelamentos). O efeito era o defeito que este arquivo
 * existe para impedir: a atendente clicava numa linha que dizia "Faltando 3" e
 * abria uma tela onde a palavra "faltando" não aparecia em lugar nenhum — os
 * dois números moravam atrás de um botão de filtro fechado, como `+1` e `−3`
 * dentro de uma chip de TUSS.
 *
 * A ordem desta lista é a ordem das colunas da listagem, a ordem dos chips e a
 * ordem dos indicadores do modal. Divergirem faria o número que a pessoa clicou
 * não ser o número que ela lê na linha.
 *
 * Os matizes são os já falados nesta superfície (DESIGN.md, Status Lock Rule):
 * violeta é glosa, cinza é o que acabou sem efeito, âmbar espera alguém olhar,
 * rose é a lacuna mais larga — nada cobriu uma sessão que já aconteceu. Nenhum
 * matiz novo, e nenhum deles decora: cada chip filtra exatamente o estado que
 * nomeia, que é o que a Decoration-Free Semantics Rule permite.
 *
 * Seleção NUNCA usa matiz semântico — é anel de steel, como nas chips de TUSS.
 * Âmbar significaria "esperando alguém" numa chip e "filtro ativo" na de baixo.
 */
export type EspeciePendencia = {
  chave: TipoPendencia
  /** Rótulo por extenso: chips da listagem e indicadores do modal. */
  rotulo: string
  /** Rótulo curto: cabeçalho de coluna da tabela, onde a largura é escassa. */
  coluna: string
  Icone: LucideIcon
  /** Tinta do número na coluna da tabela. */
  tinta: string
  /** Perímetro + fundo + texto quando há trabalho desta espécie. */
  tom: string
  /** Fundo da bolha do ícone no indicador do modal. */
  bolha: string
  /** Chip selecionada na listagem (a listagem não usa anel; o modal usa). */
  ativo: string
  /** Chip em repouso. */
  inativo: string
  ajuda: string
}

export const PENDENCIAS: EspeciePendencia[] = [
  {
    chave: 'glosa',
    rotulo: 'Glosas',
    coluna: 'Glosas',
    Icone: AlertOctagon,
    tinta: 'text-violet-700',
    tom: 'border-violet-200 bg-violet-50 text-violet-700',
    bolha: 'bg-violet-100',
    ativo: 'border-violet-300 bg-violet-50 text-violet-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50',
    ajuda: 'Guias que a ASSIM recusou neste mês.',
  },
  {
    chave: 'cancelamento',
    rotulo: 'Cancelamentos',
    coluna: 'Cancel.',
    Icone: Ban,
    tinta: 'text-slate-700',
    tom: 'border-slate-300 bg-slate-100 text-slate-600',
    bolha: 'bg-slate-200',
    ativo: 'border-slate-400 bg-slate-100 text-slate-800',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
    ajuda: 'Autorizações que saíram e foram desfeitas (“Liberado *”). Não consumiram cota.',
  },
  {
    chave: 'sem-vinculo',
    rotulo: 'Sem vínculo',
    coluna: 'Sem vínculo',
    Icone: Link2,
    tinta: 'text-amber-700',
    tom: 'border-amber-300 bg-amber-50 text-amber-700',
    bolha: 'bg-amber-100',
    ativo: 'border-amber-300 bg-amber-50 text-amber-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50',
    ajuda: 'Guias liberadas que sobraram do pareamento e esperam alguém dizer que sessão elas cobrem.',
  },
  {
    chave: 'faltando',
    rotulo: 'Faltando',
    coluna: 'Faltando',
    Icone: TrendingDown,
    tinta: 'text-rose-700',
    tom: 'border-rose-200 bg-rose-50 text-rose-700',
    bolha: 'bg-rose-100',
    ativo: 'border-rose-300 bg-rose-50 text-rose-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50',
    ajuda: 'Sessões decorridas há mais de 30 minutos sem liberação que as cubra. O que ainda vai acontecer, ou aconteceu há menos de 30 minutos, não conta.',
  },
  {
    chave: 'sobrando',
    rotulo: 'Sobrando',
    coluna: 'Sobrando',
    Icone: TrendingUp,
    tinta: 'text-amber-700',
    tom: 'border-amber-300 bg-amber-50 text-amber-700',
    bolha: 'bg-amber-100',
    ativo: 'border-amber-300 bg-amber-50 text-amber-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50',
    ajuda: 'Liberações a mais do que sessões agendadas naquele TUSS — é o que provoca a glosa 1601.',
  },
]
