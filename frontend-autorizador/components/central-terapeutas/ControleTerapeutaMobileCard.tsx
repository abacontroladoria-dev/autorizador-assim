'use client'

import {
  useEffect,
  useState,
} from 'react'

import {
  listarModalSubstituicao,
  type SlotModalSubstituicao,
} from '@/services/controle-terapeutico.service'

import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Search,
  UserRound,
  X,
} from 'lucide-react'

import {
  getHorario,
  getPaciente,
} from './helpers'

import type {
  ControleTerapeuticoItem,
} from './types'
import { atualizarStatusAtendimentosEmLote } from '@/services/controle-terapeutico.service'

type StatusDisponibilidade =
  | 'pendente'
  | 'disponivel'
  | 'indisponivel'
  | 'substituido'

type GrupoTerapeutaMobile = {
  terapeuta: string
  terapia: string
  unidade: string
  primeiroHorario: string
  status: string
  substituto?: string
  atendimentos: ControleTerapeuticoItem[]
}

type ProfissionalAgrupado = {
  id: number
  nome: string
  slots: SlotModalSubstituicao[]
}

type Props = {
  grupo: GrupoTerapeutaMobile
  onStatusChanged?: () => void
  abrirModalStatus: (
    grupo: GrupoTerapeutaMobile,
    status: StatusDisponibilidade
  ) => void
  atualizarStatusDireto: (
    grupo: GrupoTerapeutaMobile,
    status: StatusDisponibilidade
  ) => void
  salvandoStatus: boolean
}

