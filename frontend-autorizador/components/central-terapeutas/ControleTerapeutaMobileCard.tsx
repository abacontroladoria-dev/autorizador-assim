'use client'

import { useState } from 'react'

import {
  ChevronDown,
  ChevronUp,
  UserRound,
} from 'lucide-react'

import { getHorario, getPaciente } from './helpers'
import type { ControleTerapeuticoItem } from './types'

type StatusDisponibilidade =
  | 'pendente'
  | 'disponivel'
  | 'indisponivel'
  | 'parcial'
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
  abrirModalStatus,
  atualizarStatusDireto,
  salvandoStatus,
}: Props) {
  const [aberto, setAberto] = useState(false)
  const salvando = salvandoStatus

  const status = normalizarStatusDisponibilidade(grupo.status)
  const pendente = status === 'pendente'
  const disponivel = status === 'disponivel'
  const indisponivel = status === 'indisponivel'
  const substituido = status === 'substituido'
  const temSlotCritico = grupo.atendimentos.some(
    (a) => a.status === 'indisponivel' || a.status === 'substituido'
  )
  const parcial = status === 'parcial'
  const indisponivelOuSubstituido = indisponivel || substituido || parcial
  const temPendente = grupo.atendimentos.some(
    (a) => String(a.status ?? '').toLowerCase() === 'pendente'
  )

  const horariosOrdenados = [...grupo.atendimentos].sort((a, b) =>
    String(a.hora_inicial).localeCompare(String(b.hora_inicial))
  )

  const contagem = grupo.atendimentos.reduce(
    (acc, a) => {
      const s = String(a.status ?? '').toLowerCase()
      if (s === 'disponivel') acc.disponivel++
      else if (s === 'indisponivel') acc.indisponivel++
      else if (s === 'substituido') acc.substituido++
      else acc.pendente++
      return acc
    },
    { disponivel: 0, indisponivel: 0, substituido: 0, pendente: 0 }
  )

  const horaInicialGrupo = horariosOrdenados[0]?.hora_inicial
    ? String(horariosOrdenados[0].hora_inicial).slice(0, 5)
    : undefined
  const horaFinalGrupo =
    horariosOrdenados[horariosOrdenados.length - 1]?.hora_final
      ? String(horariosOrdenados[horariosOrdenados.length - 1].hora_final).slice(0, 5)
      : undefined
  const iniciais = getIniciais(grupo.terapeuta)
  const horarioTotal =
    horaInicialGrupo && horaFinalGrupo
      ? `${horaInicialGrupo} – ${horaFinalGrupo}`
      : grupo.primeiroHorario

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── Layout principal ── */}
      <div className="flex items-stretch">

        {/* Coluna esquerda — clicável para expandir */}
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          className="flex-1 text-left px-4 py-4"
        >
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center shrink-0 font-bold text-sm select-none">
              {iniciais}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-800 leading-tight">
                {grupo.terapeuta}
              </h3>
              <p className="text-sm text-[#3A8FB7] font-medium mt-0.5">
                {grupo.terapia}
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                <span className="font-semibold text-slate-700">
                  {grupo.unidade}
                </span>
                <span>·</span>
                <span>{grupo.atendimentos.length} sessões</span>
                <span>·</span>
                <span className="font-bold text-violet-700">{horarioTotal}</span>
              </div>
            </div>
          </div>
        </button>

        {/* Coluna central — chips de status 2×2 */}
        <div className="shrink-0 grid grid-cols-2 gap-1.5 pl-6 pr-12 py-4 content-center">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap text-center ${
            contagem.disponivel > 0
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-50 text-slate-300 border border-slate-100'
          }`}>
            Disponível: {contagem.disponivel}
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap text-center ${
            contagem.indisponivel > 0
              ? 'bg-rose-100 text-rose-700'
              : 'bg-slate-50 text-slate-300 border border-slate-100'
          }`}>
            Indisponível: {contagem.indisponivel}
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap text-center ${
            contagem.substituido > 0
              ? 'bg-sky-100 text-sky-700'
              : 'bg-slate-50 text-slate-300 border border-slate-100'
          }`}>
            Substituída: {contagem.substituido}
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap text-center ${
            contagem.pendente > 0
              ? 'bg-violet-100 text-violet-700'
              : 'bg-slate-50 text-slate-300 border border-slate-100'
          }`}>
            Pendente: {contagem.pendente}
          </span>
        </div>

        {/* Coluna direita — status + botões de ação + chevron */}
        <div className="w-52 shrink-0 flex flex-col items-end px-4 py-4 gap-2">

          {/* Linha 1: status badge + chevron */}
          <div className="flex items-center gap-2">
            <span className={`whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass(status)}`}>
              {statusBadgeLabel(status)}
            </span>
            <button type="button" onClick={() => setAberto(!aberto)} className="text-slate-400">
              {aberto
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />
              }
            </button>
          </div>

          {/* Botões de ação abaixo do status */}
          {pendente && (
            <>
              <button
                type="button"
                disabled={salvando}
                onClick={() => atualizarStatusDireto(grupo, 'disponivel')}
                className="w-full h-8 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 transition hover:bg-emerald-700"
              >
                Disponível
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={() => abrirModalStatus(grupo, 'indisponivel')}
                className="w-full h-8 px-4 rounded-lg bg-rose-600 text-white text-xs font-semibold disabled:opacity-50 transition hover:bg-rose-700"
              >
                Indisponível
              </button>
              {temSlotCritico && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => abrirModalStatus(grupo, 'indisponivel')}
                  className="w-full h-8 px-4 rounded-lg border border-[#3A8FB7] text-[#3A8FB7] text-xs font-semibold disabled:opacity-50 transition hover:bg-[#f0f8fd]"
                >
                  Substituição
                </button>
              )}
            </>
          )}

          {disponivel && (
            <>
              {temPendente && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() =>
                    atualizarStatusDireto(
                      {
                        ...grupo,
                        atendimentos: grupo.atendimentos.filter(
                          (a) => String(a.status ?? '').toLowerCase() === 'pendente'
                        ),
                      },
                      'disponivel'
                    )
                  }
                  className="w-full h-8 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 transition hover:bg-emerald-700"
                >
                  Confirmar pendentes
                </button>
              )}
              <button
                type="button"
                disabled={salvando}
                onClick={() => abrirModalStatus(grupo, 'indisponivel')}
                className="w-full h-8 px-4 rounded-lg border border-rose-300 text-rose-600 text-xs font-semibold disabled:opacity-50 transition hover:bg-rose-50"
              >
                Encerrar disponibilidade
              </button>
            </>
          )}

          {indisponivelOuSubstituido && (
            <>
              <button
                type="button"
                disabled={salvando}
                onClick={() => abrirModalStatus(grupo, 'disponivel')}
                className="w-full h-8 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 transition hover:bg-emerald-700"
              >
                Disponível agora
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={() => abrirModalStatus(grupo, 'indisponivel')}
                className="w-full h-8 px-4 rounded-lg border border-[#3A8FB7] text-[#3A8FB7] text-xs font-semibold disabled:opacity-50 transition hover:bg-[#f0f8fd]"
              >
                Substituição
              </button>
            </>
          )}

        </div>
      </div>

      {/* ── Sessões expandidas ── */}
      {aberto && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {horariosOrdenados.map((item) => (
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
                        ? 'bg-emerald-100 text-emerald-700'
                        : item.status === 'substituido'
                          ? 'bg-sky-100 text-sky-700'
                          : item.status === 'indisponivel'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
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
                    <span className="text-xs text-sky-700 font-medium">
                      {item.profissional_substituto_nome}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

function normalizarStatusDisponibilidade(
  status?: string | null
): StatusDisponibilidade {
  if (
    status === 'disponivel' ||
    status === 'indisponivel' ||
    status === 'parcial' ||
    status === 'substituido'
  ) {
    return status
  }

  return 'pendente'
}

function getIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  }
  return partes[0].slice(0, 2).toUpperCase()
}

function statusBadgeClass(status: StatusDisponibilidade): string {
  switch (status) {
    case 'disponivel':
      return 'bg-emerald-100 text-emerald-700'
    case 'indisponivel':
      return 'bg-rose-100 text-rose-700'
    case 'parcial':
      return 'bg-amber-100 text-amber-700'
    case 'substituido':
      return 'bg-sky-100 text-sky-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function statusBadgeLabel(status: StatusDisponibilidade): string {
  switch (status) {
    case 'disponivel':
      return 'Disponível'
    case 'indisponivel':
      return 'Indisponível'
    case 'parcial':
      return 'Indispon. parcial'
    case 'substituido':
      return 'Substituído'
    default:
      return 'Pendente'
  }
}
