'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, KeySquare, Loader2, RefreshCw, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { listarTokensMensal, marcarTokenConferido } from '@/services/auditoria-assim.service'
import type { TokenMensalItem } from './types'

type Props = {
  open: boolean
  onClose: () => void
}

type DiaGrupo = {
  chave: string
  label: string
  itens: TokenMensalItem[]
  conferidos: number
}

function primeiroDiaDoMes(ref: Date) {
  return new Date(ref.getFullYear(), ref.getMonth(), 1)
}

function paramMes(ref: Date) {
  const ano = ref.getFullYear()
  const mes = String(ref.getMonth() + 1).padStart(2, '0')
  return `${ano}-${mes}-01`
}

function labelDia(data: string) {
  const [ano, mes, dia] = data.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

function formatarDataHora(data: string | null) {
  if (!data) return null
  const d = new Date(data)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function ModalTokenMensal({ open, onClose }: Props) {
  const [mesRef, setMesRef] = useState(() => primeiroDiaDoMes(new Date()))
  const [itens, setItens] = useState<TokenMensalItem[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [conferindoBloco, setConferindoBloco] = useState<string | null>(null)
  const diaRefs = useRef(new Map<string, HTMLDivElement>())

  async function carregar() {
    setLoading(true)
    setErro(null)
    try {
      const dados = await listarTokensMensal(paramMes(mesRef))
      setItens(dados)
    } catch {
      setErro('Não foi possível carregar os tokens deste mês.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mesRef])

  const grupos = useMemo<DiaGrupo[]>(() => {
    const mapa = new Map<string, TokenMensalItem[]>()
    for (const item of itens) {
      const chave = item.data_atendimento ?? '—'
      if (!mapa.has(chave)) mapa.set(chave, [])
      mapa.get(chave)!.push(item)
    }
    return Array.from(mapa.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, lista]) => ({
        chave,
        label: chave === '—' ? 'Sem data' : labelDia(chave),
        itens: [...lista].sort((a, b) => (a.hora_inicial ?? '').localeCompare(b.hora_inicial ?? '')),
        conferidos: lista.filter((i) => i.token_conferido).length,
      }))
  }, [itens])

  const total = itens.length
  const totalConferidos = itens.filter((i) => i.token_conferido).length
  const totalPendentes = total - totalConferidos
  const semTokenRegistrado = itens.filter((i) => !i.token).length

  if (!open) return null

  async function handleToggle(item: TokenMensalItem, checked: boolean) {
    if (!item.bloco_id) return
    setConferindoBloco(item.bloco_id)
    try {
      await marcarTokenConferido(item.bloco_id, checked)
      setItens((prev) =>
        prev.map((i) =>
          i.bloco_id === item.bloco_id
            ? { ...i, token_conferido: checked, token_conferido_em: checked ? new Date().toISOString() : null }
            : i
        )
      )
    } catch {
      toast.error('Erro ao marcar conferência. Tente novamente.')
    } finally {
      setConferindoBloco(null)
    }
  }

  function irParaDia(chave: string) {
    diaRefs.current.get(chave)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const labelMes = mesRef
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-7 pt-6 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <KeySquare size={19} className="text-indigo-500" />
              Token mensal
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Todas as filipetas do mês, para conferir uma a uma contra o papel.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navegador de mês */}
        <div className="flex items-center justify-between border-t border-slate-100 px-7 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMesRef((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="w-40 text-center text-sm font-semibold text-slate-700">{labelMes}</span>
            <button
              onClick={() => setMesRef((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {!loading && !erro && total > 0 && (
            <div className="flex items-center gap-3 text-xs">
              {semTokenRegistrado > 0 && (
                <span className="flex items-center gap-1 font-medium text-rose-600">
                  <AlertTriangle size={12} />
                  {semTokenRegistrado} sem token registrado
                </span>
              )}
              <span className={`font-semibold ${totalPendentes > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {totalPendentes > 0 ? `${totalPendentes} de ${total} pendentes` : `${total} conferidos`}
              </span>
            </div>
          )}
        </div>

        {/* Ledger diário: cada segmento é 1 dia com token no mês; clicar rola até lá */}
        {!loading && !erro && grupos.length > 0 && (
          <div className="flex gap-1 border-t border-slate-100 px-7 py-3">
            {grupos.map((g) => {
              const completo = g.conferidos === g.itens.length
              return (
                <button
                  key={g.chave}
                  onClick={() => irParaDia(g.chave)}
                  title={`${g.label} — ${g.conferidos}/${g.itens.length} conferidos`}
                  className={`h-6 flex-1 rounded-md transition hover:opacity-80 ${
                    completo ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              )
            })}
          </div>
        )}

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          {loading && (
            <div className="space-y-5">
              {Array.from({ length: 3 }).map((_, g) => (
                <div key={g} className="space-y-2">
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-18 animate-pulse rounded-xl bg-white" />
                  ))}
                </div>
              ))}
              <p className="pt-2 text-center text-xs text-slate-400">
                Consultando o mês inteiro — isso pode levar alguns segundos.
              </p>
            </div>
          )}

          {!loading && erro && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <AlertTriangle size={24} className="text-rose-400" />
              <div>
                <p className="text-sm font-medium text-slate-700">{erro}</p>
                <p className="text-xs text-slate-400">A consulta do mês inteiro pode demorar sob carga.</p>
              </div>
              <button
                onClick={carregar}
                className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={13} />
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !erro && total === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-20 text-center">
              <KeySquare size={22} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-500">Nenhum token neste mês</p>
              <p className="text-xs text-slate-400">Nenhuma autorização via filipeta foi registrada em {labelMes}.</p>
            </div>
          )}

          {!loading && !erro && grupos.length > 0 && (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g.chave} ref={(el) => { if (el) diaRefs.current.set(g.chave, el) }}>
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{g.label}</p>
                    <span className={`text-[11px] font-medium ${
                      g.conferidos === g.itens.length ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {g.conferidos}/{g.itens.length}
                    </span>
                  </div>

                  <ul className="space-y-1.5">
                    {g.itens.map((item) => (
                      <li
                        key={item.bloco_id}
                        className={`flex items-center gap-4 rounded-xl border bg-white px-4 py-3 shadow-sm ${
                          item.token_conferido ? 'border-slate-100' : 'border-amber-200 bg-amber-50/40'
                        }`}
                      >
                        <div className="w-14 shrink-0 text-sm font-medium tabular-nums text-slate-600">
                          {item.hora_inicial?.slice(0, 5) ?? '—'}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{item.paciente_nome ?? '—'}</p>
                          <p className="truncate text-xs text-slate-400">
                            {item.terapias ?? '—'}
                            {item.criado_por ? ` · Solicitado por ${item.criado_por}` : ''}
                          </p>
                        </div>

                        <div className="w-40 shrink-0 text-right">
                          <p className="text-[11px] text-slate-400">Guia {item.guia ?? '—'}</p>
                          {item.token ? (
                            <p className="font-mono text-sm tabular-nums text-slate-700">{item.token}</p>
                          ) : (
                            <p className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                              <AlertTriangle size={11} />
                              Sem token
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => handleToggle(item, !item.token_conferido)}
                          disabled={conferindoBloco === item.bloco_id}
                          title={
                            item.token_conferido
                              ? `Conferido${item.token_conferido_por_nome ? ` por ${item.token_conferido_por_nome}` : ''}${item.token_conferido_em ? ` em ${formatarDataHora(item.token_conferido_em)}` : ''}`
                              : 'Marcar filipeta como conferida'
                          }
                          className={`inline-flex w-28 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                            item.token_conferido
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {conferindoBloco === item.bloco_id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : item.token_conferido ? (
                            <Check size={13} />
                          ) : null}
                          {item.token_conferido ? 'Conferido' : 'Conferir'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-100 px-7 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
