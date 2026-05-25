'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Save, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { salvarMotivoGlosa } from '@/services/auditoria-assim.service'
import type { AuditoriaAssimItem } from './types'

type Props = {
  item: AuditoriaAssimItem | null
  open: boolean
  onClose: () => void
  onSalvo: () => void
}

function formatarData(data: string | null) {
  if (!data) return '—'
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function InfoCard({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <span className="text-[11px] text-slate-400 block mb-1">{label}</span>
      <p className="text-sm font-medium text-slate-800 truncate">{value || '—'}</p>
    </div>
  )
}

export default function ModalDetalhamentoGlosa({ item, open, onClose, onSalvo }: Props) {
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && item) {
      setMotivo(item.motivo_glosa ?? '')
    }
  }, [open, item])

  if (!open || !item) return null

  async function handleSalvar() {
    if (!item?.bloco_id || !motivo.trim()) return
    setLoading(true)
    try {
      await salvarMotivoGlosa(item.bloco_id, motivo.trim())
      onSalvo()
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[640px] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Detalhamento da Glosa</h2>
            <p className="text-sm text-slate-500 mt-0.5">Informe o motivo da glosa para este atendimento.</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100 ml-4 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-t border-slate-100" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Informações do atendimento */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Informações do atendimento</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <InfoCard label="Paciente" value={item.paciente_nome} />
              <InfoCard label="Terapia" value={item.terapias} />
              <InfoCard label="Profissional" value={item.profissionais} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <InfoCard label="Data" value={formatarData(item.data_atendimento)} />
              <InfoCard label="Hora" value={item.hora_inicial ? item.hora_inicial.slice(0, 5) : null} />
              <InfoCard label="Código TUSS" value={item.codigo_tuss} />
            </div>
          </div>

          {/* Observação atual */}
          {item.observacao && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Observação atual</h3>
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <span className="text-sm text-amber-800">{item.observacao}</span>
              </div>
            </div>
          )}

          {/* Textarea motivo */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">
              Motivo / Detalhamento da glosa{' '}
              <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, 1000))}
              placeholder="Descreva o motivo da glosa..."
              rows={5}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7] focus:border-transparent resize-none transition"
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-slate-400">Campo obrigatório.</span>
              <span className="text-xs text-slate-400">{motivo.length} / 1000</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={loading || !motivo.trim()}
            className="px-5 py-2.5 rounded-xl bg-[#3A8FB7] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
