'use client'

import { useMemo, useState } from 'react'
import {
  AlertOctagon, AlertTriangle, Ban, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Link2,
  RefreshCw, Search, TrendingDown, TrendingUp, X,
} from 'lucide-react'
import type { PacientePendencias, TipoPendencia } from '../types'
import { dataHoraRelativa, normalizar, rotuloSemana } from './datas'

/**
 * A ordem dos chips E a ordem das colunas numéricas — a mesma lista, um lugar
 * só. Elas divergirem faria o número que a pessoa clicou não ser o número que
 * ela lê na linha.
 *
 * Os matizes são os já falados nesta superfície (DESIGN.md, Status Lock Rule):
 * violeta é glosa, cinza é o que acabou sem efeito, âmbar espera alguém olhar,
 * rose é a lacuna mais larga — nada foi autorizado para uma sessão que já
 * aconteceu. Nenhum matiz novo, e nenhum deles decora: cada chip filtra
 * exatamente o estado que nomeia.
 */
const PENDENCIAS: {
  chave: TipoPendencia
  rotulo: string
  coluna: string
  Icone: typeof Link2
  tinta: string
  ativo: string
  inativo: string
  ajuda: string
}[] = [
  {
    chave: 'glosa',
    rotulo: 'Glosas',
    coluna: 'Glosas',
    Icone: AlertOctagon,
    tinta: 'text-violet-700',
    ativo: 'border-violet-300 bg-violet-50 text-violet-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50',
    ajuda: 'Guias que a ASSIM recusou nesta semana.',
  },
  {
    chave: 'cancelamento',
    rotulo: 'Cancelamentos',
    coluna: 'Cancel.',
    Icone: Ban,
    tinta: 'text-slate-700',
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
    ativo: 'border-rose-300 bg-rose-50 text-rose-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50',
    ajuda: 'Sessões que já aconteceram sem liberação que as cubra. O que ainda vai acontecer nesta semana não conta.',
  },
  {
    chave: 'sobrando',
    rotulo: 'Sobrando',
    coluna: 'Sobrando',
    Icone: TrendingUp,
    tinta: 'text-amber-700',
    ativo: 'border-amber-300 bg-amber-50 text-amber-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50',
    ajuda: 'Liberações a mais do que sessões agendadas naquele TUSS — é o que provoca a glosa 1601.',
  },
]

/**
 * Número de coluna: zero recua, o resto chama.
 *
 * O recuo é por PESO e matiz, não por apagamento. `text-slate-300` era o desenho
 * anterior e mede 1,49:1 sobre branco — um zero que reprova em AA por sete
 * vezes, e "nenhuma glosa nesta semana" é informação, não enfeite. Em
 * `slate-500` regular ele mede 4,76:1 e continua três degraus atrás do número
 * que pede trabalho.
 */
function Contagem({ valor, tinta }: { valor: number; tinta: string }) {
  return (
    <span
      className={`text-sm tabular-nums ${valor > 0 ? `font-semibold ${tinta}` : 'font-normal text-slate-500'}`}
    >
      {valor}
    </span>
  )
}

type Props = {
  pacientes: PacientePendencias[]
  unidades: string[]
  semanaInicio: string
  semanaFim: string
  semanaAtual: string
  carregando: boolean
  erro: string | null
  onSemana: (delta: number) => void
  onIrParaData: (data: string) => void
  onRecarregar: () => void
  onAbrir: (paciente: PacientePendencias) => void
}

/**
 * Autorizações com pendências — a fila de trabalho da semana.
 *
 * A pergunta que a tela abre deixou de ser "me mostre este paciente" e passou a
 * ser "quem precisa de mim nesta semana?". Por isso a listagem não é um índice
 * de guias soltas (o desenho anterior): é um paciente por linha, com as cinco
 * espécies de pendência lado a lado, e o clique abre a semana inteira dele.
 *
 * Cada coluna numérica é também um chip no topo, e o chip filtra exatamente a
 * coluna que nomeia — é o que permite ir de "há trabalho" para "qual trabalho"
 * sem sair da tela.
 *
 * A busca atravessa o filtro de pendência de propósito: quem digita um nome
 * está procurando uma pessoa específica, e escondê-la porque a semana dela está
 * limpa seria responder "não existe" a uma pergunta que era "como ela está".
 */
