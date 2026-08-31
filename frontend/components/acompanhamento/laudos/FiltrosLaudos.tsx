"use client"

import { useState, type ReactNode } from "react"
import * as Popover from "@radix-ui/react-popover"
import {
  ArrowDownUp,
  CalendarClock,
  Check,
  ChevronDown,
  ClockAlert,
  FileClock,
  FileCheck2,
  FilterX,
  Layers,
  ListFilter,
  MailCheck,
  MailWarning,
} from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"
import {
  filtrosAlterados,
  RECORTE_LABEL,
  SITUACAO_PACIENTE_LABEL,
  TODAS_SITUACOES_PACIENTE,
  type FiltrosLaudos as Filtros,
  type OrdemLaudos,
  type RecorteLaudo,
} from "@/lib/laudos/filtros"
import type { SituacaoPaciente } from "@/types/laudosAcompanhamento"

// Os cards de KPI e a barra de filtros.
//
// `BarraFiltros` MOROU num painel próprio abaixo dos KPIs, no molde de
// `auditoria-assim?tab=auditoria` (controles de 44px, grade que quebra linha
// livremente). Passou para o CABEÇALHO — pedido do usuário (28/08/2026) — e o
// cabeçalho não tem essa liberdade: é uma faixa de 80px fixos (`layout.tsx`);
// quebrar linha ali cortaria a segunda. Por isso todo controle dela
// encolheu (ver o comentário de `BarraFiltros`, mais abaixo) — a lógica é a
// mesma, só a régua de tamanho mudou.
//
// E a decisão de desenho que vem de lá junto: **os cards de KPI SÃO o filtro de
// situação.** Clicar num card escreve o recorte, clicar de novo volta para
// "todos". Não existe um seletor de situação na barra fazendo a mesma coisa — o
// número que motiva o filtro está no card, então a segunda porta seria a que
// ninguém usa. Os números vêm de `contarKpis`, que aplica os MESMOS predicados
// de `filtrar`: o card de N sempre leva a N linhas.
//
// ─── Os controles são os do projeto, não os do navegador ────────────────────
//
// As datas usam o `DatePicker` de components/ui/date-picker — o MESMO calendário
// do campo "Autorizado em" do laudo, em /cadastros/pacientes/[id]. Antes eram
// `<input type="date">` nativos: cada navegador desenha o seu, o ícone e o
// espaçamento não batiam com o resto da tela, e o teclado exigia digitar a data
// no formato que o navegador quer. O calendário do projeto traz "Limpar" e
// "Hoje", que é o que essa barra mais usa.
//
// E os dois seletores (ordenação e situação do paciente) compartilham um único
// `Suspenso`: mesma moldura, mesma fonte, mesma marca de seleção, mesmo
// comportamento de abrir e fechar. Antes a ordenação era um `<select>` nativo ao
// lado de um menu desenhado à mão — duas caixas com a mesma função e aparências
// diferentes na mesma faixa.

type CardKpiInfo = {
  recorte: RecorteLaudo
  icone: typeof FileClock
  tom: string
  base: string
  ativo: string
}

/**
 * `base`/`ativo` são a moldura completa (borda + fundo) em repouso e quando
 * selecionado; `tom` é só o texto/ícone.
 *
 * DOIS GRUPOS, com desenho DIFERENTE de propósito — pedido do usuário
 * (28/08/2026): "são coisas mais distintas", e a tela até então tratava as
 * sete como uma fileira só, mesmo tamanho, mesma régua.
 *
 *   • VISÃO GERAL (`GRUPO_VISAO_GERAL`) — Todos, Vigentes, Vencidos. Somam
 *     TUDO daquele lado (avisado ou não): é o número que se lê de relance, sem
 *     precisar entender a tela. Por isso são MAIORES, sempre coloridos (nunca
 *     neutros em repouso) e vêm PRIMEIRO — a pergunta "como estamos?" antes de
 *     "o que fazer agora?".
 *   • DETALHAMENTO (`GRUPO_DETALHE`) — Avisados (Vigentes/Vencidos), Vence em
 *     breve, Vencidos sem aviso. Cruzam contato × validade:
 *     é o recorte de trabalho, o que a recepção realmente clica para filtrar a
 *     lista. Menores, neutros em repouso — a cor aparece só ao selecionar —,
 *     porque são o detalhe que se busca DEPOIS de olhar o resumo.
 *
 * A linha entre os dois grupos (`SeparadorGrupo`) é o que torna essa diferença
 * de PROPÓSITO visível como diferença de LUGAR na tela: sem ela, os cards
 * maiores e os menores ficariam soltos na mesma grade, e a diferença de
 * tamanho pareceria acidente de layout, não uma categoria.
 */
