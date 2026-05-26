'use client'

import { useMemo, useState } from 'react'
import { Check, Filter, MapPin, Star, X } from 'lucide-react'
import type { SlotModalSubstituicao } from '@/services/controle-terapeutico.service'

type SessaoContext = {
  horario: string
  horaInicial: string
  paciente: string
  terapia: string
}

type Props = {
  profissionais: SlotModalSubstituicao[]
  sessaoContext: SessaoContext
  substitutoAtualId: number | null
  onSelect: (id: number, nome: string) => void
  onClose: () => void
}

const POR_PAGINA = 15

export default function ProfissionaisVerMaisModal({
  profissionais,
  sessaoContext,
  substitutoAtualId,
  onSelect,
  onClose,
}: Props) {
  const [filtroLivres, setFiltroLivres] = useState(true)
  const [filtroOcupados, setFiltroOcupados] = useState(true)
  const [filtroNaoTrabalha, setFiltroNaoTrabalha] = useState(true)
  const [filtroUnidade, setFiltroUnidade] = useState('todas')
  const [pagina, setPagina] = useState(1)

  // Profissionais únicos com status na hora da sessão
  const profsComStatus = useMemo(() => {
    const map = new Map<
      number,
      {
        id: number
        nome: string
        unidade: string
        status: 'livre' | 'ocupado' | 'sem_agenda_hoje'
        paciente: string | null
        horarioPaciente: string | null
      }
    >()

    for (const s of profissionais) {
      if (!map.has(s.profissional_id)) {
        map.set(s.profissional_id, {
          id: s.profissional_id,
          nome: s.profissional_nome,
          unidade: s.unidade,
          status: 'livre',
          paciente: null,
          horarioPaciente: null,
        })
      }
    }

    // Compute status at session hora
    const horaNorm = sessaoContext.horaInicial.slice(0, 5)
    for (const [profId, prof] of map) {
      const profSlots = profissionais.filter((s) => s.profissional_id === profId)
      if (profSlots.every((s) => s.status_slot === 'sem_agenda_hoje')) {
        prof.status = 'sem_agenda_hoje'
        continue
      }
      const hojeSlots = profSlots.filter((s) => s.status_slot !== 'sem_agenda_hoje')
      const slotNaHora = hojeSlots.find((s) => s.hora.slice(0, 5) === horaNorm)
      if (!slotNaHora || slotNaHora.status_slot?.toLowerCase() === 'livre') {
        prof.status = 'livre'
      } else {
        prof.status = 'ocupado'
        prof.paciente = slotNaHora.paciente_nome
        prof.horarioPaciente = slotNaHora.hora
      }
    }

    // Sort: livre > ocupado > sem_agenda_hoje; same status → alphabetical
    const ordem: Record<string, number> = { livre: 0, ocupado: 1, sem_agenda_hoje: 2 }
    return Array.from(map.values()).sort((a, b) => {
      const diff = (ordem[a.status] ?? 3) - (ordem[b.status] ?? 3)
      return diff !== 0 ? diff : a.nome.localeCompare(b.nome, 'pt-BR')
    })
  }, [profissionais, sessaoContext.horaInicial])

  const unidades = useMemo(() => {
    const set = new Set(profsComStatus.map((p) => p.unidade).filter(Boolean))
    return Array.from(set).sort()
  }, [profsComStatus])

  const filtrados = useMemo(() => {
    return profsComStatus.filter((p) => {
      if (filtroUnidade !== 'todas' && p.unidade !== filtroUnidade) return false
      if (p.status === 'livre' && !filtroLivres) return false
      if (p.status === 'ocupado' && !filtroOcupados) return false
      if (p.status === 'sem_agenda_hoje' && !filtroNaoTrabalha) return false
      return true
    })
  }, [profsComStatus, filtroUnidade, filtroLivres, filtroOcupados, filtroNaoTrabalha])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const exibidos = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)
  const ocultados = profsComStatus.length - filtrados.length

  function limparFiltros() {
    setFiltroLivres(true)
    setFiltroOcupados(true)
    setFiltroNaoTrabalha(true)
    setFiltroUnidade('todas')
    setPagina(1)
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* ── Header ── */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Profissionais compatíveis</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Exibindo terapeutas da mesma terapia ({sessaoContext.terapia}) que possuem agenda na semana.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Legenda de status ── */}
        <div className="px-6 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-6 shrink-0">
          <LegendaItem cor="bg-green-500" label="Livre" descricao="Profissional livre no horário" />
          <LegendaItem cor="bg-orange-400" label="Ocupado" descricao="Já possui uma sessão no horário" />
          <LegendaItem cor="bg-blue-400" label="Não trabalha hoje" descricao="Não possui agenda neste dia" />
        </div>

        {/* ── Corpo ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar de filtros */}
          <aside className="w-56 shrink-0 border-r border-slate-100 flex flex-col overflow-y-auto">
            <div className="p-4 flex items-center justify-between sticky top-0 bg-white border-b border-slate-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Filter size={14} />
                Filtros
              </div>
              <button
                onClick={limparFiltros}
                className="text-xs text-violet-600 font-semibold hover:underline"
              >
                Limpar
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Unidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Unidade</label>
                <select
                  value={filtroUnidade}
                  onChange={(e) => { setFiltroUnidade(e.target.value); setPagina(1) }}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition"
                >
                  <option value="todas">Todas as unidades</option>
                  {unidades.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Contexto da sessão */}
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wide">Sessão</p>
                <p className="text-xs font-bold text-violet-700">{sessaoContext.horario}</p>
                <p className="text-xs text-slate-700 font-medium mt-0.5 truncate">{sessaoContext.paciente}</p>
                <p className="text-[10px] text-[#3A8FB7] mt-0.5 truncate">{sessaoContext.terapia}</p>
              </div>

              {/* Mostrar apenas */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Mostrar apenas</p>
                <div className="space-y-2">
                  <CheckboxFiltro
                    cor="bg-green-500"
                    label="Livres"
                    checked={filtroLivres}
                    onChange={(v) => { setFiltroLivres(v); setPagina(1) }}
                  />
                  <CheckboxFiltro
                    cor="bg-orange-400"
                    label="Ocupados"
                    checked={filtroOcupados}
                    onChange={(v) => { setFiltroOcupados(v); setPagina(1) }}
                  />
                  <CheckboxFiltro
                    cor="bg-blue-400"
                    label="Não trabalha hoje"
                    checked={filtroNaoTrabalha}
                    onChange={(v) => { setFiltroNaoTrabalha(v); setPagina(1) }}
                  />
                </div>
              </div>

              {/* Info ocultados */}
              {ocultados > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-700">
                    Mostrando {filtrados.length} de {profsComStatus.length} profissionais
                  </p>
                  <p className="text-[10px] text-blue-500 mt-0.5">
                    {ocultados} {ocultados === 1 ? 'profissional oculto' : 'profissionais ocultos'} pelos filtros.
                  </p>
                </div>
              )}
            </div>
          </aside>

          {/* Conteúdo principal */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Barra topo */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <p className="text-sm font-semibold text-slate-700">
                {filtrados.length} profissional{filtrados.length !== 1 ? 'is' : ''} encontrado{filtrados.length !== 1 ? 's' : ''}
              </p>
              <span className="text-xs text-slate-400 font-medium">
                Ordenado por: melhor disponibilidade
              </span>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-5">
              {exibidos.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-sm">
                  Nenhum profissional encontrado com os filtros selecionados.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3 xl:grid-cols-5">
                  {exibidos.map((prof) => (
                    <ProfCardGrid
                      key={prof.id}
                      prof={prof}
                      selecionado={substitutoAtualId === prof.id}
                      onClick={() => onSelect(prof.id, prof.nome)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-center gap-3 shrink-0">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition text-sm font-bold"
                >
                  ‹
                </button>
                <span className="text-sm text-slate-500">
                  {paginaAtual} de {totalPaginas} páginas
                </span>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition text-sm font-bold"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Rodapé ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-6 h-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ProfCardGrid ─────────────────────────────────────────────────

function ProfCardGrid({
  prof,
  selecionado,
  onClick,
}: {
  prof: {
    id: number
    nome: string
    unidade: string
    status: 'livre' | 'ocupado' | 'sem_agenda_hoje'
    paciente: string | null
    horarioPaciente: string | null
  }
  selecionado: boolean
  onClick: () => void
}) {
  const iniciais = getIniciais(prof.nome)

  const badgeClass =
    prof.status === 'livre'
      ? 'bg-green-100 text-green-700'
      : prof.status === 'sem_agenda_hoje'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-orange-100 text-orange-700'

  const badgeLabel =
    prof.status === 'livre' ? 'Livre' : prof.status === 'sem_agenda_hoje' ? 'Não trabalha hoje' : 'Ocupado'

  const infoLabel =
    prof.status === 'livre'
      ? 'Livre no horário'
      : prof.status === 'sem_agenda_hoje'
        ? 'Não possui agenda hoje'
        : prof.paciente
          ? `Paciente: ${prof.paciente.split(' ')[0]} ${prof.paciente.split(' ')[1]?.[0] ?? ''}.`
          : 'Ocupado no horário'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition text-left w-full ${
        selecionado
          ? 'border-violet-500 bg-violet-50'
          : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50'
      }`}
    >
      {selecionado && (
        <div className="absolute top-2 right-2">
          <Star size={13} className="text-violet-500 fill-violet-400" />
        </div>
      )}

      {/* Avatar */}
      <div className="w-12 h-12 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center font-bold text-sm select-none">
        {iniciais}
      </div>

      {/* Nome */}
      <div className="w-full text-center">
        <p className="text-xs font-bold text-slate-800 leading-tight line-clamp-2">{prof.nome}</p>
      </div>

      {/* Badge status */}
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badgeClass}`}>
        {badgeLabel}
      </span>

      {/* Unidade */}
      {prof.unidade && (
        <div className="flex items-center gap-1 w-full">
          <MapPin size={10} className="text-slate-400 shrink-0" />
          <span className="text-[10px] text-slate-500 truncate">{prof.unidade}</span>
        </div>
      )}

      {/* Info */}
      <p className="text-[10px] text-slate-400 w-full leading-tight line-clamp-2">{infoLabel}</p>

      {/* Horário se ocupado */}
      {prof.status === 'ocupado' && prof.horarioPaciente && (
        <p className="text-[10px] text-orange-600 font-medium w-full">
          {prof.horarioPaciente.slice(0, 5)}
        </p>
      )}
    </button>
  )
}

// ── Helpers ──────────────────────────────────────────────────────

function LegendaItem({ cor, label, descricao }: { cor: string; label: string; descricao: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${cor}`} />
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <span className="text-xs text-slate-400">{descricao}</span>
    </div>
  )
}

function CheckboxFiltro({
  cor,
  label,
  checked,
  onChange,
}: {
  cor: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
          checked ? 'border-violet-500 bg-violet-500' : 'border-slate-300 group-hover:border-violet-300'
        }`}
        onClick={() => onChange(!checked)}
      >
        {checked && <Check size={10} className="text-white" />}
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${cor}`} />
        <span className="text-xs text-slate-600">{label}</span>
      </div>
    </label>
  )
}

function getIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  }
  return partes[0].slice(0, 2).toUpperCase()
}
