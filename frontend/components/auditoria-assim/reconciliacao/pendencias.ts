import { AlertOctagon, Ban, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import type { TipoPendencia } from '../types'

/**
 * As quatro espécies de pendência — em UM lugar só.
 *
 * Vivia dentro de `ListaPendencias.tsx`, e o modal da semana tinha um segundo
 * conjunto de cinco números com outros nomes (liberadas, utilizadas, sem
 * vínculo, glosas, cancelamentos). O efeito era o defeito que este arquivo
 * existe para impedir: a atendente clicava numa linha que dizia "3 Faltando" e
 * abria uma tela onde a palavra "faltando" não aparecia em lugar nenhum — os
 * dois números moravam atrás de um botão de filtro fechado, como `+1` e `−3`
 * dentro de uma chip de TUSS.
 *
 * A ordem desta lista é a ordem dos badges da linha, a ordem dos chips e a
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
  /**
   * Rótulo por extenso — chips da listagem, badges da linha e indicadores do
   * modal, os três pela MESMA palavra.
   *
   * Havia um segundo rótulo curto (`coluna`: "Cancel.", "Sem vínculo") que
   * existia só porque o cabeçalho da tabela era estreito. A tabela saiu em
   * 2026-08-26 e ele saiu junto: duas palavras para a mesma espécie na mesma
   * tela é o começo do defeito que este arquivo existe para impedir.
   */
  rotulo: string
  Icone: LucideIcon
  /**
   * Badge da linha: tinta e fundo do mesmo matiz, `-50/-100` de fundo e
   * SEMPRE `-700` de texto.
   *
   * O `-700` não é escolha estética, é o único degrau que serve às duas
   * exigências ao mesmo tempo: é o que o DESIGN.md fixa para texto de 11–12px,
   * e é o degrau que o shim de tema escuro (`.dark .text-*-700` no fim de
   * `globals.css`) remapeia. Âmbar nasceu aqui em `-800` porque mede melhor no
   * claro (6,84:1 contra 4,65:1) — e `text-amber-800` não tem UMA regra no
   * shim, então no tema escuro os dois badges âmbar sairiam com tinta escura
   * sobre fundo escuro, sem erro nenhum que avisasse. Nenhum matiz sobe de
   * degrau aqui sem antes existir no shim.
   *
   * A borda é TRANSPARENTE, não ausente: a silhueta preenchida é o que separa a
   * espécie do total (a única pílula contornada da linha, ver a nota em
   * `ListaPendencias`), e sem 1px de borda aqui as duas teriam alturas
   * diferentes. Ela mora nesta string, e não na base do componente, porque
   * `border-transparent` e `border-slate-300` são utilitários de mesma
   * especificidade: quem ganha é a ordem no CSS gerado, não a ordem no
   * `className` — posto na base, o transparente vencia e o contorno do total
   * simplesmente não aparecia.
   */
  badge: string
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
    Icone: AlertOctagon,
    badge: 'border-transparent bg-violet-50 text-violet-700',
    ativo: 'border-violet-300 bg-violet-50 text-violet-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50',
    ajuda: 'Guias que a ASSIM recusou neste mês.',
  },
  {
    chave: 'cancelamento',
    rotulo: 'Cancelamentos',
    Icone: Ban,
    /*
      O único badge HACHURADO, e o único que não entra no total.

      As duas coisas são a mesma decisão, tomada em 2026-08-27 e reportada da
      tela: o cancelamento não pede trabalho — `autorizacaoCancelada` já diz que
      a autorização "saiu e foi desfeita, não consumiu cota e não pede nada" —,
      então somá-lo em `contagem.total` inflava a fila com linhas em que não há
      nada a fazer (ver `contarPendencias`).

      Ele continua contado e continua visível, porque o fato existe e a grade
      segue desenhando a guia cancelada. O que a hachura acrescenta é a leitura
      que o número sozinho não dava: este é um registro encerrado, não uma tarefa.
      Slate preservado — a hachura risca, não pinta (ver `.rachurado`).

      FORTE, e não a base (ajuste em tela): a mesma opacidade mede mais fraca em
      slate do que nos matizes mais saturados que a hachura também marca, porque
      o slate já parte de menos contraste contra o fundo quase branco. Ver
      `.rachurado-forte`.
    */
    badge: 'rachurado-forte border-transparent bg-slate-100 text-slate-700',
    ativo: 'border-slate-400 bg-slate-100 text-slate-800',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
    ajuda:
      'Autorizações que saíram e foram desfeitas (“Liberado *”). Não consumiram cota e não entram no total de pendências.',
  },
  {
    chave: 'autorizacao-a-mais',
    /**
     * Fusão de "Sem vínculo" + "Sobrando" (2026-08-26).
     *
     * As duas nomeavam o mesmo fato por caminhos diferentes — a guia que sobrou
     * do pareamento e a liberação acima da cota são, quase sempre, a MESMA
     * guia. Ver a nota em `TipoPendencia`.
     *
     * O rótulo diz o fato, não o caminho: "tem autorização a mais do que
     * sessão". Os dois caminhos continuam visíveis onde eles levam a ações
     * diferentes — na grade, o cartão distingue a guia que espera triagem
     * (`estado`) da que passou da cota (`excedente`).
     */
    rotulo: 'Autorização a mais',
    Icone: TrendingUp,
    badge: 'border-transparent bg-amber-50 text-amber-700',
    ativo: 'border-amber-300 bg-amber-50 text-amber-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50',
    ajuda:
      'Guias liberadas sem sessão que as justifique: as que sobraram do pareamento e esperam triagem, e as que passaram da cota do TUSS (a origem da glosa 1601). Conta guias distintas — a que é as duas coisas conta uma vez só.',
  },
  {
    chave: 'faltando',
    /**
     * "Não solicitada", não "Faltando" (renomeada em 2026-08-26).
     *
     * A palavra passou a ser a MESMA que a situação de prioridade 1 do
     * DESIGN.md — e o matiz já era o dela, rose. "Faltando" descrevia a conta
     * ("está faltando autorização"); "Não solicitada" descreve o fato que a
     * operação precisa reconhecer: ninguém pediu, e a sessão já passou.
     *
     * A `chave` continua `'faltando'` de propósito: ela é dado, atravessa
     * `TipoPendencia`, `ContagemPendencias` e o hook, e renomeá-la só para
     * casar com o rótulo trocaria uma migração de tipos por zero ganho ao
     * leitor. Rótulo é tela; chave é contrato.
     */
    rotulo: 'Não solicitada',
    Icone: TrendingDown,
    badge: 'border-transparent bg-rose-50 text-rose-700',
    ativo: 'border-rose-300 bg-rose-50 text-rose-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50',
    ajuda: 'Sessões decorridas há mais de 30 minutos sem liberação que as cubra. O que ainda vai acontecer, ou aconteceu há menos de 30 minutos, não conta.',
  },
]