// Paleta PASTEL — troca pedida pelo usuário (28/08/2026): a versão anterior
// (bg-emerald-500/15 + borda grossa da mesma cor) lia como saturada demais para
// três cards que só resumem, sem pedir ação. Aqui o fundo é a tinta clara de
// sempre (a mesma família `-50`/`dark:-950` que o resto do projeto usa para
// "estado, não alarme"), a borda é fina e um tom mais clara que o texto, e o
// texto/ícone ficam no `-600`/`dark:-400` — legível sem gritar.
const GRUPO_VISAO_GERAL: CardKpiInfo[] = [
  {
    // Neutro: nem bom nem ruim, só a contagem total.
    recorte: "todos",
    icone: Layers,
    tom: "text-slate-600 dark:text-slate-300",
    base: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40",
    ativo: "border-slate-400 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 ring-1 ring-slate-400/30",
  },
  {
    recorte: "vigentes",
    icone: FileCheck2,
    tom: "text-emerald-600 dark:text-emerald-400",
    base: "border-emerald-100 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30",
    ativo: "border-emerald-400 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/40 ring-1 ring-emerald-400/30",
  },
  {
    // O tom mais forte do grupo: é o vencido AVISADO OU NÃO. Sua fila de
    // trabalho — `vencidos_sem_aviso`, no outro grupo — é o subconjunto
    // acionável dele, não um par no mesmo nível.
    recorte: "vencidos",
    icone: FileClock,
    tom: "text-rose-600 dark:text-rose-400",
    base: "border-rose-100 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30",
    ativo: "border-rose-400 bg-rose-100 dark:border-rose-700 dark:bg-rose-900/40 ring-1 ring-rose-400/30",
  },
]

const GRUPO_DETALHE: CardKpiInfo[] = [
  {
    recorte: "avisados_vigentes",
    icone: MailCheck,
    tom: "text-sky-600 dark:text-sky-400",
    base: "border-border bg-card",
    ativo: "border-sky-500 bg-sky-500/5",
  },
  {
    // Mesmo tom rosado de "Vencidos sem aviso" — o laudo CONTINUA vencido,
    // contato feito ou não — mas o ícone de "check" no lugar do de aviso marca
    // a diferença: aqui já não é a recepção que está devendo a ação.
    recorte: "avisados_vencidos",
    icone: MailCheck,
    tom: "text-rose-500 dark:text-rose-400",
    base: "border-border bg-card",
    ativo: "border-rose-400 bg-rose-500/5",
  },
  {
    // Vigente, SEM aviso e por pouco — o alerta ANTES de virar "Vencidos sem
    // aviso". Assim que a recepção avisa, o laudo sai daqui e só continua
    // contado em "Avisados — Vigentes" (decisão do usuário, 28/08/2026): as
    // duas linhas seriam a mesma pendência contada duas vezes. Âmbar porque é
    // alerta, não urgência: ainda há tempo.
    recorte: "proximo_vencimento",
    icone: ClockAlert,
    tom: "text-amber-600 dark:text-amber-400",
    base: "border-border bg-card",
    ativo: "border-amber-500 bg-amber-500/5",
  },
  {
    recorte: "vencidos_sem_aviso",
    icone: MailWarning,
    tom: "text-amber-600 dark:text-amber-400",
    base: "border-border bg-card",
    ativo: "border-amber-500 bg-amber-500/5",
  },
]

const ORDENS: { valor: OrdemLaudos; rotulo: string }[] = [
  { valor: "validade", rotulo: "Validade (mais antiga)" },
  { valor: "avisado_em", rotulo: "Avisado em" },
  { valor: "data_laudo", rotulo: "Data do laudo" },
  { valor: "nome", rotulo: "Nome" },
]

