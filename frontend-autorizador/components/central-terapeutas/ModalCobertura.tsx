'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, MapPin, Phone, Stethoscope, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ControleTerapeuticoItem } from './types'
import {
  getTerapeuta,
  getTerapia,
  getPaciente,
  getUnidade,
  getHorario,
} from './helpers'
import { atualizarStatusAtendimento, listarProfissionaisDisponiveis } from '@/services/controle-terapeutico.service'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  atendimento: ControleTerapeuticoItem | null
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

type ProfissionalDisponivel = {
  id: string | number
  profissional_id?: string | number | null
  profissional_nome?: string
  nome_profissional?: string
  nome_terapia?: string
  terapia_nome?: string
  terapia_exibicao?: string
  numero_telefone?: string
  telefone?: string
  whatsapp?: string
  status?: string
  observacao?: string
}

export default function ModalCobertura({
  atendimento,
  isOpen,
  onClose,
  onConfirm,
}: Props) {
  const [profissionaisDisponiveis, setProfissionaisDisponiveis] = useState<ProfissionalDisponivel[]>([])
  const [loading, setLoading] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [profissionalSelecionado, setProfissionalSelecionado] = useState<ProfissionalDisponivel | null>(null)
  const [observacao, setObservacao] = useState('')

  // Buscar profissionais quando abrir modal
  useEffect(() => {
    if (isOpen && atendimento) {
      buscarProfissionaisDisponiveis()
    }
  }, [isOpen, atendimento])

  async function buscarProfissionaisDisponiveis() {
    if (!atendimento) return

    setBuscando(true)
    try {
      const data = atendimento.data || atendimento.data_atendimento || new Date().toISOString().split('T')[0]
      const terapia = atendimento.nome_terapia || atendimento.terapia_nome || ''
      const unidade = atendimento.id_unidade ? Number(atendimento.id_unidade) : 280

      const profissionais = await listarProfissionaisDisponiveis(
        data,
        terapia,
        unidade
      )

      setProfissionaisDisponiveis(profissionais || [])

      if (!profissionais || profissionais.length === 0) {
        toast.error('Nenhum profissional disponível para cobertura')
      }
    } catch (err) {
      console.error('Erro ao buscar profissionais:', err)
      toast.error('Erro ao buscar profissionais disponíveis')
    } finally {
      setBuscando(false)
    }
  }

  async function handleConfirmarCobertura() {
    if (!atendimento || !profissionalSelecionado) {
      toast.error('Selecione um profissional')
      return
    }

    if (!profissionalSelecionado.profissional_id) {
      toast.error('Profissional sem ID operacional para cobertura')
      return
    }

    setLoading(true)
    try {
      const profissionalNome = profissionalSelecionado.profissional_nome || profissionalSelecionado.nome_profissional || 'Profissional substituto'

      const resultado = await atualizarStatusAtendimento({
        tita_agendamento_id: atendimento.tita_agendamento_id || '',
        status: 'cobertura_confirmada',
        profissional_substituto_id: profissionalSelecionado.profissional_id,
        profissional_substituto_nome: profissionalNome,
        observacao: observacao || null,
      })

      if (!resultado) {
        toast.error('Erro ao confirmar cobertura')
        return
      }

      toast.success('Cobertura confirmada com sucesso')
      onConfirm()
      onClose()
    } catch (err) {
      console.error('Erro ao confirmar cobertura:', err)
      toast.error('Erro ao confirmar cobertura')
    } finally {
      setLoading(false)
    }
  }

  if (!atendimento) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl rounded-2xl border-0 p-0 overflow-hidden">
        <DialogHeader className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-white rounded-t-2xl">
          <DialogTitle className="text-xl font-bold">
            Solicitar Cobertura
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-6">
          {/* Dados do Atendimento Original */}
          <section className="space-y-3">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <AlertCircle size={16} className="text-blue-600" />
              Atendimento a Cobrir
            </h3>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Profissional Original</p>
                  <p className="text-slate-800 font-medium">{getTerapeuta(atendimento)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Terapia</p>
                  <p className="text-slate-800 font-medium text-blue-700">{getTerapia(atendimento)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Paciente</p>
                  <p className="text-slate-800 font-medium">{getPaciente(atendimento)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Horário</p>
                  <p className="text-slate-800 font-medium">{getHorario(atendimento)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                    <MapPin size={12} />
                    Unidade
                  </p>
                  <p className="text-slate-800 font-medium">{getUnidade(atendimento)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Lista de Profissionais Disponíveis */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Stethoscope size={16} className="text-emerald-600" />
                Profissionais Disponíveis
              </h3>
              {profissionaisDisponiveis.length > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-semibold">
                  {profissionaisDisponiveis.length} disponível(is)
                </span>
              )}
            </div>

            {buscando && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 size={20} className="animate-spin mr-2" />
                Buscando profissionais...
              </div>
            )}

            {!buscando && profissionaisDisponiveis.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-amber-700 text-sm">
                Nenhum profissional disponível para este horário e terapia
              </div>
            )}

            {!buscando && profissionaisDisponiveis.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {profissionaisDisponiveis.map((prof) => {
                  const nome = prof.profissional_nome || prof.nome_profissional || 'Profissional'
                  const terapia =
                    prof.terapia_nome ||
                    prof.nome_terapia ||
                    prof.terapia_exibicao ||
                    'Terapia não informada'
                  const telefone =
                    prof.telefone ||
                    prof.whatsapp ||
                    prof.numero_telefone
                  const isSelected = profissionalSelecionado?.id === prof.id

                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => setProfissionalSelecionado(prof)}
                      className={`
                        w-full p-3 rounded-xl border-2 transition text-left
                        ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:border-emerald-300'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-slate-800 text-sm mb-1">
                            {nome}
                          </h4>
                          <p className="text-xs text-slate-600 mb-2">
                            {terapia}
                          </p>
                          {telefone && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Phone size={12} />
                              {telefone}
                            </div>
                          )}
                          {prof.observacao && (
                            <p className="text-xs text-slate-500 mt-1 italic">
                              {prof.observacao}
                            </p>
                          )}
                        </div>
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                            <Check size={14} className="text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Observação */}
          {profissionalSelecionado && (
            <section className="space-y-2">
              <label className="block text-sm font-bold text-slate-800">
                Observações (opcional)
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Adicione observações sobre a cobertura..."
                className="
                  w-full
                  min-h-[80px]
                  p-3
                  border border-slate-200
                  rounded-xl
                  text-sm
                  text-slate-700
                  placeholder:text-slate-400
                  focus:outline-none
                  focus:ring-2
                  focus:ring-emerald-500
                  focus:border-transparent
                "
              />
            </section>
          )}
        </div>

        {/* Footer com Ações */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex gap-3 justify-end rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="
              px-4 py-2 rounded-lg border border-slate-200 text-slate-700
              font-medium text-sm hover:bg-slate-100 transition disabled:opacity-50
            "
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmarCobertura}
            disabled={!profissionalSelecionado || loading}
            className="
              px-4 py-2 rounded-lg bg-emerald-600 text-white
              font-medium text-sm hover:bg-emerald-700 transition
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2
            "
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Confirmando...' : 'Confirmar Cobertura'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
