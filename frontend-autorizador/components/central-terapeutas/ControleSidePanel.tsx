'use client'

import { useState } from 'react'
import {
  Check,
  Clock3,
  Loader2,
  MapPin,
  RefreshCcw,
  Stethoscope,
  User,
  UserCheck,
  UserX,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ControleStatusBadge from './ControleStatusBadge'
import ModalCobertura from './ModalCobertura'
import type { ControleTerapeuticoItem } from './types'
import {
  getHorario,
  getPaciente,
  getSala,
  getStatus,
  getTerapeuta,
  getTerapia,
  getUnidade,
} from './helpers'
import { atualizarStatusAtendimento } from '@/services/controle-terapeutico.service'

type Props = {
  atendimento?: ControleTerapeuticoItem
  onStatusChanged?: () => void
}

export default function ControleSidePanel({
  atendimento,
  onStatusChanged,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [modalCoberturaAberta, setModalCoberturaAberta] = useState(false)

  const handleAtualizarStatus = async (status: 'presente' | 'faltou') => {
    if (!atendimento) return

    setLoading(true)
    try {
      const resultado = await atualizarStatusAtendimento({
        tita_agendamento_id: atendimento.tita_agendamento_id || '',
        status: status as any,
      })

      if (!resultado) {
        toast.error('Erro ao atualizar status')
        return
      }

      const mensagens: Record<string, string> = {
        presente: '✓ Presença registrada com sucesso',
        faltou: '✗ Falta registrada com sucesso',
      }

      toast.success(mensagens[status])
      onStatusChanged?.()
    } catch (err) {
      console.error('Erro ao atualizar status:', err)
      toast.error('Erro ao atualizar status')
    } finally {
      setLoading(false)
    }
  }

  if (!atendimento) {
    return (
      <aside
        className="
          h-full
          bg-white/90
          backdrop-blur-sm
          rounded-2xl
          border border-slate-200
          shadow-sm
          p-5
          text-sm
          text-slate-400
        "
      >
        Selecione um atendimento
      </aside>
    )
  }

  return (
    <>
      <aside
        className="
          h-full
          bg-white/90
          backdrop-blur-sm
          rounded-2xl
          border border-slate-200
          shadow-sm
          overflow-hidden
        "
      >
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-400">
                Atendimento selecionado
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-800 leading-tight">
                {getTerapeuta(atendimento)}
              </h2>
            </div>

            <ControleStatusBadge status={getStatus(atendimento)} />
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3">
            <Info
              icon={Stethoscope}
              label="Terapia"
              value={getTerapia(atendimento)}
            />
          </div>
        </div>

        <div className="p-4 space-y-5">
          <PanelSection title="Dados operacionais">
            <div className="grid grid-cols-1 gap-3">
              <Info
                icon={User}
                label="Paciente"
                value={getPaciente(atendimento)}
              />
              <Info
                icon={Clock3}
                label="Horário"
                value={getHorario(atendimento)}
              />
              <Info
                icon={MapPin}
                label="Sala"
                value={getSala(atendimento)}
              />
              <Info
                icon={MapPin}
                label="Unidade"
                value={getUnidade(atendimento) || '—'}
              />
            </div>
          </PanelSection>

          <PanelSection title="Ações rápidas">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleAtualizarStatus('presente')}
                disabled={loading}
                className={`${actionClass} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                PRESENTE
              </button>

              <button
                type="button"
                onClick={() => handleAtualizarStatus('faltou')}
                disabled={loading}
                className={`${actionClass} bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? <Loader2 size={17} className="animate-spin" /> : <UserX size={17} />}
                FALTOU
              </button>

              <button
                type="button"
                onClick={() => setModalCoberturaAberta(true)}
                disabled={loading}
                className={`${actionClass} bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
                COBERTURA
              </button>
            </div>
          </PanelSection>
        </div>
      </aside>

      <ModalCobertura
        atendimento={atendimento}
        isOpen={modalCoberturaAberta}
        onClose={() => setModalCoberturaAberta(false)}
        onConfirm={() => {
          onStatusChanged?.()
          setModalCoberturaAberta(false)
        }}
      />
    </>
  )
}

const actionClass = `
  h-11
  w-full
  rounded-xl
  text-sm
  font-bold
  flex
  items-center
  justify-center
  gap-2
  transition
  hover:shadow-sm
`

function PanelSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
          <UserCheck size={15} />
        </div>
        <h3 className="text-sm font-bold text-slate-800">
          {title}
        </h3>
      </div>

      {children}
    </section>
  )
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="mt-0.5 h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
        <Icon size={15} />
      </div>

      <div className="min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-slate-700 break-words">
          {value || '—'}
        </p>
      </div>
    </div>
  )
}
