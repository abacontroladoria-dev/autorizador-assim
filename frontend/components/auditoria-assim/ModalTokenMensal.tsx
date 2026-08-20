'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, KeySquare, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { listarTokensMensal, marcarTokenConferido } from '@/services/auditoria-assim.service'
import { LABEL_ERRO_FACIAL, erroReconhecimentoFacial } from './formaValidacao'
import type { TokenMensalItem } from './types'

type Props = {
  open: boolean
  onClose: () => void
}

type Aba = 'pendentes' | 'conferidas' | 'todas'

function primeiroDiaDoMes(ref: Date) {
  return new Date(ref.getFullYear(), ref.getMonth(), 1)
}

function paramMes(ref: Date) {
  const ano = ref.getFullYear()
  const mes = String(ref.getMonth() + 1).padStart(2, '0')
  return `${ano}-${mes}-01`
}

function formatarDia(data: string | null) {
  if (!data) return '—'
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

function formatarDataHora(data: string | null) {
  if (!data) return null
  const d = new Date(data)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Sem acento e sem caixa: "joao" acha "João". */
function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export default function ModalTokenMensal({ open, onClose }: Props) {
  const [mesRef, setMesRef] = useState(() => primeiroDiaDoMes(new Date()))
  const [itens, setItens] = useState<TokenMensalItem[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('pendentes')
  const [busca, setBusca] = useState('')
  const [conferindoBloco, setConferindoBloco] = useState<string | null>(null)
  const [montado, setMontado] = useState(false)

  useEffect(() => setMontado(true), [])

  async function carregar() {
    setLoading(true)
    setErro(null)
    try {
      const dados = await listarTokensMensal(paramMes(mesRef))
      setItens(dados)
    } catch {
      setErro('Não foi possível carregar as conferências deste mês.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mesRef])

  // Dia → horário → paciente: dentro do mesmo horário a ordem é alfabética,
  // que é como a pilha de filipetas da recepção é conferida.
  const ordenados = useMemo(
    () =>
      [...itens].sort((a, b) => {
        const dia = (a.data_atendimento ?? '').localeCompare(b.data_atendimento ?? '')
        if (dia !== 0) return dia
        const hora = (a.hora_inicial ?? '').localeCompare(b.hora_inicial ?? '')
        if (hora !== 0) return hora
        return (a.paciente_nome ?? '').localeCompare(b.paciente_nome ?? '', 'pt-BR')
      }),
    [itens]
  )

  // A busca recorta a base inteira — contagens das abas e progresso acompanham,
  // como os KPIs da página acompanham o filtro de paciente.
  const base = useMemo(() => {
    const termo = normalizar(busca.trim())
    if (!termo) return ordenados
    return ordenados.filter((i) =>
      // A forma entra no lastro para que a linha de erro facial seja
      // encontrável pelo texto que ela mostra no lugar do número.
      [i.paciente_nome, i.guia, i.token, i.forma_autorizacao].some(
        (campo) => campo && normalizar(campo).includes(termo)
      )
    )
  }, [ordenados, busca])

  const conferidas = useMemo(() => base.filter((i) => i.token_conferido), [base])
  const pendentes = useMemo(() => base.filter((i) => !i.token_conferido), [base])

  const visiveis = aba === 'pendentes' ? pendentes : aba === 'conferidas' ? conferidas : base

  const total = base.length
  const totalMes = ordenados.length
  const buscando = busca.trim().length > 0
  const progresso = total > 0 ? Math.round((conferidas.length / total) * 100) : 0

  if (!open || !montado) return null

  async function handleToggle(item: TokenMensalItem) {
    if (!item.bloco_id) return
    const proximo = !item.token_conferido
    setConferindoBloco(item.bloco_id)
    try {
      await marcarTokenConferido(item.bloco_id, proximo)
      setItens((prev) =>
        prev.map((i) =>
          i.bloco_id === item.bloco_id
            ? { ...i, token_conferido: proximo, token_conferido_em: proximo ? new Date().toISOString() : null }
            : i
        )
      )
    } catch {
      toast.error('Erro ao marcar conferência. Tente novamente.')
    } finally {
      setConferindoBloco(null)
    }
  }

  const labelMes = mesRef
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase())

  const abas: { id: Aba; label: string; count: number }[] = [
    { id: 'pendentes', label: 'Pendentes', count: pendentes.length },
    { id: 'conferidas', label: 'Conferidas', count: conferidas.length },
    { id: 'todas', label: 'Todas', count: total },
  ]

  // Portal para document.body: o card de filtros que renderiza este modal tem
  // backdrop-blur, e backdrop-filter cria containing block para descendentes
  // `fixed` — sem o portal, o inset-0 se ancora na barra de filtros (~70px de
  // altura) em vez da viewport, e o modal colapsa.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-6 pb-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <KeySquare size={19} className="text-brand" />
              Conferência de filipetas
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Atendimentos do mês com filipeta ou erro de reconhecimento facial. Marque cada papel conferido.
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

        {/* Mês + progresso da conferência */}
        <div className="flex items-center gap-6 border-t border-slate-100 px-8 py-4">
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setMesRef((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="w-36 text-center text-sm font-semibold text-slate-700">{labelMes}</span>
            <button
              onClick={() => setMesRef((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {!loading && !erro && total > 0 && (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-amber-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <span className="shrink-0 text-sm font-semibold whitespace-nowrap text-slate-700 tabular-nums">
                {conferidas.length}/{total} conferidas
              </span>
            </div>
          )}
        </div>

        {/* Abas + busca */}
        {!loading && !erro && totalMes > 0 && (
          <div className="flex items-center gap-3 border-t border-slate-100 px-8 py-3">
            <div className="flex flex-1 flex-wrap gap-1.5">
              {abas.map((a) => {
                const ativa = aba === a.id
                const cor =
                  a.id === 'pendentes'
                    ? ativa ? 'bg-amber-500 text-white' : 'text-amber-700 hover:bg-amber-50'
                    : a.id === 'conferidas'
                      ? ativa ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'
                      : ativa ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                return (
                  <button
                    key={a.id}
                    onClick={() => setAba(a.id)}
                    className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${cor}`}
                  >
                    {a.label}
                    <span className={`ml-1.5 tabular-nums ${ativa ? 'opacity-80' : 'opacity-60'}`}>{a.count}</span>
                  </button>
                )
              })}
            </div>

            <div className="relative w-72 shrink-0">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input
                // `type="text"`, não `search`: o Chrome desenha o próprio X e
                // ficariam dois botões de limpar lado a lado.
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Paciente, guia ou token"
                aria-label="Buscar por paciente, guia ou token"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-8 pl-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
              />
              {buscando && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  aria-label="Limpar busca"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50/60 px-7 py-4">
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-white" />
              ))}
              <p className="pt-3 text-center text-xs text-slate-400">
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

          {!loading && !erro && totalMes === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-20 text-center">
              <KeySquare size={22} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-500">Nada para conferir neste mês</p>
              <p className="text-xs text-slate-400">
                Nenhuma filipeta nem erro de reconhecimento facial em {labelMes}.
              </p>
            </div>
          )}

          {!loading && !erro && totalMes > 0 && total === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <Search size={22} className="text-slate-300" />
              <div>
                <p className="text-sm font-medium text-slate-500">Nenhum resultado para “{busca.trim()}”</p>
                <p className="text-xs text-slate-400">
                  {totalMes} conferência(s) em {labelMes} — nenhuma bate com paciente, guia ou token.
                </p>
              </div>
              <button
                onClick={() => setBusca('')}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Limpar busca
              </button>
            </div>
          )}

          {!loading && !erro && total > 0 && visiveis.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-20 text-center">
              <Check size={22} className="text-emerald-400" />
              <p className="text-sm font-medium text-slate-600">
                {aba === 'pendentes' ? 'Tudo do mês já foi conferido' : 'Nada conferido ainda'}
              </p>
              <p className="text-xs text-slate-400">
                {aba === 'pendentes' ? `${total} de ${total} em ${labelMes}.` : 'Comece pela aba Pendentes.'}
              </p>
            </div>
          )}

          {!loading && !erro && visiveis.length > 0 && (
            <ul className="space-y-1.5">
              {visiveis.map((item) => {
                const conferido = Boolean(item.token_conferido)
                return (
                  <li
                    key={item.bloco_id}
                    className={`flex items-center gap-4 overflow-hidden rounded-xl border bg-white pr-4 shadow-sm transition ${
                      conferido ? 'border-slate-200/80' : 'border-amber-200'
                    }`}
                  >
                    {/* Trilho de status: verde conferido, âmbar pendente */}
                    <span className={`w-1.5 self-stretch ${conferido ? 'bg-emerald-500' : 'bg-amber-400'}`} />

                    <div className="w-16 shrink-0 py-3.5 text-sm font-semibold text-slate-700 tabular-nums">
                      {formatarDia(item.data_atendimento)}
                    </div>

                    <div className="w-14 shrink-0 text-sm text-slate-500 tabular-nums">
                      {item.hora_inicial?.slice(0, 5) ?? '—'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{item.paciente_nome ?? '—'}</p>
                      <p className="truncate text-xs text-slate-400">{item.terapias ?? '—'}</p>
                    </div>

                    <div className="hidden w-44 shrink-0 lg:block">
                      <p className="truncate text-sm text-slate-600">{item.criado_por ?? '—'}</p>
                      <p className="text-xs text-slate-400">Solicitou</p>
                    </div>

                    {/* Guia primeiro: é a chave de conferência contra o papel;
                        o token é o detalhe que a acompanha. Sem token, a forma
                        de validação explica a ausência — e só quando não há
                        explicação nenhuma é que o alerta vermelho aparece. */}
                    <div className="w-52 shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-800 tabular-nums">
                        <span className="mr-1 text-[11px] font-medium text-slate-400">Guia</span>
                        {item.guia ?? '—'}
                      </p>
                      {item.token ? (
                        <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                          <span className="mr-1 font-sans text-slate-400">Token</span>
                          {item.token}
                        </p>
                      ) : erroReconhecimentoFacial(item.forma_autorizacao) ? (
                        <p className="text-[11px] whitespace-nowrap text-slate-500">{LABEL_ERRO_FACIAL}</p>
                      ) : (
                        <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                          <AlertTriangle size={10} />
                          Sem token
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleToggle(item)}
                      disabled={conferindoBloco === item.bloco_id}
                      title={
                        conferido
                          ? `Conferida${item.token_conferido_por_nome ? ` por ${item.token_conferido_por_nome}` : ''}${item.token_conferido_em ? ` em ${formatarDataHora(item.token_conferido_em)}` : ''} — clique para desmarcar`
                          : 'Marcar este papel como conferido'
                      }
                      className={`inline-flex w-32 shrink-0 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                        conferido
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-amber-500 text-white hover:bg-amber-600'
                      }`}
                    >
                      {conferindoBloco === item.bloco_id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : conferido ? (
                        <Check size={13} />
                      ) : null}
                      {conferido ? 'Conferida' : 'Conferir'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-100 px-8 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
