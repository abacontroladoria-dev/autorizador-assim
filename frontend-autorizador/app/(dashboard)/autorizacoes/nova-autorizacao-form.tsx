'use client'

import { useState } from 'react'
import PacienteSelect from './paciente-select'
import AtendimentoPreview from './atendimento-preview'
import { criarAutorizacao } from '@/services/autorizacoes.service'

export default function NovaAutorizacaoForm() {
  const [paciente, setPaciente] = useState<any>(null)
  const [atendimento, setAtendimento] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function handleSalvar() {
    if (!paciente) {
      setMsg('Selecione um paciente antes de continuar')
      return
    }

    setLoading(true)
    setMsg(null)

    const nova = await criarAutorizacao({
      paciente_nome: paciente.nome,
      matricula: paciente.matricula,
      dataHora: new Date().toISOString(),
      status: 'AUTORIZADO'
    })

    setLoading(false)

    if (nova) {
      setMsg('Autorização criada com sucesso ✅')
      setPaciente(null)
      setAtendimento(null)
    } else {
      setMsg('Erro ao criar autorização ❌')
    }
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-5">

      {/* HEADER */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          Nova Autorização
        </h2>
        <p className="text-sm text-slate-500">
          Selecione o paciente e confirme os dados
        </p>
      </div>

      {/* FEEDBACK */}
      {msg && (
        <div className={`text-sm px-3 py-2 rounded-lg ${
          msg.includes('sucesso')
            ? 'bg-green-50 text-green-600'
            : 'bg-red-50 text-red-600'
        }`}>
          {msg}
        </div>
      )}

      {/* PACIENTE */}
      <div>
        <label className="text-xs text-slate-500 font-medium">
          Paciente
        </label>
        <PacienteSelect onSelect={setPaciente} />
      </div>

      {/* PREVIEW */}
      {paciente && (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <AtendimentoPreview paciente={paciente} atendimento={atendimento} />
        </div>
      )}

      {/* BOTÃO */}
      <button
        onClick={handleSalvar}
        disabled={loading}
        className="w-full bg-[#3A8FB7] hover:bg-[#2f7aa0] text-white py-2.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {loading ? 'Salvando...' : 'Salvar Autorização'}
      </button>

    </div>
  )
}