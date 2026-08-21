'use client'

import { useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Circle,
  Clock3,
  FileText,
  Loader2,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import type { AuditoriaAssimItem } from './types'
import type { SortDir, SortKey } from '@/hooks/useAuditoriaAssim'
import ModalDetalhamentoAtendimento from './ModalDetalhamentoAtendimento'
import { SituacaoBloco } from './SituacaoBadge'
import { marcarTokenConferido } from '@/services/auditoria-assim.service'
import { LABEL_ERRO_FACIAL, OBS_CONFIRMADA, erroReconhecimentoFacial } from './formaValidacao'
import { ehGlosa } from './situacoes'

/**
 * Largura das colunas em um lugar só: o cabeçalho é a régua das linhas, e se as
 * duas listas divergirem o alinhamento vertical quebra sem avisar.
 *
 * A linha só cabe em uma faixa a partir de `xl` — a sidebar fixa come 16rem, e
 * abaixo disso a primeira coluna a ser espremida seria justamente o nome do
 * paciente. Antes de `xl` o `flex-wrap` empilha em faixas (identidade + ação /
 * horário + guia + status), e o cabeçalho — que é a régua e o controle de
 * ordenação — dá lugar ao rótulo inline da guia. Daí a base calculada da
 * identidade e o `w-full` do status, que reservam a faixa inteira em vez de
 * encolher o que importa.
 *
 * O status é a coluna mais larga de propósito: a legenda mais longa do
 * vocabulário ("Erro no Reconhecimento Facial") convive com o pill de
 * conferência na mesma linha, e é essa combinação que dita a largura.
 */
// `grow` e não `flex-1`: o utilitário `flex-1` reescreve o flex-basis e anularia
// a base calculada que reserva a faixa da identidade.
const COL_IDENTIDADE = 'min-w-0 grow basis-[calc(100%-8rem)] xl:basis-0'
const COL_HORARIO = 'w-18 shrink-0'
// Largura fixa também nas faixas empilhadas: com `w-auto`, o "—" de quem não
// tem guia encurtava a célula e o bloco de status começava em um x diferente a
// cada linha.
const COL_GUIA = 'w-28 shrink-0 xl:w-24'
const COL_STATUS = 'w-full shrink-0 sm:w-80'
const COL_ACAO = 'w-24 shrink-0'

type Props = {
  dados: AuditoriaAssimItem[]
  loading?: boolean
  pagina: number
  totalPaginas: number
  totalFiltrados: number
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  onPaginaChange: (p: number) => void
  onRefresh: () => void
  /** Abre a Análise de Reincidência na semana daquele atendimento. */
  onAnalisarSemana: (item: AuditoriaAssimItem) => void
}

/**
 * Layout de lista (não grade): cada registro é um bloco horizontal com borda
 * própria, e cada célula agrupa fatos relacionados (paciente+terapia, data+hora,
 * situação+legenda) em vez de uma coluna por campo — evita a leitura "planilha"
 * de uma grade densa.
 *
 * A situação é o elemento de maior destaque da linha: vira um bloco tingido com
 * barra lateral no matiz do estado (`SituacaoBloco`), não um pill perdido entre
 * textos. Tudo aqui é apresentação — dados, filtros, ordenação, paginação e o
 * modal seguem intocados.
 */
export default function TabelaAuditoria({
  dados,
  loading,
  pagina,
  totalPaginas,
  totalFiltrados,
  sortKey,
  sortDir,
  onSort,
  onPaginaChange,
  onRefresh,
  onAnalisarSemana,
}: Props) {
  const [itemSelecionado, setItemSelecionado] = useState<AuditoriaAssimItem | null>(null)
  const [conferindoBloco, setConferindoBloco] = useState<string | null>(null)

  async function handleToggleConferido(item: AuditoriaAssimItem, checked: boolean) {
    if (!item.bloco_id) return
    setConferindoBloco(item.bloco_id)
    try {
      await marcarTokenConferido(item.bloco_id, checked)
      onRefresh()
    } catch {
      toast.error('Erro ao marcar conferência. Tente novamente.')
    } finally {
      setConferindoBloco(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-2.5">
        {/* Cabeçalho — também a régua de largura das linhas */}
        <div className="hidden items-center gap-4 px-3 pb-2 pt-1 xl:flex">
          <HeaderLabel label="Paciente / Terapia" colKey="paciente_nome" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={COL_IDENTIDADE} />
          <HeaderLabel label="Horário" colKey="hora_inicial" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={COL_HORARIO} />
          <HeaderLabel label="Guia" colKey="guia" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={COL_GUIA} />
          <HeaderLabel label="Status" colKey="situacao" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={COL_STATUS} />
          <span className={COL_ACAO} aria-hidden />
        </div>

        {/* Linhas */}
        <div className="flex flex-col gap-1.5">
          {loading && <SkeletonRows />}

          {!loading && dados.length === 0 && (
            <div className="px-5 py-14 text-center text-sm text-slate-400">Nenhum registro encontrado</div>
          )}

          {!loading &&
            dados.map((item, idx) => {
              // Filipeta (token) e erro de reconhecimento facial são os dois
              // casos em que existe papel para conferir na recepção — ambos
              // recebem o mesmo botão.
              const erroFacial = erroReconhecimentoFacial(item.forma_autorizacao)
              const precisaConferir = Boolean(item.teve_token) || erroFacial
              const detalhado = Boolean(item.motivo_glosa || item.observacao_manual)

              return (
              <div
                key={item.bloco_id ?? idx}
                className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50/60"
              >
                {/* Paciente + terapia */}
                <div className={`order-1 flex items-center gap-2.5 ${COL_IDENTIDADE}`}>
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-brand-surface text-[11px] font-bold text-brand-fg"
                  >
                    {getIniciais(item.paciente_nome)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800" title={item.paciente_nome ?? undefined}>
                      {item.paciente_nome ?? '—'}
                    </p>
                    <p className="truncate text-xs text-slate-400" title={item.terapias ?? undefined}>
                      {item.terapias ?? '—'}
                    </p>
                  </div>
                </div>

                {/* Horário */}
                {/* A hora vem primeiro: a data já está fixada pelo filtro, então
                    o que varia de linha para linha — e é o que se lê — é a hora. */}
                <div className={`order-3 xl:order-2 ${COL_HORARIO}`}>
                  <p className="flex items-center gap-1.5 text-[13px] font-medium tabular-nums text-slate-700">
                    <Clock3 size={12} className="shrink-0 text-slate-400" aria-hidden />
                    {item.hora_inicial ? item.hora_inicial.slice(0, 5) : '—'}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs tabular-nums text-slate-500">
                    <CalendarDays size={12} className="shrink-0 text-slate-400" aria-hidden />
                    {formatarData(item.data_atendimento)}
                  </p>
                </div>

                {/* Guia */}
                <div className={`order-4 flex items-baseline gap-1.5 xl:order-3 xl:block ${COL_GUIA}`}>
                  {/* Rótulo inline só onde o cabeçalho não existe. */}
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">
                    Guia
                  </span>
                  {item.guia ? (
                    <span className="truncate text-[13px] font-semibold tabular-nums text-slate-700" title={item.guia}>
                      {item.guia}
                    </span>
                  ) : (
                    <span className="text-[13px] text-slate-300">—</span>
                  )}
                </div>

                {/* Status — o destaque da linha; leva a legenda e a conferência */}
                <div className={`order-5 xl:order-4 ${COL_STATUS}`}>
                  <SituacaoBloco
                    situacao={item.situacao}
                    legenda={legendaSituacao(item, erroFacial)}
                    extra={
                      precisaConferir ? (
                        <ConferenciaPill
                          conferido={Boolean(item.token_conferido)}
                          carregando={conferindoBloco === item.bloco_id}
                          por={item.token_conferido_por_nome}
                          em={item.token_conferido_em}
                          onToggle={() => handleToggleConferido(item, !item.token_conferido)}
                        />
                      ) : null
                    }
                  />
                </div>

                {/* Ações */}
                <div className={`order-2 text-right xl:order-5 ${COL_ACAO}`}>
                  <button
                    onClick={() => setItemSelecionado(item)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors ${
                      detalhado
                        ? 'border-green-300 bg-green-50 text-green-700 hover:border-green-400 hover:bg-green-100'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    <FileText size={12} className="shrink-0" aria-hidden />
                    {detalhado ? 'Detalhado' : 'Detalhe'}
                  </button>
                </div>
              </div>
              )
            })}
        </div>
      </div>

      <Paginacao
        pagina={pagina}
        totalPaginas={totalPaginas}
        totalFiltrados={totalFiltrados}
        onChange={onPaginaChange}
      />

      <ModalDetalhamentoAtendimento
        item={itemSelecionado}
        open={itemSelecionado !== null}
        onClose={() => setItemSelecionado(null)}
        onSalvo={() => { setItemSelecionado(null); onRefresh() }}
        // Fecha o detalhe antes de abrir a análise: dois diálogos modais
        // empilhados são dois focus traps, e ao fechar o de cima o foco não
        // volta para onde saiu.
        onAnalisarSemana={(item) => { setItemSelecionado(null); onAnalisarSemana(item) }}
      />
    </div>
  )
}

/**
 * Pill de conferência, hoje dentro do bloco de situação. Verde = filipeta
 * conferida, âmbar = ainda por conferir — mesmo vocabulário do modal de
 * Conferência de Filipetas. O fundo é branco (e não o `-50` do matiz) porque o
 * bloco já está tingido: um pill emerald-50 sobre superfície emerald-50
 * desapareceria.
 */
function ConferenciaPill({
  conferido,
  carregando,
  por,
  em,
  onToggle,
}: {
  conferido: boolean
  carregando: boolean
  por: string | null
  em: string | null
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={carregando}
      aria-pressed={conferido}
      title={
        conferido
          ? `Conferida${por ? ` por ${por}` : ''}${em ? ` em ${formatarDataHora(em)}` : ''} — clique para desmarcar`
          : 'Marcar este papel como conferido'
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-semibold whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60 ${
        conferido
          ? 'text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-50'
          : 'text-amber-700 ring-1 ring-amber-300 hover:bg-amber-50'
      }`}
    >
      {carregando ? (
        <Loader2 size={10} className="shrink-0 animate-spin" />
      ) : conferido ? (
        <Check size={10} strokeWidth={3} className="shrink-0" />
      ) : (
        <Circle size={10} className="shrink-0" />
      )}
      {conferido ? 'Conferida' : 'Conferir'}
    </button>
  )
}

function HeaderLabel({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  colKey: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  return (
    <button
      onClick={() => onSort(colKey)}
      className={`flex items-center gap-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:text-slate-600 ${className ?? ''}`}
    >
      {label}
      <SortIcon colKey={colKey} sortKey={sortKey} sortDir={sortDir} />
    </button>
  )
}

function SortIcon({ colKey, sortKey, sortDir }: { colKey: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (colKey !== sortKey) {
    return <ChevronsUpDown size={12} className="text-slate-300" />
  }
  // steel da marca, não violeta: violeta é o matiz semântico de GLOSA e não
  // pode significar "ordenado por esta coluna" na linha de cima.
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="text-brand" />
    : <ChevronDown size={12} className="text-brand" />
}

function formatarData(data: string | null) {
  if (!data) return '—'
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

function getIniciais(nome: string | null): string {
  if (!nome?.trim()) return '—'
  const partes = nome.trim().split(/\s+/)
  if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  return partes[0].slice(0, 2).toUpperCase()
}

/**
 * Ramo `ELSE` do CASE de observação na `get_auditoria_assim` — o texto de "nada
 * a dizer" quando não há solicitação nenhuma. Repete o rótulo "Não Solicitada"
 * e por isso não vira legenda.
 */
const OBS_SEM_SOLICITACAO = 'Nenhuma solicitação encontrada'

/**
 * Linha secundária do bloco de situação: a fonte da resposta ou o motivo real.
 *
 * Os dois textos genéricos da RPC não dizem nada que o próprio rótulo já não
 * diga. No lugar de `OBS_CONFIRMADA` vai o convênio que respondeu (que é o que
 * a linha precisa mostrar), exceto quando a validação foi por erro de
 * reconhecimento facial: aí a forma é o fato relevante. `OBS_SEM_SOLICITACAO`
 * não tem substituto — nada foi enviado, então não há fonte a citar. Glosa,
 * cancelamento e qualquer outra observação continuam com o texto real.
 */
function legendaSituacao(item: AuditoriaAssimItem, erroFacial: boolean): string | null {
  if (item.observacao === OBS_SEM_SOLICITACAO) return null
  if (item.observacao === OBS_CONFIRMADA) {
    return erroFacial ? LABEL_ERRO_FACIAL : (item.convenio_nome ?? 'ASSIM')
  }
  // A RPC prefixa a observação de recusa com "Glosa: " para quem a lê fora
  // desta tela. Aqui o rótulo do bloco já diz Glosa, e a legenda tem uma linha
  // truncada: os 7 caracteres do prefixo custariam pedaço do motivo real
  // ("1013 - CADASTRO DO BENEFICIARIO COM PROBLEMAS"), que é o que se lê.
  // `ehGlosa` e não `=== 'GLOSA'`: em GLOSA_RESOLVIDA a observação também vem
  // prefixada ("Glosa: 1403 - ... · Coberta pela guia 15032 ..."), e ali a linha
  // truncada é ainda mais disputada — o prefixo custaria justamente o pedaço que
  // conta qual guia resolveu.
  if (ehGlosa(item.situacao) && item.observacao?.startsWith('Glosa: ')) {
    return item.observacao.slice('Glosa: '.length)
  }
  return item.observacao ?? item.convenio_nome ?? null
}

function formatarDataHora(data: string | null) {
  if (!data) return '—'
  const d = new Date(data)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-slate-200/80 px-3 py-2.5"
        >
          <div className={`flex items-center gap-2.5 ${COL_IDENTIDADE}`}>
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-100" />
            <div className="h-8 min-w-0 flex-1 animate-pulse rounded bg-slate-100" />
          </div>
          <div className={`h-8 animate-pulse rounded bg-slate-100 ${COL_HORARIO}`} />
          <div className={`h-8 animate-pulse rounded bg-slate-100 ${COL_GUIA}`} />
          <div className={`h-11 animate-pulse rounded-lg bg-slate-100 ${COL_STATUS}`} />
          <div className={`h-8 animate-pulse rounded-lg bg-slate-100 ${COL_ACAO}`} />
        </div>
      ))}
    </>
  )
}

function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const delta = 1
  const range: (number | '…')[] = []
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i)
  }
  if (current - delta > 2) range.unshift('…')
  if (current + delta < total - 1) range.push('…')
  range.unshift(1)
  if (range[range.length - 1] !== total) range.push(total)
  return range
}

function Paginacao({
  pagina,
  totalPaginas,
  totalFiltrados,
  onChange,
}: {
  pagina: number
  totalPaginas: number
  totalFiltrados: number
  onChange: (p: number) => void
}) {
  if (totalPaginas <= 1) return null
  const pages = getPageNumbers(pagina, totalPaginas)

  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-xs text-slate-400">{totalFiltrados} registro(s)</span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(pagina - 1)}
          disabled={pagina === 1}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p as number)}
              className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-semibold transition ${
                p === pagina
                  ? 'bg-brand-fg text-white border border-brand-fg shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onChange(pagina + 1)}
          disabled={pagina === totalPaginas}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <span className="text-xs text-slate-400">Página {pagina} de {totalPaginas}</span>
    </div>
  )
}
