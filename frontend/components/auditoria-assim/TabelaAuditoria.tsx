'use client'

import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, FileText } from 'lucide-react'
import type { AuditoriaAssimItem } from './types'
import type { SortDir, SortKey } from '@/hooks/useAuditoriaAssim'
import ModalDetalhamentoGlosa from './ModalDetalhamentoGlosa'

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
]

type SituacaoConfigEntry = { label: string; dot: string; className: string }

const SITUACAO_CONFIG: Record<string, SituacaoConfigEntry> = {
  NAO_SOLICITADA: {
    label: 'Não Solicitada',
    dot: 'bg-red-600',
    className: 'bg-red-50 text-red-600 ring-1 ring-red-300',
  },
  SINCRONIZANDO: {
    label: 'Sincronizando',
    dot: 'bg-blue-600',
    className: 'bg-blue-50 text-blue-600 ring-1 ring-blue-300',
  },
  RETORNO_NAO_CONFIRMADO: {
    label: 'Retorno Não Confirmado',
    dot: 'bg-orange-600',
    className: 'bg-orange-50 text-orange-600 ring-1 ring-orange-300',
  },
  // alias legado — removível após migration aplicada
  AGUARDANDO_RETORNO: {
    label: 'Retorno Não Confirmado',
    dot: 'bg-orange-600',
    className: 'bg-orange-50 text-orange-600 ring-1 ring-orange-300',
  },
  LIBERADA: {
    label: 'Liberada',
    dot: 'bg-green-600',
    className: 'bg-green-50 text-green-600 ring-1 ring-green-300',
  },
  GLOSA: {
    label: 'Glosa',
    dot: 'bg-violet-600',
    className: 'bg-violet-50 text-violet-600 ring-1 ring-violet-300',
  },
  CANCELADA: {
    label: 'Cancelada',
    dot: 'bg-gray-500',
    className: 'bg-gray-100 text-gray-500 ring-1 ring-gray-300',
  },
  FALTA: {
    label: 'Falta',
    dot: 'bg-yellow-500',
    className: 'bg-yellow-50 text-yellow-600 ring-1 ring-yellow-300',
  },
  FALTA_TERAPEUTA: {
    label: 'Falta Terapeuta',
    dot: 'bg-red-500',
    className: 'bg-red-50 text-red-600 ring-1 ring-red-300',
  },
}

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
                      {item.situacao === 'GLOSA' && (
                        <button
                          onClick={() => setItemSelecionado(item)}
                          className={
                            item.motivo_glosa
                              ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-all duration-150 whitespace-nowrap cursor-pointer select-none'
                              : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-violet-600 border border-violet-300 bg-transparent hover:bg-violet-50 hover:border-violet-400 hover:text-violet-700 transition-all duration-150 whitespace-nowrap cursor-pointer select-none'
                          }
                        >
                          <FileText size={11} className="shrink-0" />
                          {item.motivo_glosa ? 'Detalhado' : 'Detalhe'}
                        </button>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-slate-500 min-w-55 truncate">
                    {item.observacao ?? '—'}
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

      <ModalDetalhamentoGlosa
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

function SituacaoBadge({ situacao }: { situacao: string | null }) {
  if (!situacao) return <span className="text-slate-400">—</span>

  const config: SituacaoConfigEntry = SITUACAO_CONFIG[situacao] ?? {
    label: situacao,
    dot: 'bg-slate-400',
    className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-300',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  )
}

function formatarData(data: string | null) {
  if (!data) return '—'
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
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
