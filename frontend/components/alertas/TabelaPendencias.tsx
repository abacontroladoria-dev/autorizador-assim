'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Clock, Search, Ticket, X } from 'lucide-react'
import type { Alerta } from './types'

type FiltroToken = 'todos' | 'com' | 'sem'

type Props = {
  alertas: Alerta[]
  loading?: boolean
  selecionadoId: string | null
  onSelecionar: (id: string | null) => void
}

type SortKey = 'data' | 'hora' | 'paciente' | 'terapia' | 'tipo' | 'status'
type SortDir = 'asc' | 'desc'

const COLUNAS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: 'data',     label: 'Data',     className: 'w-[86px]' },
  { key: 'hora',     label: 'Hora',     className: 'w-[62px]' },
  { key: 'paciente', label: 'Paciente' },
  { key: 'terapia',  label: 'Terapia',  className: 'w-[150px]' },
  { key: null,       label: 'TUSS',     className: 'w-[80px]' },
  { key: null,       label: 'Token',    className: 'w-[86px]' },
  { key: null,       label: 'Guia',     className: 'w-[86px]' },
  { key: 'tipo',     label: 'Tipo',     className: 'w-[130px]' },
  { key: 'status',   label: 'Status',   className: 'w-[126px]' },
]

/**
 * Lista de pendências em tabela densa.
 *
 * O formato imita a planilha que a Luana usa hoje: uma linha por atendimento,
 * Data / Hora / Paciente / Terapia à esquerda, Token e Guia legíveis INLINE, e
 * status como pastilha colorida — ela varre a tela por cor, não por texto.
 * Cards empilhados (o desenho anterior) mostram ~4 itens por tela; a tabela
 * mostra ~20, que é a densidade com que ela trabalha.
 *
 * O que a tabela NÃO replica da planilha, de propósito: as colunas "Impressão da
 * Filipeta" e "Pend. Ass. Resp.". São controle documental pós-autorização, um
 * workflow diferente do de pendência de autorização, e não existem neste modelo
 * de dados.
 */