function CardKpi({
  card,
  grande,
  selecionado,
  valor,
  carregando,
  onClick,
}: {
  card: CardKpiInfo
  /** Visão geral: maior, mais peso. Detalhamento: compacto. */
  grande: boolean
  selecionado: boolean
  valor: number
  carregando: boolean
  onClick: () => void
}) {
  const Icone = card.icone

  // Os "grandes" (visão geral) mudaram de FORMATO, não só de cor — pedido do
  // usuário (28/08/2026) veio com "pode mudar formatação e tamanho se
  // necessário". Centralizado e mais arredondado (`rounded-2xl`, borda fina de
  // 1px) para ler como um "cartão-resumo" pastel, e não mais um chip de filtro
  // esticado — que é exatamente o que os quatro do Detalhamento continuam
  // sendo, com `rounded-xl`/`border-2` intactos, para a diferença de grupo se
  // sentir também na FORMA, não só no tamanho.
  if (grande) {
    return (
      <button
        type="button"
        aria-pressed={selecionado}
        onClick={onClick}
        className={`flex flex-col items-center gap-1 rounded-2xl border px-4 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          selecionado ? card.ativo : card.base
        }`}
      >
        <Icone className={`h-5 w-5 ${card.tom}`} aria-hidden="true" />
        <span className={`text-3xl font-bold leading-none ${card.tom}`}>
          {carregando ? "—" : valor}
        </span>
        <span className="text-sm font-semibold text-muted-foreground">
          {RECORTE_LABEL[card.recorte]}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={selecionado}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selecionado ? card.ativo : card.base
      }`}
    >
      <Icone className={`h-5 w-5 shrink-0 ${card.tom}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className={`block text-2xl font-bold leading-none ${card.tom}`}>
          {carregando ? "—" : valor}
        </span>
        <span className="mt-1 block truncate text-xs font-semibold text-muted-foreground">
          {RECORTE_LABEL[card.recorte]}
        </span>
      </span>
    </button>
  )
}

/** A linha entre os dois grupos — ver o comentário de `GRUPO_VISAO_GERAL`. */
function SeparadorGrupo({ rotulo }: { rotulo: string }) {
  return (
    <div className="flex items-center gap-3 px-0.5" role="separator" aria-label={rotulo}>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}

export function KpisLaudos({
  contagens,
  recorte,
  carregando,
  onRecorte,
}: {
  contagens: Record<RecorteLaudo, number>
  recorte: RecorteLaudo
  carregando: boolean
  onRecorte: (r: RecorteLaudo) => void
}) {
  // Clicar no card ativo volta para "todos" — mesma reversão do
  // auditoria-assim. Sem isso, tirar o filtro exigiria caçar o card "Todos", e
  // o usuário fica preso no recorte.
  function clicar(r: RecorteLaudo) {
    onRecorte(recorte === r && r !== "todos" ? "todos" : r)
  }

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Visão geral">
        {GRUPO_VISAO_GERAL.map((card) => (
          <CardKpi
            key={card.recorte}
            card={card}
            grande
            selecionado={recorte === card.recorte}
            valor={contagens[card.recorte]}
            carregando={carregando}
            onClick={() => clicar(card.recorte)}
          />
        ))}
      </section>

      <SeparadorGrupo rotulo="Detalhamento por contato e prazo" />

      <section
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        aria-label="Detalhamento por contato e prazo"
      >
        {GRUPO_DETALHE.map((card) => (
          <CardKpi
            key={card.recorte}
            card={card}
            grande={false}
            selecionado={recorte === card.recorte}
            valor={contagens[card.recorte]}
            carregando={carregando}
            onClick={() => clicar(card.recorte)}
          />
        ))}
      </section>
    </div>
  )
}

