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

type ColConfig = {
  label: string
  sortKey?: SortKey
  width?: string
}

const COLUNAS: ColConfig[] = [
  { label: 'Paciente', sortKey: 'paciente_nome' },
  { label: 'Data', sortKey: 'data_atendimento', width: 'w-[95px]' },
  { label: 'Hora', sortKey: 'hora_inicial', width: 'w-[65px]' },
  { label: 'TUSS', sortKey: 'codigo_tuss', width: 'w-[85px]' },
  { label: 'Terapias', sortKey: 'terapias', width: 'w-[160px]' },
  { label: 'Situação', sortKey: 'situacao', width: 'w-[170px]' },
  { label: 'Observação' },
  { label: '', width: 'w-[110px]' },
]

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
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white border-b border-slate-100">
            <tr>
              {COLUNAS.map((col) => (
                <th
                  key={col.label}
                  className={`px-4 py-3 text-left ${col.width ?? ''} ${col.sortKey ? 'cursor-pointer select-none' : ''}`}
                  onClick={col.sortKey ? () => onSort(col.sortKey!) : undefined}
                >
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors whitespace-nowrap">
                    {col.label}
                    {col.sortKey && <SortIcon colKey={col.sortKey} sortKey={sortKey} sortDir={sortDir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && <SkeletonRows />}

            {!loading && dados.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length} className="px-4 py-10 text-center text-slate-400">
                  Nenhum registro encontrado
                </td>
              </tr>
            )}

            {!loading &&
              dados.map((item, idx) => (
                <tr
                  key={item.bloco_id ?? idx}
                  className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {item.paciente_nome ?? '—'}
                  </td>

                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {formatarData(item.data_atendimento)}
                  </td>

                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {item.hora_inicial ? item.hora_inicial.slice(0, 5) : '—'}
                  </td>

                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {item.codigo_tuss ?? '—'}
                  </td>

                  <td className="px-4 py-3 text-slate-600 w-40 truncate">
                    {item.terapias ?? '—'}
                  </td>

                  <td className="px-4 py-3">
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
                  </td>

                  <td className="px-4 py-3 text-slate-500 min-w-55 truncate">
                    {item.observacao ?? '—'}
                  </td>

                  <td className="px-4 py-3">
                    <button
                      onClick={() => setItemSelecionado(item)}
                      className={
                        item.motivo_glosa || item.observacao_manual
                          ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-all duration-150 whitespace-nowrap cursor-pointer select-none'
                          : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-500 border border-slate-200 bg-transparent hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 transition-all duration-150 whitespace-nowrap cursor-pointer select-none'
                      }
                    >
                      <FileText size={11} className="shrink-0" />
                      {item.motivo_glosa || item.observacao_manual ? 'Detalhado' : 'Detalhe'}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
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
  return `${dia}/${mes}/${ano}`
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
        <tr key={i} className="border-b border-slate-50">
          {COLUNAS.map((col) => (
            <td key={col.label} className="px-4 py-3">
              <div
                className="h-4 rounded bg-slate-100 animate-pulse"
                style={{ width: col.label === 'Paciente' ? '140px' : '80px' }}
              />
            </td>
          ))}
        </tr>
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
