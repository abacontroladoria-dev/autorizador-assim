'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  Clock,
  MapPin,
  Users,
  X,
} from 'lucide-react'
import {
  listarModalSubstituicao,
  atualizarStatusAtendimentosEmLote,
  type SlotModalSubstituicao,
} from '@/services/controle-terapeutico.service'
import type { GrupoTerapeutaMobile, ControleTerapeuticoItem } from './types'
import { getPaciente } from './helpers'
import ProfissionaisVerMaisModal from './ProfissionaisVerMaisModal'

type SessaoCobertura = {
  id: number
  atendimento: ControleTerapeuticoItem
  disponivel: boolean | null   // null = não decidido (pendente)
  substitutoId: number | null
  substitutoNome: string | null
}

type Props = {
  grupo: GrupoTerapeutaMobile | null
  data: string
  onClose: () => void
  onSuccess: () => void
}

export default function CoberturaModal({ grupo, data, onClose, onSuccess }: Props) {
  const [etapa, setEtapa] = useState<'motivo' | 'cobertura'>('motivo')
  const [motivo, setMotivo] = useState('')
  const [sessoes, setSessoes] = useState<SessaoCobertura[]>([])
  const [profissionais, setProfissionais] = useState<SlotModalSubstituicao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState<'manha' | 'tarde'>('manha')
  const [verMaisSessao, setVerMaisSessao] = useState<SessaoCobertura | null>(null)

  useEffect(() => {
    if (!grupo) return

    const jaIndisponivel = grupo.atendimentos.some((a) => {
      const s = String(a.status ?? '').toLowerCase()
      return s === 'indisponivel' || s === 'substituido'
    })
    setEtapa(jaIndisponivel ? 'cobertura' : 'motivo')
    setMotivo('')
    document.body.style.overflow = 'hidden'

    const ordenados = [...grupo.atendimentos].sort((a, b) =>
      String(a.hora_inicial).localeCompare(String(b.hora_inicial))
    )

    setSessoes(
      ordenados.map((a) => {
        const s = String(a.status ?? '').toLowerCase()
        const isSubstituido = s === 'substituido'
        return {
          id: a.tita_agendamento_id as number,
          atendimento: a,
          disponivel: s === 'disponivel' ? true : s === 'indisponivel' ? false : null,
          substitutoId: isSubstituido
            ? (a.profissional_substituto_id as number | null) ?? null
            : null,
          substitutoNome: isSubstituido
            ? a.profissional_substituto_nome ?? null
            : null,
        }
      })
    )

    const terapiaRaw =
      (grupo.atendimentos[0] as any)?.terapia_exibicao_nome ||
      (grupo.atendimentos[0] as any)?.terapia_exibicao ||
      grupo.terapiaExibicao ||
      grupo.terapia

    const terapiaExibicaoNome = terapiaRaw?.startsWith('Aplicador ABA')
      ? 'Psicologia ABA'
      : terapiaRaw

    setCarregando(true)
    listarModalSubstituicao({ terapiaExibicaoNome: terapiaExibicaoNome || '', unidade: grupo.unidade })
      .then((data) => {
        const semTerapeuta = data.filter((p) => p.profissional_nome !== grupo.terapeuta)
        setProfissionais(semTerapeuta)
        // Resolve substitutoId por nome para sessões pré-carregadas sem ID
        setSessoes((prev) => prev.map((s) => {
          if (s.substitutoNome && !s.substitutoId) {
            const prof = semTerapeuta.find((p) => p.profissional_nome === s.substitutoNome)
            if (prof) return { ...s, substitutoId: prof.profissional_id }
          }
          return s
        }))
      })
      .finally(() => setCarregando(false))

    const temManha = ordenados.some((a) => String(a.hora_inicial).slice(0, 5) < '13:00')
    setAbaAtiva(temManha ? 'manha' : 'tarde')

    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [grupo])

  const sessoesManha = useMemo(
    () => sessoes.filter((s) => String(s.atendimento.hora_inicial).slice(0, 5) < '13:00'),
    [sessoes]
  )
  const sessoesTarde = useMemo(
    () => sessoes.filter((s) => String(s.atendimento.hora_inicial).slice(0, 5) >= '13:00'),
    [sessoes]
  )
  const sessoesExibidas = abaAtiva === 'manha' ? sessoesManha : sessoesTarde
  const semCobertura = sessoes.filter((s) => s.disponivel === false && !s.substitutoId).length
  const totalDisponiveis = sessoes.filter((s) => s.disponivel).length

  const horaInicial = sessoes[0]?.atendimento.hora_inicial
    ? String(sessoes[0].atendimento.hora_inicial).slice(0, 5)
    : ''
  const horaFinal = sessoes[sessoes.length - 1]?.atendimento.hora_final
    ? String(sessoes[sessoes.length - 1].atendimento.hora_final).slice(0, 5)
    : ''

  function selecionarSubstituto(sessaoId: number, profId: number | null, profNome: string | null) {
    setSessoes((prev) =>
      prev.map((s) =>
        s.id === sessaoId ? { ...s, disponivel: false, substitutoId: profId, substitutoNome: profNome } : s
      )
    )
  }

  function marcarDisponivel(sessaoId: number) {
    setSessoes((prev) =>
      prev.map((s) =>
        s.id === sessaoId ? { ...s, disponivel: true, substitutoId: null, substitutoNome: null } : s
      )
    )
  }

  async function handleConfirmar() {
    setSalvando(true)
    try {
      const promessas: Promise<any>[] = []

      const disponiveisIds = sessoes.filter((s) => s.disponivel).map((s) => s.id)
      if (disponiveisIds.length > 0) {
        promessas.push(
          atualizarStatusAtendimentosEmLote({
            tita_agendamento_ids: disponiveisIds,
            status: 'disponivel',
          })
        )
      }

      const semSubstituto = sessoes
        .filter((s) => s.disponivel === false && !s.substitutoId && !s.substitutoNome)
        .map((s) => s.id)
      if (semSubstituto.length > 0) {
        promessas.push(
          atualizarStatusAtendimentosEmLote({
            tita_agendamento_ids: semSubstituto,
            status: 'indisponivel',
            observacao: motivo || null,
          })
        )
      }

      const bySubst = new Map<string, number[]>()
      for (const s of sessoes.filter((s) => s.substitutoId)) {
        const key = s.substitutoNome!
        if (!bySubst.has(key)) bySubst.set(key, [])
        bySubst.get(key)!.push(s.id)
      }

      for (const [nome, ids] of bySubst) {
        promessas.push(
          atualizarStatusAtendimentosEmLote({
            tita_agendamento_ids: ids,
            status: 'substituido',
            profissional_substituto_nome: nome,
            observacao: motivo || null,
          })
        )
      }

      await Promise.all(promessas)
      onSuccess()
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  if (!grupo) return null

  const iniciais = getIniciais(grupo.terapeuta)
  const dataFormatada = formatarData(data)

  // ── Step 1: Motivo ──────────────────────────────────────────────
  if (etapa === 'motivo') {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white w-full max-w-lg rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center font-bold text-base shrink-0 select-none">
                {iniciais}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800 leading-tight truncate">{grupo.terapeuta}</h2>
                <p className="text-sm text-[#3A8FB7] font-medium">{grupo.terapia}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Motivo da indisponibilidade:
            </label>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ex: Atestado médico, saída antecipada, compromisso pessoal…"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-4 focus:ring-violet-100 focus:border-violet-300 resize-none transition"
            />
            <p className="mt-1.5 text-xs text-slate-400">Campo obrigatório para registrar a indisponibilidade.</p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-5 h-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={() => setEtapa('cobertura')}
              disabled={!motivo.trim()}
              className="px-5 h-10 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              Continuar
              <Check size={15} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: Cobertura ───────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-[96vw] max-h-[96vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* ── Cabeçalho ── */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center font-bold text-xl shrink-0 select-none">
              {iniciais}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-slate-800 leading-tight">{grupo.terapeuta}</h2>
              <p className="text-base text-[#3A8FB7] font-medium mt-0.5">{grupo.terapia}</p>
              <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500 flex-wrap">
                <CalendarDays size={14} />
                <span>{dataFormatada}</span>
                {horaInicial && horaFinal && (
                  <>
                    <span>·</span>
                    <Clock size={14} />
                    <span className="font-semibold">{horaInicial} às {horaFinal}</span>
                  </>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <Users size={14} className="text-slate-400" />
                <span>
                  <b>{sessoes.length}</b> sessões afetadas
                </span>
              </div>
              {motivo && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2 py-1 leading-tight">
                    Motivo: {motivo}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 shrink-0">
            {/* Status da cobertura */}
            <div
              className={`rounded-xl px-4 py-3 min-w-50 border ${
                semCobertura === 0
                  ? 'bg-emerald-50 border-emerald-100'
                  : 'bg-rose-50 border-rose-100'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={14} className={semCobertura === 0 ? 'text-emerald-500' : 'text-rose-500'} />
                <span className={`text-xs font-semibold ${semCobertura === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Status da cobertura
                </span>
              </div>
              <p className={`text-base font-bold ${semCobertura === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {semCobertura === 0 ? 'Cobertura completa' : `${semCobertura} sem cobertura`}
              </p>
              <p className={`text-xs mt-0.5 ${semCobertura === 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                {totalDisponiveis > 0 && `${totalDisponiveis} disponível · `}
                {sessoes.filter((s) => s.substitutoId).length} com substituto
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Abas ── */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAbaAtiva('manha')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-base font-semibold transition ${
              abaAtiva === 'manha'
                ? 'bg-violet-100 text-violet-700 border border-violet-200'
                : 'text-slate-500 hover:bg-slate-50 border border-transparent'
            }`}
          >
            ☀ Manhã ({sessoesManha.length})
          </button>
          <button
            onClick={() => setAbaAtiva('tarde')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-base font-semibold transition ${
              abaAtiva === 'tarde'
                ? 'bg-violet-100 text-violet-700 border border-violet-200'
                : 'text-slate-500 hover:bg-slate-50 border border-transparent'
            }`}
          >
            🌙 Tarde ({sessoesTarde.length})
          </button>
        </div>

        {/* ── Lista de sessões ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {carregando ? (
            <div className="py-20 text-center text-slate-400 text-sm">
              Carregando profissionais compatíveis...
            </div>
          ) : sessoesExibidas.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-sm">
              Nenhuma sessão neste período.
            </div>
          ) : (
            <div className="space-y-3">
              {sessoesExibidas.map((sessao) => (
                <SessionRow
                  key={sessao.id}
                  sessao={sessao}
                  profissionais={profissionais}
                  onSelecionar={selecionarSubstituto}
                  onMarcarDisponivel={marcarDisponivel}
                  onVerMais={() => setVerMaisSessao(sessao)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Rodapé ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-base text-slate-500">
            <Users size={17} className="text-slate-400 shrink-0" />
            {semCobertura > 0 ? (
              <span>
                <b className="text-slate-700">{semCobertura} {semCobertura === 1 ? 'sessão' : 'sessões'}</b>{' '}
                ainda sem cobertura. Selecione um substituto ou deixe como{' '}
                <span className="font-semibold">Sem substituição</span>.
              </span>
            ) : (
              <span className="text-emerald-600 font-semibold">
                Todas as sessões com cobertura definida.
              </span>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-6 h-11 rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancelar alterações
            </button>
            <button
              disabled={salvando}
              onClick={handleConfirmar}
              className="px-6 h-11 rounded-xl bg-violet-600 text-white text-base font-semibold hover:bg-violet-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              <Check size={16} />
              {salvando ? 'Salvando...' : 'Confirmar substituições'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal Ver mais ── */}
      {verMaisSessao && (
        <ProfissionaisVerMaisModal
          profissionais={profissionais}
          sessaoContext={{
            horario: `${String(verMaisSessao.atendimento.hora_inicial).slice(0, 5)} – ${String(verMaisSessao.atendimento.hora_final).slice(0, 5)}`,
            horaInicial: String(verMaisSessao.atendimento.hora_inicial).slice(0, 5),
            paciente: getPaciente(verMaisSessao.atendimento),
            terapia: String(
              (verMaisSessao.atendimento as any).terapia_exibicao_nome ||
              (verMaisSessao.atendimento as any).terapia_exibicao ||
              grupo.terapia
            ),
          }}
          substitutoAtualId={verMaisSessao.substitutoId}
          onSelect={(id, nome) => {
            selecionarSubstituto(verMaisSessao.id, id, nome)
            setVerMaisSessao(null)
          }}
          onClose={() => setVerMaisSessao(null)}
        />
      )}
    </div>
  )
}

// ── SessionRow ──────────────────────────────────────────────────

function SessionRow({
  sessao,
  profissionais,
  onSelecionar,
  onMarcarDisponivel,
  onVerMais,
}: {
  sessao: SessaoCobertura
  profissionais: SlotModalSubstituicao[]
  onSelecionar: (id: number, profId: number | null, nome: string | null) => void
  onMarcarDisponivel: (id: number) => void
  onVerMais: () => void
}) {
  const hora = String(sessao.atendimento.hora_inicial).slice(0, 5)
  const horaFim = String(sessao.atendimento.hora_final).slice(0, 5)
  const paciente = getPaciente(sessao.atendimento)
  const terapia = String(
    (sessao.atendimento as any).terapia_exibicao_nome ||
    (sessao.atendimento as any).terapia_exibicao ||
    ''
  )
  const sala = String(
    (sessao.atendimento as any).sala ||
    (sessao.atendimento as any).sala_nome ||
    (sessao.atendimento as any).numero_sala ||
    ''
  )
  const iniciaisPaciente = getIniciais(paciente)

  const profsUnicos = useMemo(() => getProfissionaisUnicos(profissionais), [profissionais])

  const profsComStatus = useMemo(() => {
    const ordemStatus: Record<string, number> = { livre: 0, ocupado: 1, sem_agenda_hoje: 2 }
    return profsUnicos
      .map((p) => ({ ...p, ...getStatusProfNaHora(profissionais, p.id, hora) }))
      .sort((a, b) => (ordemStatus[a.status] ?? 3) - (ordemStatus[b.status] ?? 3))
  }, [profsUnicos, profissionais, hora])

  const top3 = profsComStatus.slice(0, 5)
  const restante = Math.max(0, profsComStatus.length - 5)
  const selecionadoId = sessao.substitutoId
  const temSubstituto = !!selecionadoId || !!sessao.substitutoNome

  return (
    <div className="flex items-stretch gap-0 bg-white border border-slate-100 rounded-xl overflow-hidden hover:border-slate-200 transition">
      {/* Col 1 – Horário */}
      <div className="w-24 shrink-0 flex flex-col items-center justify-center gap-1 py-4 px-2 bg-slate-50/60 border-r border-slate-100">
        <Clock size={15} className="text-violet-500" />
        <span className="text-sm font-bold text-violet-700 tabular-nums">{hora}</span>
        <span className="text-xs text-slate-400 tabular-nums">{horaFim}</span>
        <span className="text-xs text-slate-400 mt-0.5">40 min</span>
      </div>

      {/* Col 2 – Paciente */}
      <div className="w-52 shrink-0 flex items-start gap-2 px-3 py-4 border-r border-slate-100">
        <div className="w-10 h-10 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 select-none">
          {iniciaisPaciente}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-800 leading-tight truncate">{paciente}</p>
          <p className="text-sm text-[#3A8FB7] font-medium mt-0.5 truncate">{terapia}</p>
          {sala ? (
            <div className="flex items-center gap-1 mt-1">
              <MapPin size={12} className="text-slate-400 shrink-0" />
              <span className="text-xs text-slate-400">{sala}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Col 3 – Profissionais */}
      <div className="flex-1 px-3 py-4 border-r border-slate-100">
        <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
          Profissionais compatíveis da semana
        </p>
        <div className="flex flex-wrap gap-2 items-start">
          {/* Disponível */}
          <button
            type="button"
            onClick={() => onMarcarDisponivel(sessao.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition w-25 min-h-24 ${
              sessao.disponivel
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-200 hover:border-emerald-300 bg-white'
            }`}
          >
            <div className="relative w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Check size={14} className="text-emerald-600" />
              {sessao.disponivel && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check size={9} className="text-white" />
                </div>
              )}
            </div>
            <span className="text-[11px] font-bold text-slate-700 text-center leading-tight w-full truncate px-0.5">
              Disponível
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-emerald-100 text-emerald-700">
              Atende
            </span>
          </button>

          {/* Sem substituição */}
          <button
            type="button"
            onClick={() => onSelecionar(sessao.id, null, null)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition w-25 min-h-24 ${
              sessao.disponivel === false && !temSubstituto
                ? 'border-violet-500 bg-violet-50'
                : 'border-slate-200 hover:border-violet-300 bg-white'
            }`}
          >
            <div className="relative w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <Clock size={14} className="text-slate-400" />
              {sessao.disponivel === false && !temSubstituto && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center">
                  <Check size={9} className="text-white" />
                </div>
              )}
            </div>
            <span className="text-[11px] font-bold text-slate-700 text-center leading-tight w-full truncate px-0.5">
              Sem subst.
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-slate-500">
              Sem cob.
            </span>
          </button>

          {/* Top 3 profissionais */}
          {top3.map((prof) => (
            <ProfMiniCard
              key={prof.id}
              prof={prof}
              selecionado={selecionadoId === prof.id}
              onClick={() => onSelecionar(sessao.id, prof.id, prof.nome)}
            />
          ))}

          {/* Ver mais */}
          {restante > 0 && (
            <button
              type="button"
              onClick={onVerMais}
              className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border-2 border-dashed border-slate-200 hover:border-violet-300 transition w-25 min-h-22"
            >
              <span className="text-base font-bold text-slate-500">+{restante}</span>
              <span className="text-xs text-slate-400 text-center leading-tight">Ver mais</span>
            </button>
          )}
        </div>
      </div>

      {/* Col 4 – Seleção atual */}
      <div className="w-52 shrink-0 px-3 py-4 flex items-center">
        {sessao.disponivel === true ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 w-full">
            <div className="flex items-center gap-1.5 mb-1">
              <Check size={13} className="text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">Seleção atual</span>
            </div>
            <p className="text-sm font-bold text-emerald-700 leading-snug">Terapeuta disponível</p>
            <p className="text-xs text-emerald-500 mt-0.5 leading-tight">Atenderá normalmente</p>
          </div>
        ) : temSubstituto ? (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 w-full">
            <div className="flex items-center gap-1.5 mb-1">
              <Check size={13} className="text-violet-600" />
              <span className="text-xs font-semibold text-violet-700">Seleção atual</span>
            </div>
            <p className="text-sm font-bold text-slate-800 leading-snug">{sessao.substitutoNome}</p>
          </div>
        ) : sessao.disponivel === false ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 w-full">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">Seleção atual</span>
            </div>
            <p className="text-sm font-semibold text-slate-600">Sem substituição</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-tight">
              Paciente ficará sem cobertura
            </p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 w-full">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={13} className="text-slate-300" />
              <span className="text-xs font-semibold text-slate-400">Aguarda decisão</span>
            </div>
            <p className="text-sm text-slate-400">Sessão pendente</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ProfMiniCard ────────────────────────────────────────────────

function ProfMiniCard({
  prof,
  selecionado,
  onClick,
}: {
  prof: { id: number; nome: string; status: string; paciente: string | null }
  selecionado: boolean
  onClick: () => void
}) {
  const iniciais = getIniciais(prof.nome)
  const nomeExibicao = prof.nome

  const label =
    prof.status === 'livre'
      ? 'Livre'
      : prof.status === 'sem_agenda_hoje'
        ? 'Não trab. hoje'
        : 'Ocupado'

  const badgeClass =
    prof.status === 'livre'
      ? 'bg-green-100 text-green-700'
      : prof.status === 'sem_agenda_hoje'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-orange-100 text-orange-700'

  return (
    <button
      type="button"
      onClick={onClick}
      title={prof.nome}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition w-25 min-h-24 ${
        selecionado
          ? 'border-violet-500 bg-violet-50'
          : 'border-slate-200 hover:border-violet-300 bg-white'
      }`}
    >
      <div className="relative w-10 h-10 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center text-xs font-bold select-none shrink-0">
        {iniciais}
        {selecionado && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center">
            <Check size={9} className="text-white" />
          </div>
        )}
      </div>
      <span className="text-[11px] font-bold text-slate-700 text-center leading-tight w-full truncate px-0.5">
        {nomeExibicao}
      </span>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badgeClass}`}>
        {label}
      </span>
      {prof.status === 'ocupado' && prof.paciente && (
        <span className="text-[10px] text-slate-400 text-center leading-tight truncate w-full px-0.5">
          {prof.paciente.split(' ')[0]}
        </span>
      )}
    </button>
  )
}

// ── Helpers ─────────────────────────────────────────────────────

function getIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  }
  return partes[0].slice(0, 2).toUpperCase()
}

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  const diasSemana = [
    'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
    'Quinta-feira', 'Sexta-feira', 'Sábado',
  ]
  const date = new Date(ano, mes - 1, dia)
  return `${dia} de ${meses[mes - 1]} de ${ano} (${diasSemana[date.getDay()]})`
}

function getProfissionaisUnicos(
  slots: SlotModalSubstituicao[]
): { id: number; nome: string; unidade: string }[] {
  const map = new Map<number, { id: number; nome: string; unidade: string }>()
  for (const s of slots) {
    if (!map.has(s.profissional_id)) {
      map.set(s.profissional_id, {
        id: s.profissional_id,
        nome: s.profissional_nome,
        unidade: s.unidade,
      })
    }
  }
  return Array.from(map.values())
}

function getStatusProfNaHora(
  slots: SlotModalSubstituicao[],
  profId: number,
  hora: string
): { status: 'livre' | 'ocupado' | 'sem_agenda_hoje'; paciente: string | null } {
  const profSlots = slots.filter((s) => s.profissional_id === profId)

  if (profSlots.length > 0 && profSlots.every((s) => s.status_slot === 'sem_agenda_hoje')) {
    return { status: 'sem_agenda_hoje', paciente: null }
  }

  const hojeSlots = profSlots.filter((s) => s.status_slot !== 'sem_agenda_hoje')
  const horaNorm = hora.slice(0, 5)
  const slotNaHora = hojeSlots.find((s) => s.hora.slice(0, 5) === horaNorm)

  if (!slotNaHora) {
    return { status: 'livre', paciente: null }
  }

  if (slotNaHora.status_slot?.toLowerCase() === 'livre') {
    return { status: 'livre', paciente: null }
  }

  return { status: 'ocupado', paciente: slotNaHora.paciente_nome }
}