export default function ControleTerapeutaMobileCard({
  grupo,
  onStatusChanged,
  abrirModalStatus,
  atualizarStatusDireto,
  salvandoStatus,
}: Props) {
  const [aberto, setAberto] = useState(false)
  const salvando = salvandoStatus
  const [modalSubstituicao, setModalSubstituicao] = useState(false)
  const [buscaSubstituto, setBuscaSubstituto] = useState('')
  const [substitutoSelecionado, setSubstitutoSelecionado] = useState<{ nome: string; id: number } | null>(null)
  const [horariosSubstituicao, setHorariosSubstituicao] = useState<{ id: number; horario: string; paciente: string; selecionado: boolean }[]>([])
  const [substitutosDisponiveis, setSubstitutosDisponiveis] = useState<SlotModalSubstituicao[]>([])
  const [carregandoSubstitutos, setCarregandoSubstitutos] = useState(false)
  const [profissionaisSelecionados, setProfissionaisSelecionados] = useState<Set<number>>(new Set())
  const [filaConfirmacao, setFilaConfirmacao] = useState<ProfissionalAgrupado[]>([])

  const status = normalizarStatusDisponibilidade(grupo.status)
  const pendente = status === 'pendente'
  const disponivel = status === 'disponivel'
  const indisponivel = status === 'indisponivel'
  const substituido = status === 'substituido'
  const temSlotCritico = grupo.atendimentos.some(
    (a) => a.status === 'indisponivel' || a.status === 'substituido'
  )
  const indisponivelOuSubstituido = indisponivel || substituido

  const horariosOrdenados = [...grupo.atendimentos].sort((a, b) =>
    String(a.hora_inicial).localeCompare(String(b.hora_inicial))
  )

  const horaInicialGrupo = horariosOrdenados[0]?.hora_inicial ?? undefined
  const horaFinalGrupo = horariosOrdenados[horariosOrdenados.length - 1]?.hora_final ?? undefined
  const unidadeGrupo = Number(horariosOrdenados[0]?.id_unidade)

  function fecharModalSubstituicao() {
    setModalSubstituicao(false)
    setSubstitutoSelecionado(null)
    setBuscaSubstituto('')
    setHorariosSubstituicao([])
    setProfissionaisSelecionados(new Set())
    setFilaConfirmacao([])
  }

  function selecionarProfissional(nome: string, id: number) {
    const horarios = [...grupo.atendimentos]
      .sort((a, b) => String(a.hora_inicial).localeCompare(String(b.hora_inicial)))
      .map((item) => ({
        id: item.tita_agendamento_id as number,
        horario: `${item.hora_inicial ?? ''}${item.hora_final ? ` – ${item.hora_final}` : ''}`,
        paciente: getPaciente(item),
        selecionado: true,
      }))

    setSubstitutoSelecionado({ nome, id })
    setHorariosSubstituicao(horarios)
  }

  function toggleHorarioSubstituicao(id: number, checked: boolean) {
    setHorariosSubstituicao((prev) =>
      prev.map((h) => (h.id === id ? { ...h, selecionado: checked } : h))
    )
  }

  async function confirmarSubstituicao() {
    if (!substitutoSelecionado) return

    const ids = horariosSubstituicao
      .filter((h) => h.selecionado)
      .map((h) => h.id)
      .filter(Boolean)

    if (ids.length === 0) return

    try {
      const resultado = await atualizarStatusAtendimentosEmLote({
        tita_agendamento_ids: ids,
        status: 'substituido',
        profissional_substituto_nome: substitutoSelecionado.nome,
      })

      if (!resultado) return

      const indiceAtual = filaConfirmacao.findIndex((p) => p.id === substitutoSelecionado.id)
      const proximo = filaConfirmacao[indiceAtual + 1]

      if (proximo) {
        selecionarProfissional(proximo.nome, proximo.id)
      } else {
        fecharModalSubstituicao()
        onStatusChanged?.()
      }
    } catch (err) {
      console.error('Erro ao salvar substituto:', err)
    }
  }

  useEffect(() => {
    if (!modalSubstituicao || substitutoSelecionado) return

    const terapiaRaw =
      (grupo.atendimentos[0] as any)?.terapia_exibicao_nome ||
      (grupo.atendimentos[0] as any)?.terapia_exibicao ||
      grupo.terapia

    // Aplicador ABA (qualquer variante) é coberto por Psicologia ABA
    const terapiaExibicaoNome = terapiaRaw?.startsWith('Aplicador ABA')
      ? 'Psicologia ABA'
      : terapiaRaw

    setCarregandoSubstitutos(true)

    listarModalSubstituicao({ terapiaExibicaoNome, unidade: grupo.unidade })
      .then((data) => {
        setSubstitutosDisponiveis(
          data.filter((item) => item.profissional_nome !== grupo.terapeuta)
        )
      })
      .finally(() => setCarregandoSubstitutos(false))
  }, [modalSubstituicao, substitutoSelecionado, grupo])

  useEffect(() => {
    if (modalSubstituicao) {
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [modalSubstituicao])

  const profissionaisAgrupados: ProfissionalAgrupado[] = (() => {
    const map = new Map<number, ProfissionalAgrupado>()
    for (const slot of substitutosDisponiveis) {
      if (!map.has(slot.profissional_id)) {
        map.set(slot.profissional_id, { id: slot.profissional_id, nome: slot.profissional_nome, slots: [] })
      }
      map.get(slot.profissional_id)!.slots.push(slot)
    }
    return Array.from(map.values())
  })()

  const profissionaisFiltrados = profissionaisAgrupados.filter((p) =>
    !buscaSubstituto || p.nome.toLowerCase().includes(buscaSubstituto.toLowerCase())
  )

  const todosMarcados =
    profissionaisFiltrados.length > 0 &&
    profissionaisFiltrados.every((p) => profissionaisSelecionados.has(p.id))

  function toggleSelecionarProfissional(id: number) {
    setProfissionaisSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMarcarTodos() {
    if (todosMarcados) {
      setProfissionaisSelecionados(new Set())
    } else {
      setProfissionaisSelecionados(new Set(profissionaisFiltrados.map((p) => p.id)))
    }
  }

  function iniciarConfirmacao() {
    const fila = profissionaisFiltrados.filter((p) => profissionaisSelecionados.has(p.id))
    if (fila.length === 0) return
    setFilaConfirmacao(fila)
    selecionarProfissional(fila[0].nome, fila[0].id)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full text-left p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800 leading-tight">
              {grupo.terapeuta}
            </h3>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{grupo.atendimentos.length} atendimentos</span>
              <span>{grupo.unidade}</span>
            </div>

            <p className="text-sm text-[#3A8FB7] font-medium mt-3">
              {grupo.terapia}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="text-xs font-bold text-violet-700">
              {grupo.primeiroHorario}
            </span>

            <span
              className={`text-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold ${
                status === 'disponivel'
                  ? 'bg-green-100 text-green-700'
                  : status === 'substituido'
                    ? 'bg-amber-100 text-amber-700'
                    : status === 'indisponivel'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
              }`}
            >
              {status === 'disponivel'
                ? 'Disponível'
                : status === 'substituido'
                  ? 'Substituído'
                  : status === 'indisponivel'
                    ? 'Indisponível'
                    : 'Aguardando status'}
            </span>

            {aberto ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
      </button>

      {aberto && (
        <>
          <div className="border-t border-slate-100 divide-y divide-slate-100">
            {grupo.atendimentos.map((item) => (
              <div
                key={item.tita_agendamento_id}
                className="p-4 flex items-center gap-3"
              >
                <div className="h-10 w-10 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center shrink-0">
                  <UserRound className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">
                      {getPaciente(item)}
                    </span>

                    <span className="text-xs text-[#3A8FB7] font-semibold">
                      {getHorario(item)}
                    </span>

                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        item.status === 'disponivel'
                          ? 'bg-green-100 text-green-700'
                          : item.status === 'substituido'
                            ? 'bg-amber-100 text-amber-700'
                            : item.status === 'indisponivel'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {item.status === 'disponivel'
                        ? 'Disponível'
                        : item.status === 'substituido'
                          ? 'Substituído'
                          : item.status === 'indisponivel'
                            ? 'Indisponível'
                            : 'Pendente'}
                    </span>

                    {item.status === 'substituido' && item.profissional_substituto_nome && (
                      <span className="text-xs text-amber-700 font-medium">
                        {item.profissional_substituto_nome}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-50 flex gap-2">
            {pendente && (
              <>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => abrirModalStatus(grupo, 'disponivel')}
                  className="flex-1 h-11 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Disponível
                </button>

                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => abrirModalStatus(grupo, 'indisponivel')}
                  className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Indisponível
                </button>

                {temSlotCritico && (
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => setModalSubstituicao(true)}
                    className="px-4 rounded-xl border border-[#3A8FB7] text-[#3A8FB7] text-sm font-semibold disabled:opacity-50"
                  >
                    Substituição
                  </button>
                )}
              </>
            )}

            {disponivel && (
              <button
                type="button"
                disabled={salvando}
                onClick={() => abrirModalStatus(grupo, 'indisponivel')}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                Encerrar disponibilidade
              </button>
            )}

            {indisponivelOuSubstituido && (
              <>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => abrirModalStatus(grupo, 'disponivel')}
                  className="flex-1 h-11 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Disponível agora
                </button>

                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setModalSubstituicao(true)}
                  className="px-4 rounded-xl border border-[#3A8FB7] text-[#3A8FB7] text-sm font-semibold disabled:opacity-50"
                >
                  Substituição
                </button>
              </>
            )}
          </div>
        </>
      )}

      {modalSubstituicao && (
        <div
          onClick={fecharModalSubstituicao}
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center md:justify-center p-0 md:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full md:w-180 rounded-t-3xl md:rounded-3xl p-4 max-h-[85vh] overflow-auto shadow-2xl"
          >
            {substitutoSelecionado === null ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">Selecionar substituto</h3>
                  <button type="button" onClick={fecharModalSubstituicao}>
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    value={buscaSubstituto}
                    onChange={(event) => setBuscaSubstituto(event.target.value)}
                    placeholder="Buscar profissional..."
                    className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm"
                  />
                </div>

                {!carregandoSubstitutos && profissionaisFiltrados.length > 0 && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={toggleMarcarTodos}
                      className="text-xs text-[#3A8FB7] font-semibold hover:underline"
                    >
                      {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  </div>
                )}

                {carregandoSubstitutos ? (
                  <div className="py-10 text-center text-sm text-slate-500">Carregando...</div>
                ) : (
                  <div className="mt-2 space-y-3">
                    {profissionaisFiltrados.map((profissional) => {
                      const selecionado = profissionaisSelecionados.has(profissional.id)
                      return (
                        <button
                          key={profissional.id}
                          type="button"
                          onClick={() => toggleSelecionarProfissional(profissional.id)}
                          className={`w-full text-left border rounded-xl p-3 transition-colors ${
                            selecionado
                              ? 'border-[#3A8FB7] bg-[#f0f8fd]'
                              : 'border-slate-200 hover:border-[#3A8FB7] hover:bg-[#f0f8fd]'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${
                              selecionado ? 'border-[#3A8FB7] bg-[#3A8FB7]' : 'border-slate-300'
                            }`}>
                              {selecionado && (
                                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                  <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-800 mb-2">{profissional.nome}</p>
                              <div className="space-y-1">
                                {profissional.slots.map((slot, i) => {
                                  if (slot.status_slot === 'sem_agenda_hoje') {
                                    return (
                                      <div key={i} className="flex items-center gap-2 text-xs">
                                        <div className="w-2 h-2 rounded-full shrink-0 bg-slate-300" />
                                        <span className="text-slate-400 italic">Não trabalha hoje</span>
                                      </div>
                                    )
                                  }
                                  const livre = slot.status_slot?.toLowerCase() === 'livre'
                                  return (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      <div className={`w-2 h-2 rounded-full shrink-0 ${livre ? 'bg-green-500' : 'bg-red-500'}`} />
                                      <span className="text-slate-400 w-12 shrink-0 tabular-nums">{slot.hora}</span>
                                      <span className="text-slate-600 truncate">
                                        {livre ? 'LIVRE' : `${slot.paciente_nome ?? ''}${slot.sala_nome ? ` · ${slot.sala_nome}` : ''}`}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                    {profissionaisFiltrados.length === 0 && (
                      <div className="py-10 text-center text-sm text-slate-500">
                        Nenhum profissional encontrado para essa terapia e unidade.
                      </div>
                    )}
                  </div>
                )}

                {profissionaisSelecionados.size > 0 && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={iniciarConfirmacao}
                      className="w-full h-11 rounded-xl bg-[#3A8FB7] text-white text-sm font-semibold"
                    >
                      Confirmar seleção ({profissionaisSelecionados.size})
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSubstitutoSelecionado(null)}
                      className="p-1 rounded-lg hover:bg-slate-100"
                    >
                      <ArrowLeft className="h-4 w-4 text-slate-600" />
                    </button>
                    <div>
                      <h3 className="font-bold text-slate-800 leading-tight">
                        Horários com {substitutoSelecionado.nome}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {filaConfirmacao.length > 1
                          ? `${filaConfirmacao.findIndex((p) => p.id === substitutoSelecionado.id) + 1} de ${filaConfirmacao.length} · Selecione os horários`
                          : 'Selecione quais horários serão cobertos'}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={fecharModalSubstituicao}>
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const todosMarados = horariosSubstituicao.every((h) => h.selecionado)
                      setHorariosSubstituicao((prev) =>
                        prev.map((h) => ({ ...h, selecionado: !todosMarados }))
                      )
                    }}
                    className="text-xs text-[#3A8FB7] font-semibold hover:underline"
                  >
                    {horariosSubstituicao.every((h) => h.selecionado) ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  {horariosSubstituicao.map((h) => (
                    <label
                      key={h.id}
                      className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={h.selecionado}
                        onChange={(e) => toggleHorarioSubstituicao(h.id, e.target.checked)}
                        className="h-4 w-4 rounded accent-[#3A8FB7]"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-violet-700">{h.horario}</span>
                          <span className="text-sm font-semibold text-slate-800">{h.paciente}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    disabled={salvando || horariosSubstituicao.every((h) => !h.selecionado)}
                    onClick={confirmarSubstituicao}
                    className="w-full h-11 rounded-xl bg-[#3A8FB7] text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {salvando ? 'Salvando...' : 'Confirmar substituição'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function normalizarStatusDisponibilidade(
  status?: string | null
): StatusDisponibilidade {
  if (status === 'disponivel' || status === 'indisponivel' || status === 'substituido') {
    return status
  }

  return 'pendente'
}
