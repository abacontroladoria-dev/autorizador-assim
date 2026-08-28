/**
 * De onde veio a guia: o Pulsar a capturou, ou ela foi tirada direto no site da ASSIM?
 *
 * O de-para mora aqui, num lugar só, porque três telas fazem a mesma pergunta — o modal
 * de detalhamento da Conferência, a gaveta da aba Reconciliação e a Ficha Operacional de
 * central-pacientes. Duas cópias divergiriam, e num campo cuja função é justamente
 * desfazer uma ambiguidade isso seria pior que não ter campo.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ──────────────────────────────────────────────────
 * Em 25/08/2026 a atendente começou a solicitar pelo Pulsar, o RPA deu erro, ela fechou a
 * janela e foi tirar a guia à mão no portal. O nome dela já estava na linha, então o
 * detalhamento dizia "Solicitado por: <nome>" para uma guia que o Pulsar nunca capturou.
 *
 * `criado_por` responde QUEM ABRIU A SOLICITAÇÃO — nunca respondeu quem conseguiu a guia.
 * `numero_autorizacao_origem` (migration 20260825000000) responde a segunda pergunta, e é
 * ela que estas funções traduzem.
 *
 * ── A COR: INDIGO, E POR QUE ELE ────────────────────────────────────────────────
 * "Direto na ASSIM" recebe destaque a pedido do usuário (25/08/2026). A escolha do
 * matiz seguiu a disciplina que SituacaoBadge.tsx documenta — um matiz, um significado:
 *
 * - A régua de severidade da auditoria está inteira ocupada: rose é a família da ação
 *   "vá buscar autorização", violeta é glosa e só, âmbar é "esperando alguém",
 *   esmeralda é resolvido, e stone é das faltas.
 * - Procedência é OUTRO EIXO, não severidade. O precedente já existe no mesmo arquivo:
 *   "as faltas não disputam a régua de autorização... então vive em stone (fora da
 *   escala)". Indigo entra pela mesma porta.
 * - Não é `blue`, que neste app é cor de ação (botão "Reverter falta" do SidePanel,
 *   badge de sessão do /solicitar). Um chip azul seria lido como clicável.
 * - Indigo não aparece nem em `auditoria-assim` nem em `central`.
 * - Contraste medido de indigo-700 sobre indigo-50: **7,07:1** — mesma faixa do violeta
 *   (7,5:1) que SituacaoBadge já mede, e bem acima do mínimo AA de 4,5:1.
 * - Degraus -50/-200/-700 de propósito: são os que o shim de tema escuro remapeia.
 *   `-400`/`-800` e modificador de opacidade vazariam claro para o escuro, calados.
 *
 * `'Pelo Pulsar'` fica em texto simples, SEM chip. Isso não é economia: se os dois
 * lados tivessem cor, nenhum se destacaria — o contraste entre chip e texto puro é o
 * que faz "Direto na ASSIM" saltar. E o rótulo em texto continua existindo nos dois
 * casos, então a cor nunca é o único sinal (regra do SituacaoBadge).
 */

/** Vocabulário de `fila_autorizacoes.numero_autorizacao_origem`. */
export type GuiaOrigem = 'robo' | 'relatorio' | 'reconciliacao' | null

export type OrigemGuiaRotulo = {
  /** Curto, para a célula de ficha. */
  texto: string
  /** Frase inteira, para `title` — explica por que o "Solicitado por" ao lado não é o autor. */
  detalhe: string
  /**
   * `true` quando o Pulsar NÃO capturou a guia. É o único bit que as telas precisam para
   * decidir se trocam o rótulo de `criado_por`, e evita que cada uma reimplemente a
   * comparação com os literais.
   */
  foraDoPulsar: boolean
  /**
   * Classes do chip, prontas para um `<span>`. Vem daqui, e não de cada tela, porque as
   * três superfícies têm componentes de linha diferentes (`Fact`, `Row`, `Campo`) e um
   * chip autocontido é o que atravessa os três sem precisar de um estado novo em cada
   * sistema de cor. String vazia = renderizar como texto comum.
   */
  chip: string
}

