'use client'

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useModalDialog } from '@/hooks/useModalDialog'
import {
  AlertTriangle,
  CalendarSearch,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  KeySquare,
  RefreshCw,
  Search,
  UserSearch,
  X,
} from 'lucide-react'
import { autorizacaoLiberada, diasUteisDe, useAnaliseReincidencia } from '@/hooks/useAnaliseReincidencia'
import { useGlosaCodigos } from '@/hooks/useGlosaCodigos'
import { completarMotivoGlosa, lerMotivoGlosa } from '@/lib/glosa'
import SituacaoBadge from './SituacaoBadge'
import type { AlvoAnalise, AuditoriaAssimItem, AutorizacaoAssimSemana, PlacarTuss } from './types'

type Props = {
  alvo: AlvoAnalise | null
  onClose: () => void
}

const ID_TITULO = 'titulo-analise-reincidencia'

const DIA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** "2026-08-17" → "17/08". Fatia de string: nada de `new Date`, nada de fuso. */
function formatarDia(iso: string | null): string {
  if (!iso) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** "Seg 17/08" — o rótulo de grupo das duas colunas. */
function formatarDiaComNome(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, (mes ?? 1) - 1, dia ?? 1)
  return `${DIA_CURTO[d.getDay()]} ${formatarDia(iso)}`
}

/**
 * A hora de um `timestamp without time zone` que guarda hora de São Paulo.
 *
 * Cortada da string de propósito. `new Date(...)` sobre o valor sem sufixo de
 * fuso é justamente o caminho que fez "Autorizado em" e "Executado em"
 * discordarem em 3h antes da migration 20260820130000.
 */
function horaDoTimestamp(valor: string | null): string {
  if (!valor || valor.length < 16) return '—'
  return valor.slice(11, 16)
}

function diaDoTimestamp(valor: string | null): string | null {
  if (!valor || valor.length < 10) return null
  return valor.slice(0, 10)
}

/** Sem acento e sem caixa: "joao" acha "João". */
function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Nada a assinar: o "estou no cliente?" nunca muda depois da hidratação. */
const subscreverNada = () => () => {}

