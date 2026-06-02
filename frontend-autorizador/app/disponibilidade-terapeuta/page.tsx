'use client'

import type { StatusDisponibilidade } from '@/hooks/useControleDisponibilidade'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Search } from 'lucide-react'
import { useControleDisponibilidade } from '@/hooks/useControleDisponibilidade'
import StatusModal from '@/components/controle-disponibilidade/StatusModal'
import ControleTerapeutaMobileCard from '@/components/central-terapeutas/ControleTerapeutaMobileCard'
import {
  getHorarioInicial,
  getPaciente,
  getTerapia,
  getTerapeuta,
  getUnidade,
  normalizarStatus,
  terapiaDeveAparecer,
} from '@/components/central-terapeutas/helpers'
import type {
  ControleFilters,
  ControleTerapeuticoItem,
  GrupoTerapeutaMobile,
  StatusDisponibilidadeGrupo,
} from '@/components/central-terapeutas/types'
import { listarCentralTerapeutica } from '@/services/central-terapeutas.service'
import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = getSupabaseClient()

type Ordenacao = 'alfabetica' | 'sala' | 'horario'

function getHojeLocal() {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function calcularStatusAtual(
  atendimentos: ControleTerapeuticoItem[]
): StatusDisponibilidadeGrupo {
  const statuses = atendimentos.map((a) => normalizarStatus(a.status))
  const temDisponivel   = statuses.some((s) => s === 'disponivel')
  const temIndisponivel = statuses.some((s) => s === 'indisponivel')
  const temSubstituido  = statuses.some((s) => s === 'substituido')
  const todosPendente   = statuses.every((s) => s === 'pendente')

  if (temDisponivel && temIndisponivel) return 'parcial'
  if (temIndisponivel && !temDisponivel) return 'indisponivel'
  if (temSubstituido && !temIndisponivel && !temDisponivel) return 'substituido'
  if (temDisponivel && !temIndisponivel) return 'disponivel'
  if (todosPendente) return 'pendente'

  return (normalizarStatus(
    [...atendimentos].sort((a, b) =>
      String(a.hora_inicial).localeCompare(String(b.hora_inicial))
    ).at(-1)?.status
  ) as StatusDisponibilidadeGrupo) || 'pendente'
}

export default function RegistroDisponibilidadePage() {
  const hoje = getHojeLocal()
  const router = useRouter()

  const [dados, setDados] = useState<ControleTerapeuticoItem[]>([])
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState<ControleFilters>({
    data: hoje,
    busca: '',
    horario: '',
    unidade: '',
    terapia: '',
    statusFiltro: [],
  })

  const [ordenacao, setOrdenacao] = useState<Ordenacao>('alfabetica')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusDisponibilidadeGrupo>('todos')

  async function carregarDados() {
    setLoading(true)
    const response = await listarCentralTerapeutica(filters.data)
    setDados(response || [])
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/disponibilidade-terapeuta/login/')
        return
      }
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('role')
        .eq('id', data.session.user.id)
        .single()
      if (perfil?.role !== 'disponibilidade_terapeuta') {
        router.replace('/login/')
      }
    })
  }, [])

  const {
    modalStatus,
    setModalStatus,
    horariosEdicao,
    novoStatusModal,
    salvandoStatus,
    erroStatus,
    abrirModalStatus: abrirModalStatusOriginal,
    atualizarStatusDireto,
    atualizarStatusSelecionado,
    toggleHorario,
  } = useControleDisponibilidade({
    getPaciente,
    onSuccess: carregarDados,
  })

  useEffect(() => {
    carregarDados()

    const channel = supabase
      .channel(`controle-terapeutico-disponibilidade-${filters.data}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'controle_terapeutico',
        },
        () => {
          carregarDados()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [filters.data])

  function obterTodosAtendimentosDoTerapeuta(terapeuta: string) {
    return dados.filter((item) => getTerapeuta(item) === terapeuta)
  }

  const filtrados = useMemo(() => {
    return dados
      .filter(terapiaDeveAparecer)
      .filter((item) => {
        if (!filters.busca) return true
        return getTerapeuta(item).toLowerCase().includes(filters.busca.toLowerCase())
      })
  }, [dados, filters.busca])

  const grupos = useMemo(() => {
    const gruposMap: Record<string, GrupoTerapeutaMobile> = {}

    filtrados.forEach((item) => {
      const terapeuta = getTerapeuta(item)

      if (!gruposMap[terapeuta]) {
        gruposMap[terapeuta] = {
          terapeuta,
          terapia:
            item.terapia_exibicao ||
            item.terapia_exibicao_nome ||
            getTerapia(item),
          terapiaExibicao:
            item.terapia_exibicao ||
            item.terapia_exibicao_nome ||
            '',
          unidade: getUnidade(item),
          sala: item.sala || item.numero_sala || '',
          atendimentos: [],
          primeiroHorario: getHorarioInicial(item),
          status: 'pendente',
          substituto: item.profissional_substituto_nome || undefined,
        }
      }

      gruposMap[terapeuta].atendimentos.push(item)

      if (!gruposMap[terapeuta].substituto && item.profissional_substituto_nome) {
        gruposMap[terapeuta].substituto = item.profissional_substituto_nome
      }
    })

    Object.values(gruposMap).forEach((grupo) => {
      grupo.status = calcularStatusAtual(grupo.atendimentos)

      const comAlteracao = grupo.atendimentos
        .filter((a) => a.confirmado_em && a.confirmado_por_nome)
        .sort((a, b) => (b.confirmado_em! > a.confirmado_em! ? 1 : -1))
      if (comAlteracao.length > 0) {
        grupo.ultimaAlteracaoPor = comAlteracao[0].confirmado_por_nome ?? null
        grupo.ultimaAlteracaoEm  = comAlteracao[0].confirmado_em ?? null
      }
    })

    let lista = Object.values(gruposMap)

    if (filtroStatus !== 'todos') {
      lista = lista.filter((grupo) => grupo.status === filtroStatus)
    }

    if (ordenacao === 'alfabetica') {
      lista.sort((a, b) => a.terapeuta.localeCompare(b.terapeuta, 'pt-BR'))
    } else if (ordenacao === 'sala') {
      lista.sort((a, b) => a.sala.localeCompare(b.sala))
    } else if (ordenacao === 'horario') {
      lista.sort((a, b) => a.primeiroHorario.localeCompare(b.primeiroHorario))
    }

    return lista
  }, [filtrados, filtroStatus, ordenacao])

  return (
    <main className="min-h-screen bg-[#f4f7fb] pb-28">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center">
            <img
              src="/logo-universo-aba.png"
              alt="Universo ABA"
              className="h-9 w-9 object-contain"
            />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800">Clínica Universo ABA</h1>
            <p className="text-sm font-semibold text-[#3A8FB7]">Registro de Disponibilidade</p>
          </div>
        </div>
      </header>

      <section className="p-3 space-y-3">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 space-y-3">
          <input
            type="date"
            value={filters.data}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, data: e.target.value }))
            }
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
          />

          <div className="relative">
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
              className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white"
            >
              <option value="alfabetica">Ordem alfabética</option>
              <option value="sala">Número da sala</option>
              <option value="horario">Horário inicial</option>
            </select>
            <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={filtroStatus}
              onChange={(e) =>
                setFiltroStatus(e.target.value as 'todos' | StatusDisponibilidadeGrupo)
              }
              className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white"
            >
              <option value="todos">Todos os status</option>
              <option value="pendente">Pendentes</option>
              <option value="disponivel">Disponíveis</option>
              <option value="indisponivel">Indisponíveis</option>
            </select>
            <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={filters.busca}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, busca: e.target.value }))
              }
              placeholder="Buscar terapeuta..."
              className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm"
            />
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
            Carregando profissionais...
          </div>
        )}

        {!loading && grupos.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
            Nenhum profissional encontrado
          </div>
        )}

        {!loading &&
          grupos.map((grupo) => (
            <ControleTerapeutaMobileCard
              key={grupo.terapeuta}
              grupo={grupo}
              onStatusChanged={carregarDados}
              abrirModalStatus={(g, status) => {
                const grupoCompleto = {
                  ...g,
                  status: g.status as StatusDisponibilidade,
                  atendimentos: obterTodosAtendimentosDoTerapeuta(g.terapeuta),
                }

                if (status === 'disponivel' || status === 'indisponivel') {
                  abrirModalStatusOriginal(grupoCompleto, status)
                }
              }}
              atualizarStatusDireto={(g, status) => {
                void atualizarStatusDireto(g as any, status as any)
              }}
              salvandoStatus={salvandoStatus}
            />
          ))}
      </section>

      <StatusModal
        data={filters.data}
        modalStatus={modalStatus}
        horariosEdicao={horariosEdicao}
        novoStatusModal={novoStatusModal}
        salvandoStatus={salvandoStatus}
        erroStatus={erroStatus}
        toggleHorario={toggleHorario}
        atualizarStatusSelecionado={atualizarStatusSelecionado}
        setModalStatus={setModalStatus}
      />
    </main>
  )
}