export default function TabelaPendencias({
  alertas, loading, selecionadoId, onSelecionar,
}: Props) {
  const [busca, setBusca] = useState('')
  const [filtroHora, setFiltroHora] = useState('')
  const [filtroToken, setFiltroToken] = useState<FiltroToken>('todos')
  const [sortKey, setSortKey] = useState<SortKey>('hora')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function ordenarPor(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // Horários DERIVADOS dos dados, com contagem — em vez dos 13 blocos fixos de
  // FiltrosAuditoria. Numa lista por exceção a maioria dos blocos estaria vazia, e
  // opção morta em dropdown é ruído; assim ela vê de cara onde as pendências se
  // concentram. Também não duplica a lista de slots nem acopla ao arquivo da
  // aba Auditoria.
  const horasDisponiveis = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const a of alertas) {
      const h = a.entidade_ref?.hora
      if (h) mapa.set(h, (mapa.get(h) ?? 0) + 1)
    }
    return [...mapa.entries()].sort((x, y) => x[0].localeCompare(y[0]))
  }, [alertas])

  const temToken = (a: Alerta) => Boolean(a.entidade_ref?.token)

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = alertas.filter((a) => {
      const r = a.entidade_ref ?? {}

      if (filtroHora && r.hora !== filtroHora) return false

      if (filtroToken === 'com' && !temToken(a)) return false
      if (filtroToken === 'sem' &&  temToken(a)) return false

      if (termo) {
        const bate =
          r.paciente_nome?.toLowerCase().includes(termo) ||
          r.terapia?.toLowerCase().includes(termo) ||
          r.guia?.toLowerCase().includes(termo) ||
          r.token?.toLowerCase().includes(termo) ||
          r.tuss?.toLowerCase().includes(termo)
        if (!bate) return false
      }

      return true
    })

    const valor = (a: Alerta): string => {
      const r = a.entidade_ref ?? {}
      switch (sortKey) {
        case 'data':     return r.data ?? ''
        case 'hora':     return r.hora ?? ''
        case 'paciente': return r.paciente_nome ?? ''
        case 'terapia':  return r.terapia ?? ''
        case 'tipo':     return a.regra_codigo ?? (a.origem === 'manual' ? 'manual' : '')
        case 'status':   return a.status
      }
    }

    return [...filtradas].sort((a, b) => {
      const primary = valor(a).localeCompare(valor(b), 'pt-BR', { numeric: true })
      if (primary !== 0) return sortDir === 'asc' ? primary : -primary
      // tiebreaker estável: hora, depois paciente
      const h = (a.entidade_ref?.hora ?? '').localeCompare(b.entidade_ref?.hora ?? '')
      if (h !== 0) return h
      return (a.entidade_ref?.paciente_nome ?? '').localeCompare(
        b.entidade_ref?.paciente_nome ?? '', 'pt-BR')
    })
  }, [alertas, busca, filtroHora, filtroToken, sortKey, sortDir])

  const comToken = useMemo(() => alertas.filter(temToken).length, [alertas])
  const filtrando = Boolean(busca || filtroHora || filtroToken !== 'todos')

  function limparFiltros() {
    setBusca(''); setFiltroHora(''); setFiltroToken('todos')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_170px_auto]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente, terapia, guia, token ou TUSS"
            className={inputCls + ' pl-9'}
          />
        </label>

        <label className="relative">
          <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            value={filtroHora}
            onChange={(e) => setFiltroHora(e.target.value)}
            className={inputCls + ' pl-9'}
          >
            <option value="">Todos os horários</option>
            {horasDisponiveis.map(([hora, qtd]) => (
              <option key={hora} value={hora}>{hora} ({qtd})</option>
            ))}
          </select>
        </label>

        <label className="relative">
          <Ticket className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            value={filtroToken}
            onChange={(e) => setFiltroToken(e.target.value as FiltroToken)}
            className={inputCls + ' pl-9'}
          >
            <option value="todos">Token: todos</option>
            <option value="com">Com token ({comToken})</option>
            <option value="sem">Sem token ({alertas.length - comToken})</option>
          </select>
        </label>

        <button
          type="button"
          onClick={limparFiltros}
          disabled={!filtrando}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <X size={13} />
          Limpar
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-100 bg-white">
            <tr>
              {COLUNAS.map((col) => (
                <th
                  key={col.label}
                  onClick={col.key ? () => ordenarPor(col.key!) : undefined}
                  className={`px-3 py-2.5 text-left ${col.className ?? ''} ${col.key ? 'cursor-pointer select-none' : ''}`}
                >
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-600">
                    {col.label}
                    {col.key && (
                      col.key !== sortKey
                        ? <ChevronsUpDown size={11} className="text-slate-300" />
                        : sortDir === 'asc'
                          ? <ChevronUp size={11} className="text-indigo-500" />
                          : <ChevronDown size={11} className="text-indigo-500" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && alertas.length === 0 && [1, 2, 3, 4, 5].map((n) => (
              <tr key={n} className="border-b border-slate-50">
                {COLUNAS.map((c) => (
                  <td key={c.label} className="px-3 py-2.5">
                    <div className="h-3.5 animate-pulse rounded bg-slate-100" />
                  </td>
                ))}
              </tr>
            ))}

            {!loading && linhas.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length} className="px-3 py-12 text-center text-slate-400">
                  {busca
                    ? 'Nenhuma pendência corresponde à busca.'
                    : 'Nenhuma pendência. Todo atendimento tem guia válida, falta ou cancelamento.'}
                </td>
              </tr>
            )}

            {linhas.map((a) => {
              const r = a.entidade_ref ?? {}
              const sel = a.id === selecionadoId
              return (
                <tr
                  key={a.id}
                  onClick={() => onSelecionar(sel ? null : a.id)}
                  className={`cursor-pointer border-b border-slate-50 transition-colors ${
                    sel ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 tabular-nums">
                    {formatarData(r.data)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700 tabular-nums">
                    {r.hora ?? '—'}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2.5 font-medium text-slate-800">
                    {r.paciente_nome ?? '—'}
                  </td>
                  <td className="max-w-[150px] truncate px-3 py-2.5 text-slate-600">
                    {r.terapia ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 tabular-nums">
                    {r.tuss ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 tabular-nums">
                    {r.token || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 tabular-nums">
                    {r.guia || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <TipoPill alerta={a} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={a.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {linhas.length > 0 && (
        <p className="px-1 text-xs text-slate-400">
          {linhas.length} pendência(s){filtrando ? ` de ${alertas.length}` : ''}
        </p>
      )}
    </div>
  )
}

/** Tipo do problema: a regra que gerou, ou "Manual" quando foi decisão humana. */
function TipoPill({ alerta }: { alerta: Alerta }) {
  if (alerta.origem === 'manual') {
    return (
      <span
        title={alerta.criado_por_nome ? `Criada por ${alerta.criado_por_nome}` : undefined}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-300 bg-amber-50"
      >
        👤 Manual
      </span>
    )
  }

  const glosa = alerta.regra_codigo === 'assim_glosa'
  return (
    <span
      title={alerta.regra_nome ?? undefined}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${
        glosa
          ? 'bg-orange-50 text-orange-700 ring-orange-300'
          : 'bg-red-50 text-red-700 ring-red-300'
      }`}
    >
      🤖 {glosa ? 'Glosa' : 'Sem desfecho'}
    </span>
  )
}

/**
 * Pastilha de status no mesmo espírito dos dropdowns coloridos da planilha:
 * vermelho = precisa de ação, azul = alguém pegou, verde = fechado.
 */
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    aberto:       { label: 'Aberta',       cls: 'bg-red-100 text-red-700 ring-red-300' },
    em_andamento: { label: 'Em andamento', cls: 'bg-blue-100 text-blue-700 ring-blue-300' },
    resolvido:    { label: 'Finalizada',   cls: 'bg-green-100 text-green-800 ring-green-300' },
  }
  const c = cfg[status] ?? cfg.aberto
  return (
    <span className={`inline-flex w-full items-center justify-center rounded px-2 py-1 text-[11px] font-semibold ring-1 ${c.cls}`}>
      {c.label}
    </span>
  )
}

function formatarData(data?: string | null) {
  if (!data) return '—'
  const [ano, mes, dia] = data.split('-')
  if (!ano || !mes || !dia) return data
  return `${dia}/${mes}/${ano.slice(2)}`
}

const inputCls =
  'h-10 w-full rounded-xl border border-slate-200 bg-white pr-3 text-sm text-slate-700 ' +
  'outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100'