/**
 * A barra inteira — pedido do usuário (28/08/2026): morava como painel abaixo
 * dos KPIs, e passou para o CABEÇALHO, ao lado da busca. O cabeçalho é uma
 * faixa de ALTURA FIXA (80px, `layout.tsx`) sem margem para quebrar linha —
 * ao contrário do painel antigo, que podia crescer para baixo à vontade. Por
 * isso cada controle aqui é uma versão COMPACTA do que era: `h-9` em vez de
 * `h-11`, sem o rótulo por extenso ("Validade" vira só o ícone, com o nome
 * completo em `title`/`sr-only` para leitor de tela), e sem a palavra "até"
 * (virou um traço).
 *
 * A janela de "Avisado em" SAIU (pedido do usuário, 28/08/2026: "mantenha
 * somente Validade") — inclusive do modelo (`FiltrosLaudos.avisadoDe/avisadoAte`
 * não existem mais). Quem precisa saber se um laudo foi avisado usa os cards
 * "Avisados — Vigentes/Vencidos"; um recorte por DATA de aviso não sobrou
 * chamador. Ordenar por "Avisado em" continua existindo no `Suspenso` de
 * ordenação — é outra coisa, não um filtro de janela.
 *
 * `flex-nowrap` de propósito: em vez de embrulhar (que estouraria os 80px do
 * cabeçalho, cortando a segunda linha), o próprio contêiner some.
 */
export function BarraFiltros({
  filtros,
  onChange,
  onLimpar,
}: {
  filtros: Filtros
  onChange: (f: Filtros) => void
  onLimpar: () => void
}) {
  function set<K extends keyof Filtros>(chave: K, valor: Filtros[K]) {
    onChange({ ...filtros, [chave]: valor })
  }

  const ordemAtual = ORDENS.find((o) => o.valor === filtros.ordem)?.rotulo ?? ""
  const podeLimpar = filtrosAlterados(filtros)

  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-2">
      <JanelaData
        icone={CalendarClock}
        legenda="Validade"
        de={filtros.validadeDe}
        ate={filtros.validadeAte}
        onDe={(v) => set("validadeDe", v)}
        onAte={(v) => set("validadeAte", v)}
      />

      <Suspenso
        icone={ArrowDownUp}
        etiqueta="Ordenar"
        resumo={ordemAtual}
        larguraPainel="w-60"
      >
        {(fechar) =>
          ORDENS.map((o) => (
            <ItemSuspenso
              key={o.valor}
              rotulo={o.rotulo}
              marcado={filtros.ordem === o.valor}
              onClick={() => {
                set("ordem", o.valor)
                // Ordenação é escolha ÚNICA: escolher já responde a pergunta,
                // então o painel fecha. O de situação não fecha, porque lá o
                // usuário costuma marcar duas.
                fechar()
              }}
            />
          ))
        }
      </Suspenso>

      <Suspenso
        icone={ListFilter}
        etiqueta="Paciente"
        resumo={resumoSituacoes(filtros.situacoesPaciente)}
        larguraPainel="w-52"
      >
        {() =>
          TODAS_SITUACOES_PACIENTE.map((s) => (
            <ItemSuspenso
              key={s}
              rotulo={SITUACAO_PACIENTE_LABEL[s]}
              marcado={filtros.situacoesPaciente.has(s)}
              onClick={() => {
                const novo = new Set(filtros.situacoesPaciente)
                if (novo.has(s)) novo.delete(s)
                else novo.add(s)
                set("situacoesPaciente", novo)
              }}
            />
          ))
        }
      </Suspenso>

      {/* DESABILITADO quando não há nada a limpar, em vez de escondido: um
          botão que aparece e desaparece muda a largura de tudo que vem depois
          dele no cabeçalho. Aceso, ele também é o aviso de que ALGUM filtro
          está ativo — inclusive a busca, que fica mais à esquerda no mesmo
          cabeçalho, sem uma linha própria que a destaque. Texto encurtado para
          "Limpar" (era "Limpar filtros"): o contexto — está dentro da própria
          barra de filtros — já diz o quê. */}
      <button
        type="button"
        onClick={onLimpar}
        disabled={!podeLimpar}
        title={
          podeLimpar
            ? "Volta ao estado inicial: vencidos, ordenados por validade mais antiga, sem busca nem período"
            : "Nenhum filtro alterado"
        }
        className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:hover:bg-background"
      >
        <FilterX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        Limpar
      </button>
    </div>
  )
}

