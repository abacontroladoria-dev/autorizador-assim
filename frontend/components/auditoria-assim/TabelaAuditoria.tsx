'use client'

import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, FileText, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import type { AuditoriaAssimItem } from './types'
import type { SortDir, SortKey } from '@/hooks/useAuditoriaAssim'
import ModalDetalhamentoAtendimento from './ModalDetalhamentoAtendimento'
import SituacaoBadge from './SituacaoBadge'
import { marcarTokenConferido } from '@/services/auditoria-assim.service'

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
}

/**
 * Layout de lista (não grade): cada linha agrupa fatos relacionados na mesma
 * célula (paciente+terapia, data+hora, status+observação) em vez de uma
 * coluna por campo — evita a leitura "planilha" de uma grade densa.
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
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Cabeçalho */}
        <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-2.5">
          <HeaderLabel label="Paciente" colKey="paciente_nome" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="min-w-0 flex-1" />
          <HeaderLabel label="Quando" colKey="hora_inicial" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-20 shrink-0" />
          <HeaderLabel label="Status" colKey="situacao" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-64 shrink-0" />
          <span className="w-24 shrink-0" />
        </div>

        {/* Linhas */}
        <div>
          {loading && <SkeletonRows />}

          {!loading && dados.length === 0 && (
            <div className="px-5 py-14 text-center text-sm text-slate-400">Nenhum registro encontrado</div>
          )}

          {!loading &&
            dados.map((item, idx) => (
              <div
                key={item.bloco_id ?? idx}
                className="flex items-center gap-4 border-b border-slate-50 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-slate-50/70"
              >
                {/* Paciente + terapia */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{item.paciente_nome ?? '—'}</p>
                  <p className="truncate text-xs text-slate-400">{item.terapias ?? '—'}</p>
                </div>

                {/* Quando */}
                <div className="w-20 shrink-0">
                  <p className="text-sm font-medium tabular-nums text-slate-700">
                    {item.hora_inicial ? item.hora_inicial.slice(0, 5) : '—'}
                  </p>
                  <p className="text-xs tabular-nums text-slate-400">{formatarData(item.data_atendimento)}</p>
                </div>

                {/* Status + observação + conferência de token */}
                <div className="w-64 shrink-0">
                  <div className="flex items-center gap-2">
                    <SituacaoBadge situacao={item.situacao} />
                    {item.teve_token && (
                      <label
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 cursor-pointer select-none whitespace-nowrap"
                        title={
                          item.token_conferido
                            ? `Conferido${item.token_conferido_por_nome ? ` por ${item.token_conferido_por_nome}` : ''}${item.token_conferido_em ? ` em ${formatarDataHora(item.token_conferido_em)}` : ''}`
                            : 'Marcar filipeta como conferida pela operadora'
                        }
                      >
                        {conferindoBloco === item.bloco_id ? (
                          <Loader2 size={12} className="animate-spin text-slate-400" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={Boolean(item.token_conferido)}
                            onChange={(e) => handleToggleConferido(item, e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        )}
                        Conferido
                      </label>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{item.observacao ?? '—'}</p>
                </div>

                {/* Ações */}
                <div className="w-24 shrink-0 text-right">
                  <button
                    onClick={() => setItemSelecionado(item)}
                    className={
                      item.motivo_glosa || item.observacao_manual
                        ? 'inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 transition-all duration-150 whitespace-nowrap hover:border-green-400 hover:bg-green-100'
                        : 'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-transparent px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-all duration-150 whitespace-nowrap hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700'
                    }
                  >
                    <FileText size={11} className="shrink-0" />
                    {item.motivo_glosa || item.observacao_manual ? 'Detalhado' : 'Detalhe'}
                  </button>
                </div>
              </div>
            ))}
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
      />
    </div>
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
      className={`flex items-center gap-1 text-left text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-600 ${className ?? ''}`}
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
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="text-violet-500" />
    : <ChevronDown size={12} className="text-violet-500" />
}

function formatarData(data: string | null) {
  if (!data) return '—'
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}`
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
        <div key={i} className="flex items-center gap-4 border-b border-slate-50 px-5 py-3.5 last:border-b-0">
          <div className="h-4 w-40 min-w-0 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-20 shrink-0 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-64 shrink-0 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-24 shrink-0 animate-pulse rounded bg-slate-100" />
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
                  ? 'bg-indigo-600 text-white border border-indigo-600 shadow-sm'
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
