'use client'

import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { SlotModalSubstituicao } from '@/services/controle-terapeutico.service'
import { getIniciais, getProfissionaisUnicos, getStatusProfNaHora } from './helpers'

type Props = {
  todosProfissionais: SlotModalSubstituicao[]  // já filtrado (sem o terapeuta atual, sem terapiasIgnoradas)
  hora: string                                  // hora_inicial da sessão (HH:MM)
  carregando?: boolean
  valorSelecionadoId: number | null
  onSelect: (id: number, nome: string, terapiaNome: string) => void
  onCancel: () => void  // Esc no campo de busca cancela a substituição manual, não fecha o modal
}

/**
 * Lista inline (não flutuante) para evitar ser cortada pelo overflow-hidden do
 * card da sessão — renderiza direto no fluxo, sempre visível enquanto montado.
 */
export default function SeletorTerapeutaForaEspecialidade({
  todosProfissionais,
  hora,
  carregando,
  valorSelecionadoId,
  onSelect,
  onCancel,
}: Props) {
  const [busca, setBusca] = useState('')

  const slotsMap = useMemo(() => {
    const map = new Map<number, SlotModalSubstituicao[]>()
    for (const s of todosProfissionais) {
      if (!map.has(s.profissional_id)) map.set(s.profissional_id, [])
      map.get(s.profissional_id)!.push(s)
    }
    return map
  }, [todosProfissionais])

  const profsComStatus = useMemo(() => {
    const unicos = getProfissionaisUnicos(todosProfissionais)
    return unicos
      .map((p) => ({ ...p, ...getStatusProfNaHora(slotsMap.get(p.id) ?? [], hora) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [todosProfissionais, slotsMap, hora])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return profsComStatus
    return profsComStatus.filter((p) => p.nome.toLowerCase().includes(termo))
  }, [profsComStatus, busca])

  const selecionado = profsComStatus.find((p) => p.id === valorSelecionadoId) ?? null

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/40 overflow-hidden">
      <div className="p-2 border-b border-amber-200 bg-white">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500" />
          <input
            autoFocus
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                onCancel()
              }
            }}
            placeholder={
              selecionado
                ? `${selecionado.nome} · ${selecionado.terapia_nome}`
                : carregando ? 'Carregando terapeutas...' : 'Buscar terapeuta por nome...'
            }
            className="w-full h-8 rounded-lg border border-slate-200 pl-8 pr-2 text-xs outline-none focus:border-amber-400"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {filtrados.length === 0 ? (
          <p className="p-3 text-xs text-slate-400 text-center">
            {carregando ? 'Carregando terapeutas...' : 'Nenhum terapeuta encontrado.'}
          </p>
        ) : (
          filtrados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelect(p.id, p.nome, p.terapia_nome); setBusca('') }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-amber-100/60 transition ${
                p.id === valorSelecionadoId ? 'bg-amber-100' : ''
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center text-[10px] font-bold shrink-0">
                {getIniciais(p.nome)}
              </span>
              <span className="flex-1 truncate font-medium text-slate-700">{p.nome}</span>
              <span className="text-[10px] text-slate-400 truncate max-w-24">{p.terapia_nome}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                p.status === 'livre' ? 'bg-emerald-100 text-emerald-700'
                  : p.status === 'sem_agenda_hoje' ? 'bg-sky-100 text-sky-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {p.status === 'livre' ? 'Livre' : p.status === 'sem_agenda_hoje' ? 'Não trab. hoje' : 'Ocupado'}
              </span>
              {p.id === valorSelecionadoId && <Check size={12} className="text-amber-600 shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
