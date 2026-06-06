'use client'

import { useState } from 'react'
import PacienteSelect from './paciente-select'
import AtendimentoPreview from './atendimento-preview'
import { criarAutorizacao } from '@/services/autorizacoes.service'

export default function NovaAutorizacaoForm() {
  const [paciente, setPaciente] = useState<any>(null)
  const [atendimento, setAtendimento] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function handleSalvar() {
    console.log('CLICOU NO BOTÃO 🔥')

    if (!paciente) return alert('Selecione um paciente')

    setLoading(true)

    const nova = await criarAutorizacao({
      paciente_nome: paciente.nome,
      matricula: paciente.matricula,
      status: 'pendente'
    })

    console.log('RESPOSTA DO SERVICE:', nova)

    setLoading(false)

    if (nova) {
      alert('Autorização criada!')
    }
  }

  return (
    <div className="flex flex-col gap-4">

      <PacienteSelect onSelect={setPaciente} />

      {paciente && (
        <AtendimentoPreview paciente={paciente} atendimento={atendimento} />
      )}

      <button
        onClick={handleSalvar}
        className="bg-blue-600 text-white p-2 rounded"
        disabled={loading}
      >
        {loading ? 'Salvando...' : 'Salvar Autorização'}
      </button>

    </div>
  )
}