/**
 * Duas datas num controle só, com o calendário do projeto nas duas pontas.
 *
 * COMPACTO para caber no cabeçalho (ver o comentário de `BarraFiltros`): o
 * rótulo ("Validade") deixou de aparecer por extenso — vira `title` (tooltip no
 * mouse) e um `sr-only` (leitor de tela), e o ícone sozinho
 * carrega o resto do reconhecimento. "até" virou um traço. Cada campo de data
 * tem largura FIXA (`w-[92px]`, não `flex-1`): sem uma coluna de grade
 * abraçando-o, `flex-1` o deixaria crescer para preencher o cabeçalho inteiro.
 */
function JanelaData({
  icone: Icone,
  legenda,
  de,
  ate,
  onDe,
  onAte,
}: {
  icone: typeof CalendarClock
  legenda: string
  de: string
  ate: string
  onDe: (v: string) => void
  onAte: (v: string) => void
}) {
  return (
    <div
      className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2"
      title={legenda}
    >
      <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{legenda}</span>
      <DatePicker value={de} onChange={onDe} classeGatilho={`${GATILHO_DATA} w-[92px]`} />
      <span className="shrink-0 text-xs text-muted-foreground" aria-hidden="true">
        –
      </span>
      <DatePicker
        value={ate}
        onChange={onAte}
        align="right"
        classeGatilho={`${GATILHO_DATA} w-[92px]`}
      />
    </div>
  )
}

/**
 * A moldura compartilhada dos dois seletores da barra.
 *
 * `children` é função e recebe `fechar`: quem é escolha única (a ordenação)
 * fecha ao escolher; quem é complementar (a situação) fica aberto para o usuário
 * marcar o próximo.
 *
 * COMPACTO: sem o prefixo "Ordenar:"/"Paciente:" — só ícone + valor atual —,
 * `h-9` em vez de `h-11`. O nome do campo continua no `aria-label` do próprio
 * `role="listbox"` do painel, e no `title` do gatilho.
 */
function Suspenso({
  icone: Icone,
  etiqueta,
  resumo,
  larguraPainel,
  children,
}: {
  icone: typeof ListFilter
  etiqueta: string
  resumo: string
  larguraPainel: string
  children: (fechar: () => void) => ReactNode
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={etiqueta}
          className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-background px-2.5 text-left text-xs font-semibold text-foreground outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-40 truncate">{resumo}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className={`z-[100] ${larguraPainel} overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`}
        >
          <div role="listbox" aria-label={etiqueta}>
            {children(() => setAberto(false))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ItemSuspenso({
  rotulo,
  marcado,
  onClick,
}: {
  rotulo: string
  marcado: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={marcado}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {rotulo}
      {marcado && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  )
}

/**
 * Ativo / Inativo / Sem cadastro / Fictício — COMPLEMENTARES: marcar mais de um
 * SOMA ao resultado. Mesmo comportamento e mesmo resumo no rótulo do botão que o
 * `FiltroSituacao` de /cadastros/pacientes.
 */
function resumoSituacoes(value: Set<SituacaoPaciente>): string {
  if (value.size === 0) return "Nenhuma"
  if (value.size === TODAS_SITUACOES_PACIENTE.length) return "Todas"
  return TODAS_SITUACOES_PACIENTE.filter((s) => value.has(s))
    .map((s) => SITUACAO_PACIENTE_LABEL[s])
    .join(", ")
}

/**
 * O gatilho do DatePicker dentro da barra: sem moldura própria (a pílula em
 * volta já é a moldura), sem `mt-1` (que criaria um degrau na faixa compacta) e
 * com `tabular-nums`, para "01/01/2027" e "28/08/2026" ocuparem a mesma largura
 * e os dois campos não dançarem ao trocar de data.
 *
 * SEM `w-full` de propósito: quem chama (`JanelaData`) acrescenta a largura
 * FIXA (`w-[92px]`) por fora — as duas classes de largura, se estivessem as
 * duas aqui dentro, competiriam por especificidade igual e o vencedor
 * dependeria da ordem de geração do Tailwind, não da intenção.
 *
 * `text-xs` (12px), não `text-sm` (14px): é a mudança que faz "28/08/2026"
 * caber em 74px sem cortar. `px-0.5` no lugar do `px-1` original — o mesmo
 * motivo, um degrau abaixo.
 */
const GATILHO_DATA =
  "flex items-center justify-between gap-1 rounded-md px-0.5 py-0.5 text-xs tabular-nums text-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