export default function ListaPendencias({
  pacientes, unidades, semanaInicio, semanaFim, semanaAtual, carregando, erro,
  onSemana, onIrParaData, onRecarregar, onAbrir,
}: Props) {
  const [filtro, setFiltro] = useState<TipoPendencia | null>(null)
  const [unidade, setUnidade] = useState<string>('')
  const [busca, setBusca] = useState('')

  const naUnidade = useMemo(
    () => (unidade ? pacientes.filter((p) => p.unidade === unidade) : pacientes),
    [pacientes, unidade]
  )

  const comPendencia = useMemo(() => naUnidade.filter((p) => p.contagem.total > 0), [naUnidade])

  const contagemChips = useMemo(() => {
    const mapa = new Map<TipoPendencia, number>(PENDENCIAS.map((p) => [p.chave, 0]))
    for (const p of comPendencia) {
      for (const { chave } of PENDENCIAS) {
        if (p.contagem[chave] > 0) mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
      }
    }
    return mapa
  }, [comPendencia])

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    // Busca preenchida = universo inteiro da semana, inclusive quem está limpo.
    const base = termo ? naUnidade : filtro ? comPendencia.filter((p) => p.contagem[filtro] > 0) : comPendencia
    if (!termo) return base
    return base.filter((p) =>
      normalizar(`${p.nome} ${p.carteirinhas.join(' ')}`).includes(termo)
    )
  }, [naUnidade, comPendencia, filtro, busca])

  const buscando = busca.trim().length > 0
  const labelSemana = rotuloSemana(semanaInicio, semanaFim)

  return (
    <div className="flex flex-col gap-3">
      {/* ── Cabeçalho: semana, unidade, busca ──────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSemana(-1)}
            aria-label="Semana anterior"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <ChevronLeft size={16} />
          </button>

          {/* A data é o rótulo E o seletor: o input cobre o texto, então clicar em
              "20/07 a 24/07" abre o calendário do navegador. Um segundo controle
              ao lado diria a mesma coisa duas vezes. */}
          <label className="relative flex h-11 items-center gap-2 rounded-lg px-2 transition hover:bg-slate-100">
            <CalendarDays size={15} className="text-slate-400" aria-hidden />
            <span className="text-sm font-semibold tabular-nums text-slate-700">{labelSemana}</span>
            <span className="sr-only">Ir para a semana de uma data</span>
            <input
              type="date"
              value={semanaInicio}
              onChange={(e) => e.target.value && onIrParaData(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>

          <button
            type="button"
            onClick={() => onSemana(1)}
            aria-label="Próxima semana"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <ChevronRight size={16} />
          </button>

          {semanaInicio !== semanaAtual && (
            <button
              type="button"
              onClick={() => onIrParaData(semanaAtual)}
              className="ml-1 inline-flex h-11 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-600 transition hover:border-brand hover:bg-brand-hover hover:text-brand-fg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Semana atual
            </button>
          )}
        </div>

        {/* No celular os três controles compartilham a linha em vez de a busca
            tomar a largura toda e empurrar seletor e refresh para linhas
            próprias — três faixas de um controle cada. */}
        <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          <label className="flex items-center gap-2">
            <span className="sr-only">Unidade</span>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className="h-11 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-700 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
            >
              <option value="">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>

          <div className="relative min-w-40 flex-1 sm:max-w-64 sm:flex-none sm:basis-64">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar paciente…"
              aria-label="Buscar paciente por nome ou carteirinha"
              className="h-11 w-full rounded-lg border border-slate-300 pr-10 pl-9 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar a busca"
                className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:text-slate-700"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onRecarregar}
            disabled={carregando}
            aria-label="Atualizar a semana"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60"
          >
            <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} aria-hidden />
          </button>
        </div>
      </div>

      {/* ── Chips: quantos pacientes têm cada espécie de pendência ─────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFiltro(null)}
          aria-pressed={filtro === null}
          className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
            filtro === null
              ? 'border-brand bg-brand-surface text-brand-fg'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="font-semibold tabular-nums">{comPendencia.length}</span>
          Todas
        </button>

        {PENDENCIAS.map(({ chave, rotulo, Icone, ativo, inativo, ajuda }) => {
          const n = contagemChips.get(chave) ?? 0
          const selecionado = filtro === chave
          return (
            <button
              key={chave}
              type="button"
              title={ajuda}
              onClick={() => setFiltro(selecionado ? null : chave)}
              aria-pressed={selecionado}
              // Zero continua visível e clicável: "nenhuma glosa nesta semana" é
              // informação, e esconder o contador faria a ausência parecer com a
              // tela ainda carregando.
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
                selecionado ? ativo : inativo
              } ${n === 0 && !selecionado ? 'opacity-60' : ''}`}
            >
              <Icone size={13} aria-hidden />
              <span className="font-semibold tabular-nums">{n}</span>
              {rotulo}
            </button>
          )
        })}

        <span className="ml-auto text-[12px] text-slate-500" role="status" aria-live="polite">
          {carregando
            ? 'carregando a semana…'
            : buscando
              ? `${visiveis.length} ${visiveis.length === 1 ? 'paciente' : 'pacientes'} na busca`
              : `${visiveis.length} de ${comPendencia.length} com pendência`}
        </span>
      </div>

      {/* ── Listagem ───────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {erro ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <AlertTriangle size={24} className="text-rose-600" aria-hidden />
            <p className="text-sm font-medium text-slate-700">{erro}</p>
            <button
              onClick={onRecarregar}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-brand hover:bg-brand-hover hover:text-brand-fg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <RefreshCw size={13} aria-hidden />
              Tentar novamente
            </button>
          </div>
        ) : carregando && pacientes.length === 0 ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
            <CheckCircle2 size={24} className="text-emerald-500" aria-hidden />
            <p className="text-sm font-semibold text-slate-700">
              {buscando
                ? 'Nenhum paciente com esse nome nesta semana'
                : filtro
                  ? 'Nada nesta espécie de pendência'
                  : 'Semana limpa'}
            </p>
            <p className="max-w-md text-xs text-slate-500">
              {buscando
                ? 'A busca cobre a semana inteira, não só quem tem pendência.'
                : filtro
                  ? 'Limpe o filtro para ver as outras pendências da semana.'
                  : `Nenhum cancelamento, glosa ou divergência de cota entre ${labelSemana}.`}
            </p>
          </div>
        ) : (
          // `relative` não é decoração: medido em 390px, sem ele a largura
          // intrínseca da tabela escapa do `overflow-x-auto` e é a PÁGINA que
          // passa a rolar de lado (590px de vazio à direita) — o mesmo defeito
          // que a fila antiga já teve. Com o contêiner posicionado a rolagem
          // fica onde deve, e a coluna grudada tem contra o que se grudar.
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-248 border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold text-slate-500">
                    Paciente
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500">Plano</th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500">Unidade</th>
                  <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500">
                    Pendências
                  </th>
                  {PENDENCIAS.map(({ chave, coluna, ajuda }) => (
                    <th
                      key={chave}
                      scope="col"
                      title={ajuda}
                      className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500"
                    >
                      {coluna}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500">
                    Última atualização
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiveis.map((p) => (
                  <tr
                    key={p.chave}
                    tabIndex={0}
                    role="button"
                    onClick={() => onAbrir(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onAbrir(p)
                      }
                    }}
                    aria-label={`Abrir a semana de ${p.nome}, ${p.contagem.total} pendência(s)`}
                    className="group cursor-pointer transition hover:bg-brand-hover focus-visible:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white px-4 py-2.5 text-left font-normal transition group-hover:bg-brand-hover group-focus-visible:bg-brand-hover"
                    >
                      <p className="truncate text-[13px] font-semibold text-slate-800" title={p.nome}>
                        {p.nome}
                      </p>
                      <p className="truncate text-[11px] tabular-nums text-slate-500">
                        {p.carteirinhas[0] ?? 'sem carteirinha'}
                        {p.carteirinhas.length > 1 && ` +${p.carteirinhas.length - 1}`}
                      </p>
                    </th>
                    <td className="px-3 py-2.5 text-[12px] text-slate-600">{p.plano ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-600">{p.unidade ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {p.contagem.total > 0 ? (
                        <span className="inline-flex min-w-7 justify-center rounded-full bg-rose-50 px-2 py-0.5 text-[13px] font-bold tabular-nums text-rose-700 ring-1 ring-rose-200">
                          {p.contagem.total}
                        </span>
                      ) : (
                        <span className="text-sm font-normal tabular-nums text-slate-500">0</span>
                      )}
                    </td>
                    {PENDENCIAS.map(({ chave, tinta }) => (
                      <td key={chave} className="px-3 py-2.5 text-right">
                        <Contagem valor={p.contagem[chave]} tinta={tinta} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-[12px] tabular-nums whitespace-nowrap text-slate-500">
                      {dataHoraRelativa(p.ultimaAutorizacao)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <ChevronRight
                        size={16}
                        aria-hidden
                        className="ml-auto text-slate-300 transition group-hover:text-brand-fg"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