/** Só para o primeiro render, quando `alvo` ainda é nulo. */
function hojeLocal(): string {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca de paciente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combobox de paciente, próprio desta tela.
 *
 * Não reusa `cronograma/ui/SearchCombobox`: aquele veste os tokens da superfície
 * do cronograma (`bg-card`, `text-foreground`) e, mais grave, pinta a borda de
 * rose sempre que o valor não está na lista — inclusive vazio. Abriria o modal
 * com um campo em estado de erro antes de a pessoa digitar qualquer coisa.
 *
 * A lista oferece só quem tem sessão ASSIM na semana, com a contagem ao lado:
 * é o universo em que a cota faz sentido, e a contagem já adianta o tamanho do
 * cronograma que vai abrir.
 */
function SeletorPaciente({
  pacientes,
  valor,
  onEscolher,
}: {
  pacientes: { nome: string; sessoesNaSemana: number }[]
  valor: string | null
  onEscolher: (nome: string | null) => void
}) {
  const idListbox = useId()
  const [texto, setTexto] = useState(valor ?? '')
  const [aberto, setAberto] = useState(false)
  const [ativoIdx, setAtivoIdx] = useState(-1)
  const listaRef = useRef<HTMLDivElement>(null)

  // Quando o modal reabre já resolvido (pela linha em glosa), o campo acompanha.
  const [ultimoValor, setUltimoValor] = useState(valor)
  if (valor !== ultimoValor) {
    setUltimoValor(valor)
    setTexto(valor ?? '')
  }

  const filtrados = useMemo(() => {
    const termo = normalizar(texto.trim())
    if (!termo) return pacientes
    return pacientes.filter((p) => normalizar(p.nome).includes(termo))
  }, [pacientes, texto])

  function escolher(nome: string) {
    onEscolher(nome)
    setTexto(nome)
    setUltimoValor(nome)
    setAberto(false)
    setAtivoIdx(-1)
  }

  return (
    <div className="relative w-full sm:w-80">
      <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
      <input
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idListbox}
        aria-autocomplete="list"
        aria-label="Buscar paciente da semana"
        autoComplete="off"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setAberto(true)
          setAtivoIdx(-1)
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => window.setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          // Escape NÃO é tratado aqui de propósito. `useModalDialog` escuta em
          // captura no `document`, então ele roda antes de qualquer handler do
          // React e fecha o modal — tentar "fechar só a lista" daria a impressão
          // de funcionar e não funcionaria. Escape fecha o modal, como em toda
          // esta tela; a lista fecha ao escolher ou ao sair do campo.
          if (!aberto || filtrados.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            const proximo = Math.min(ativoIdx + 1, filtrados.length - 1)
            setAtivoIdx(proximo)
            listaRef.current?.children[proximo]?.scrollIntoView({ block: 'nearest' })
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            const anterior = Math.max(ativoIdx - 1, 0)
            setAtivoIdx(anterior)
            listaRef.current?.children[anterior]?.scrollIntoView({ block: 'nearest' })
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const idx = ativoIdx >= 0 ? ativoIdx : filtrados.length === 1 ? 0 : -1
            if (idx >= 0) escolher(filtrados[idx].nome)
          }
        }}
        placeholder="Buscar paciente"
        className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-11 pl-9 text-sm text-slate-700 placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
      />
      {texto && (
        <button
          type="button"
          onClick={() => {
            setTexto('')
            onEscolher(null)
            setAtivoIdx(-1)
          }}
          aria-label="Limpar paciente"
          className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <X size={13} />
        </button>
      )}
      {aberto && filtrados.length > 0 && (
        <div
          ref={listaRef}
          id={idListbox}
          role="listbox"
          aria-label="Pacientes com sessão ASSIM nesta semana"
          className="absolute top-[calc(100%+4px)] left-0 z-10 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {filtrados.map((p, i) => (
            <button
              key={p.nome}
              type="button"
              role="option"
              aria-selected={p.nome === valor}
              onMouseDown={(e) => {
                e.preventDefault()
                escolher(p.nome)
              }}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                i === ativoIdx
                  ? 'bg-brand-hover text-brand-fg'
                  : p.nome === valor
                    ? 'bg-slate-100 font-semibold text-slate-800'
                    : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="truncate">{p.nome}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{p.sessoesNaSemana} sess.</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Placar por TUSS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uma chip do placar — e, ao mesmo tempo, o filtro daquele TUSS.
 *
 * Duas informações moram no mesmo controle, e cada uma tem seu canal:
 *
 * - o MATIZ é o estado da cota (âmbar divergente, esmeralda a conta bate). Como
 *   a chip filtra exatamente aquele estado, o matiz não decora — é o estado.
 * - o ANEL DE STEEL é a seleção. Sinal de "você está aqui" usa a marca, nunca um
 *   matiz semântico; do contrário âmbar significaria "estourou a cota" numa chip
 *   e "filtro ativo" na de baixo.
 *
 * Sem preenchimento sólido: branco sobre âmbar-500 mede 2,15:1.
 */
const ChipTuss = memo(function ChipTuss({
  item,
  ativa,
  onToggle,
}: {
  item: PlacarTuss
  ativa: boolean
  onToggle: (codigo: string | null) => void
}) {
  const estourou = item.excedente > 0
  const tom = estourou
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <button
      type="button"
      onClick={() => onToggle(ativa ? null : item.codigo_tuss)}
      aria-pressed={ativa}
      className={`flex h-11 shrink-0 items-center gap-2.5 rounded-lg border px-3 text-left transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${tom} ${
        ativa ? 'ring-2 ring-brand ring-offset-1' : ''
      }`}
      title={item.terapias || undefined}
    >
      <span className="font-mono text-xs font-semibold tabular-nums">{item.codigo_tuss}</span>
      <span className="max-w-32 truncate text-xs font-medium">{item.terapias || 'sem terapia'}</span>
      <span className="text-xs whitespace-nowrap tabular-nums">
        {item.agendadas} agend. · {item.liberadas} lib.
      </span>
      {estourou && (
        <span className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
          +{item.excedente}
        </span>
      )}
    </button>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Linhas
// ─────────────────────────────────────────────────────────────────────────────

const LinhaSessao = memo(function LinhaSessao({ item }: { item: AuditoriaAssimItem }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:gap-3 lg:py-2">
      {/* `lg:contents` dissolve os agrupadores no desktop, então a linha larga é
          a mesma; no celular eles viram as faixas do card empilhado. */}
      <div className="flex items-baseline gap-3 lg:contents">
        <span className="shrink-0 text-sm font-semibold text-slate-700 tabular-nums lg:w-14">
          {item.hora_inicial?.slice(0, 5) ?? '—'}
        </span>
        <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums lg:w-20">
          {item.codigo_tuss ?? '—'}
        </span>
      </div>

      <div className="min-w-0 lg:flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{item.terapias ?? '—'}</p>
        {/* Linha de falta não traz profissional — a RPC de faltas devolve o
            motivo, e é ele que explica por que a sessão não conta como cota. */}
        <p className="truncate text-xs text-slate-500">
          {item.profissionais ?? item.observacao ?? '—'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 lg:contents">
        <div className="lg:w-44 lg:shrink-0">
          <SituacaoBadge situacao={item.situacao} />
        </div>
        <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums lg:w-24 lg:text-right">
          {item.guia ?? '—'}
        </span>
      </div>
    </li>
  )
})

const LinhaAutorizacao = memo(function LinhaAutorizacao({
  item,
  orfa,
  codigosGlosa,
}: {
  item: AutorizacaoAssimSemana
  orfa: boolean
  codigosGlosa: Map<string, string>
}) {
  const liberada = autorizacaoLiberada(item.status)
  // O mesmo parser que a Central e a auditoria usam. Numa recusa, o `status`
  // desta tabela vem no formato "1601-REINCIDENCIA NO ATEN" — código, hífen,
  // texto cortado em 25 caracteres —, e o de-para completa o que a ASSIM cortou.
  // `descricao_erro` vem antes porque, quando existe, é o texto que o próprio
  // relatório trouxe; na prática ele é nulo em 100% das linhas de produção.
  const motivo = liberada
    ? null
    : (item.descricao_erro ??
      completarMotivoGlosa(lerMotivoGlosa(item.status), codigosGlosa)?.descricao ??
      null)
  // O estado da linha vive no perímetro inteiro — nunca num trilho lateral, que
  // o DESIGN.md proíbe. A órfã é a que precisa ser vista: ela se destaca, a
  // pareada recua para o branco.
  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:gap-3 lg:py-2 ${
        orfa ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-baseline gap-3 lg:contents">
        <span className="shrink-0 text-sm font-semibold text-slate-700 tabular-nums lg:w-14">
          {horaDoTimestamp(item.data_execucao)}
        </span>
        <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums lg:w-20">
          {item.codigo_tuss ?? '—'}
        </span>
      </div>

      <span className="shrink-0 font-mono text-sm font-medium text-slate-700 tabular-nums lg:w-24">
        {item.guia}
      </span>

      <div className="min-w-0 lg:flex-1">
        {/* Rótulo curto na primeira linha, motivo por extenso na segunda. O
            `status` cru da ASSIM numa recusa É o motivo, e truncado
            ("1601-REINCIDENCIA NO ATEN") ele diria o mesmo que a linha de baixo,
            pela metade — o mesmo fato duas vezes, uma delas cortada. */}
        <p className={`truncate text-sm font-medium ${liberada ? 'text-emerald-700' : 'text-violet-700'}`}>
          {liberada ? (item.status ?? 'Liberado') : 'Recusada'}
        </p>
        {!liberada && (
          <p className="truncate text-xs text-slate-500" title={motivo ?? undefined}>
            {motivo ?? 'motivo não informado'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 lg:shrink-0 lg:justify-end">
        {item.teve_token && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            <KeySquare size={11} />
            {item.token ?? 'filipeta'}
          </span>
        )}
        {/* Rótulo em texto, sempre: a cor da borda nunca é o único sinal.
            "nesta semana" vive no title e no aria-live, não no pill — a
            qualificação importa (a órfã pode estar pareada a uma sessão da
            semana vizinha, e afirmar mais que isso seria inventar), mas escrita
            aqui ela roubava a largura do motivo da recusa, que é justamente o
            que se lê nesta coluna. O contexto já a dá: o modal é semanal e a
            coluna se chama "Autorizações na semana". */}
        {orfa && (
          <span
            title="Sem sessão agendada nesta semana — pode estar pareada a uma sessão de outra semana."
            className="shrink-0 rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
          >
            sem sessão
          </span>
        )}
      </div>
    </li>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Colunas
// ─────────────────────────────────────────────────────────────────────────────

function TituloColuna({ children, contagem }: { children: ReactNode; contagem: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 backdrop-blur">
      <h3 className="text-[13px] font-semibold text-brand-fg">{children}</h3>
      <span className="text-xs tabular-nums text-slate-500">{contagem}</span>
    </div>
  )
}

function RotuloDia({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
      {children}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Análise de Reincidência — a cota semanal de um paciente por TUSS.
 *
 * Por que este modal existe: a glosa 1601 diz que a autorização passou da cota
 * da semana, e a tela de auditoria é diária. Pior, ela é dirigida pela sessão —
 * a autorização EXCEDENTE não casa com sessão nenhuma e não aparece em lugar
 * nenhum do sistema. Aqui ela aparece: coluna da direita, perímetro âmbar.
 *
 * O formato é o do modal horizontal da Conferência de Filipetas: contêiner largo
 * e alto, faixas de chrome empilhadas, uma linha por registro. A tarefa é a
 * mesma — bater duas pilhas item a item.
 */
export default function ModalAnaliseReincidencia({ alvo, onClose }: Props) {
  // O portal precisa de `document`, que não existe no render do servidor.
  //
  // `useSyncExternalStore` com snapshot de servidor `false` e de cliente `true`
  // é o jeito sancionado de perguntar "já estou no cliente?" — as duas
  // alternativas óbvias falham: `useEffect(() => setMontado(true), [])` chama
  // setState no corpo do efeito (render em cascata, barrado pelo lint) e
  // `typeof document !== 'undefined'` cru é um ramo servidor/cliente que o React
  // acusa como divergência de hidratação. Medido: montar este modal já aberto
  // estourava no `createPortal` do SSR pelo primeiro caminho e gritava
  // "Hydration failed" pelo segundo.
  const noCliente = useSyncExternalStore(subscreverNada, () => true, () => false)
  const aberto = alvo !== null && noCliente

  // `useCallback` porque o hook do diálogo depende da identidade de `aoFechar`
  // para não remontar o focus trap a cada render.
  const fechar = useCallback(() => onClose(), [onClose])
  const { refDialogo, propsDialogo } = useModalDialog(aberto, fechar, ID_TITULO)

  const analise = useAnaliseReincidencia(aberto, alvo?.data ?? hojeLocal(), alvo?.pacienteNome ?? null)
  const { reabrirEm } = analise
  const codigosGlosa = useGlosaCodigos()

  // Reabrir com outro alvo reposiciona semana, paciente e carteirinha. Sem isto,
  // abrir pela linha de glosa depois de ter usado a busca livre mostraria a
  // semana antiga — o erro mais fácil de não notar nesta tela.
  useEffect(() => {
    if (alvo) reabrirEm(alvo.data, alvo.pacienteNome, alvo.carteirinha)
  }, [alvo, reabrirEm])

  const dias = useMemo(() => diasUteisDe(analise.semanaInicio), [analise.semanaInicio])

  const sessoesPorDia = useMemo(() => {
    const mapa = new Map<string, AuditoriaAssimItem[]>()
    for (const s of analise.sessoesVisiveis) {
      const dia = s.data_atendimento ?? '—'
      const atual = mapa.get(dia)
      if (atual) atual.push(s)
      else mapa.set(dia, [s])
    }
    return mapa
  }, [analise.sessoesVisiveis])

  const autorizacoesPorDia = useMemo(() => {
    const mapa = new Map<string, AutorizacaoAssimSemana[]>()
    for (const a of analise.autorizacoesVisiveis) {
      const dia = diaDoTimestamp(a.data_execucao) ?? '—'
      const atual = mapa.get(dia)
      if (atual) atual.push(a)
      else mapa.set(dia, [a])
    }
    return mapa
  }, [analise.autorizacoesVisiveis])

  if (!aberto) return null

  const labelSemana = `${formatarDia(analise.semanaInicio)} a ${formatarDia(analise.semanaFim)}`
  const semPaciente = !analise.pacienteNome
  const totalSessoes = analise.sessoesVisiveis.length
  const totalAutorizacoes = analise.autorizacoesVisiveis.length
  const orfasVisiveis = analise.autorizacoesVisiveis.filter((a) => analise.orfas.has(a.guia)).length

  // Portal para document.body: o card de filtros que dispara este modal tem
  // `backdrop-blur`, e backdrop-filter cria containing block para descendentes
  // `fixed` — sem o portal o inset-0 se ancora na barra de filtros e o modal
  // colapsa.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        ref={refDialogo}
        {...propsDialogo}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 flex h-[94dvh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* O PRODUCT.md pede carregamento, erro e contagem por aria-live: as duas
            colunas mudam em silêncio quando se troca de semana ou de TUSS. */}
        <p className="sr-only" role="status" aria-live="polite">
          {analise.loading
            ? 'Carregando a semana.'
            : analise.erro
              ? analise.erro
              : semPaciente
                ? `${analise.pacientesDaSemana.length} paciente(s) com sessão ASSIM em ${labelSemana}. Escolha um para comparar.`
                : `${analise.pacienteNome}, semana de ${labelSemana}. ${totalSessoes} linha(s) no cronograma, ${totalAutorizacoes} autorização(ões), ${orfasVisiveis} sem sessão nesta semana. ${
                    analise.totalExcedente > 0
                      ? `${analise.totalExcedente} autorização(ões) além do agendado.`
                      : 'Nenhum excedente.'
                  }`}
        </p>

        {/* Cabeçalho */}
        <div className="flex items-start justify-between px-4 pt-5 pb-4 sm:px-8 sm:pt-6 sm:pb-5">
          <div className="min-w-0">
            <h2 id={ID_TITULO} className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarSearch size={19} className="text-brand" />
              Análise de reincidência
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Cota semanal por TUSS: o que estava agendado × o que a ASSIM autorizou.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Paciente + semana */}
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-8 sm:py-4">
          <SeletorPaciente
            pacientes={analise.pacientesDaSemana}
            valor={analise.pacienteNome}
            onEscolher={analise.escolherPaciente}
          />

          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => analise.irParaSemana(-1)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              aria-label="Semana anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="w-32 text-center text-sm font-semibold text-slate-700 tabular-nums">
              {labelSemana}
            </span>
            <button
              onClick={() => analise.irParaSemana(1)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              aria-label="Próxima semana"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {analise.idsDoPaciente.length > 1 && (
            /* Nome não é identidade. Dizer que são dois cadastros é melhor que
               escolher um em silêncio e mostrar meia semana como se fosse toda. */
            <p className="text-xs text-amber-800">
              Dois cadastros com este nome ({analise.idsDoPaciente.join(', ')}) — a análise soma os dois.
            </p>
          )}
        </div>

        {/* Placar por TUSS */}
        {!semPaciente && !analise.erro && analise.placar.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-100 px-4 py-3 sm:px-8">
            {analise.placar.map((p) => (
              <ChipTuss
                key={p.codigo_tuss}
                item={p}
                ativa={analise.tussFiltro === p.codigo_tuss}
                onToggle={analise.setTussFiltro}
              />
            ))}
            <span className="shrink-0 pl-2 text-xs text-slate-500">
              {analise.totalExcedente > 0
                ? `${analise.totalExcedente} ${analise.totalExcedente === 1 ? 'autorização' : 'autorizações'} além do agendado`
                : 'nenhum excedente na semana'}
            </span>
          </div>
        )}

        {/* Corpo */}
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50 lg:grid lg:grid-cols-2 lg:divide-x lg:divide-slate-200 lg:overflow-hidden">
          {analise.erro ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center lg:col-span-2">
              <AlertTriangle size={24} className="text-rose-600" />
              <p className="text-sm font-medium text-slate-700">{analise.erro}</p>
              <button
                onClick={analise.recarregar}
                className="mt-1 inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-brand hover:bg-brand-hover hover:text-brand-fg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <RefreshCw size={13} />
                Tentar novamente
              </button>
            </div>
          ) : analise.carregandoSemana ? (
            <div className="space-y-2 px-3 py-4 sm:px-6 lg:col-span-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-white" />
              ))}
            </div>
          ) : semPaciente ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center lg:col-span-2">
              <UserSearch size={22} className="text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-600">Escolha um paciente</p>
                <p className="text-xs text-slate-500">
                  {analise.pacientesDaSemana.length > 0
                    ? `${analise.pacientesDaSemana.length} com sessão ASSIM em ${labelSemana}.`
                    : `Nenhuma sessão ASSIM em ${labelSemana}.`}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Cronograma — a cota */}
              <div className="lg:min-h-0 lg:overflow-y-auto">
                {/* "no cronograma" e não "sessões": a contagem inclui a linha de
                    falta, que aparece aqui mas não conta como cota. O número que
                    conta é o das chips. */}
                <TituloColuna contagem={`${totalSessoes} no cronograma`}>Cronograma da semana</TituloColuna>
                <div className="px-3 pb-4 sm:px-6">
                  {dias.map((dia) => {
                    const doDia = sessoesPorDia.get(dia) ?? []
                    return (
                      <div key={dia}>
                        <RotuloDia>{formatarDiaComNome(dia)}</RotuloDia>
                        {doDia.length === 0 ? (
                          <p className="px-1 py-1 text-xs text-slate-400">sem sessão</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {doDia.map((s) => (
                              <LinhaSessao key={s.bloco_id} item={s} />
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Autorizações — o que a ASSIM processou */}
              <div className="lg:min-h-0 lg:overflow-y-auto">
                <TituloColuna
                  contagem={
                    orfasVisiveis > 0
                      ? `${totalAutorizacoes} · ${orfasVisiveis} sem sessão`
                      : `${totalAutorizacoes} autorização(ões)`
                  }
                >
                  Autorizações na semana
                </TituloColuna>
                <div className="px-3 pb-4 sm:px-6">
                  {totalAutorizacoes === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1 py-20 text-center">
                      <CheckCircle2 size={22} className="text-slate-400" />
                      <p className="text-sm font-medium text-slate-600">Nenhuma autorização nesta semana</p>
                      <p className="text-xs text-slate-500">
                        {analise.tussFiltro
                          ? 'Nada para este TUSS — limpe o filtro para ver os outros.'
                          : 'A ASSIM não registrou nada de seg a sex para este paciente.'}
                      </p>
                    </div>
                  ) : (
                    [...autorizacoesPorDia.entries()].map(([dia, doDia]) => (
                      <div key={dia}>
                        <RotuloDia>{dia === '—' ? 'sem data' : formatarDiaComNome(dia)}</RotuloDia>
                        <ul className="space-y-1.5">
                          {doDia.map((a) => (
                            <LinhaAutorizacao
                              key={a.guia}
                              item={a}
                              orfa={analise.orfas.has(a.guia)}
                              codigosGlosa={codigosGlosa}
                            />
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