/**
 * O chip de destaque. Indigo -50/-200/-700 — ver a nota de cor no topo do arquivo.
 *
 * `border`, e NÃO `ring`, e isto foi verificado no shim: `app/globals.css` remapeia
 * `bg-indigo-50` (:622), `text-indigo-700` (:707) e `border-indigo-200` (:671) para o
 * tema escuro, mas os `ring-*` coloridos que ele cobre são só blue/green/red/yellow/
 * orange/violet/gray, todos no degrau -300. Um `ring-indigo-200` não seria remapeado e
 * ficaria brilhando claro sobre fundo escuro — o vazamento silencioso de sempre. O
 * custo é 1px de borda, irrelevante num chip `inline-flex`.
 */
const CHIP_FORA =
  'inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 ' +
  'px-1.5 py-0.5 text-xs font-semibold text-indigo-700'

const ROTULOS: Record<Exclude<GuiaOrigem, null>, OrigemGuiaRotulo> = {
  robo: {
    texto: 'Pelo Pulsar',
    detalhe:
      'O robô do Pulsar leu esta guia no recibo da ASSIM, na tela, no momento da autorização.',
    foraDoPulsar: false,
    chip: '',
  },
  relatorio: {
    texto: 'Direto na ASSIM',
    detalhe:
      'A guia veio do extrato da ASSIM: o Pulsar não a capturou, então ela foi tirada direto no portal. ' +
      'Quem aparece em "Solicitação aberta por" apenas abriu a solicitação — não é quem conseguiu a autorização.',
    foraDoPulsar: true,
    chip: CHIP_FORA,
  },
  reconciliacao: {
    texto: 'Direto na ASSIM',
    detalhe:
      'A guia foi encontrada no extrato da ASSIM por reconciliação manual, depois do atendimento. ' +
      'O Pulsar não a capturou — ela foi tirada direto no portal.',
    foraDoPulsar: true,
    chip: CHIP_FORA,
  },
}

/**
 * O rótulo de procedência, ou `null` quando não há o que dizer.
 *
 * Devolve `null` — e a tela não renderiza nada — em três casos, todos deliberados:
 *
 * 1. Não há guia. Sem número não existe procedência. Inclui a string literal `'N/A'`,
 *    que as linhas de PRESENÇA gravam (paciente de outro convênio, sem fluxo de
 *    autorização): ali não houve autorização ASSIM nenhuma para ter origem.
 * 2. `origem` é nula — linha anterior a 25/08/2026, quando a coluna passou a ser
 *    escrita. O histórico não tem esse registro e a tela cala em vez de adivinhar.
 * 3. `origem` traz um valor que este de-para não conhece. Um `ELSE` que chutasse o
 *    rótulo mais provável transformaria vocabulário novo em dado errado, calado — é a
 *    mesma regra do de-para de `biofacial` (migration 20260821080000).
 */
export function rotuloOrigemGuia(
  origem: string | null | undefined,
  numeroAutorizacao: string | null | undefined,
): OrigemGuiaRotulo | null {
  const guia = numeroAutorizacao?.trim()
  if (!guia || guia === 'N/A') return null
  if (!origem) return null
  return ROTULOS[origem as Exclude<GuiaOrigem, null>] ?? null
}

/**
 * O rótulo do campo de `criado_por`, ajustado à procedência.
 *
 * Quando a guia veio de fora, "Solicitado por" é lido como autoria da autorização — foi
 * assim que o incidente de 25/08 aconteceu. "Solicitação aberta por" diz exatamente o que
 * o dado é, e não depende de o leitor notar o outro campo.
 *
 * Sem procedência conhecida o rótulo antigo é mantido: trocá-lo em toda linha do
 * histórico sugeriria que a distinção foi apurada quando não foi.
 */
export function rotuloSolicitadoPor(
  origem: string | null | undefined,
  numeroAutorizacao: string | null | undefined,
): string {
  return rotuloOrigemGuia(origem, numeroAutorizacao)?.foraDoPulsar
    ? 'Solicitação aberta por'
    : 'Solicitado por'
}
