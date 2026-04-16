'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { criarAutorizacao } from '@/services/autorizacoes.service'


export default function SolicitarPage() {
  const hoje = new Date().toISOString().split('T')[0]

  const [busca, setBusca] = useState('')
  const [pacientes, setPacientes] = useState<any[]>([])
  const [pacienteSelecionado, setPacienteSelecionado] = useState<any>(null)

  const [data, setData] = useState(hoje)
  const [horario, setHorario] = useState('')

  const [loading, setLoading] = useState(false)



async function handleSolicitar() {
  if (!pacienteSelecionado || !data || !horario) {
    alert('Preencha todos os campos')
    return
  }

  // 🔒 evita duplicidade
  const { data: existente } = await supabase
    .from('autorizacoes')
    .select('id')
    .eq('paciente_nome', pacienteSelecionado.paciente_nome)
    .eq('data_atendimento', data)
    .eq('horario', horario)
    .maybeSingle()

  if (existente) {
    alert('Já existe autorização para esse paciente nesse horário')
    return
  }

  // 🚀 salva já como EXECUTANDO
  const nova = await criarAutorizacao({
    paciente_nome: pacienteSelecionado.paciente_nome,
    matricula: pacienteSelecionado.matricula || null,
    data: data,
    horario: horario,
    status: 'executando',
  })

  if (!nova) return

  alert('Autorização enviada para execução 🚀')

  // 🧼 limpa formulário (UX top)
  setBusca('')
  setPacienteSelecionado(null)
  setHorario('')
}



  // 🔎 BUSCA COM DELAY (DEBOUNCE)
  useEffect(() => {
    if (!busca) {
      setPacientes([])
      return
    }

    const delay = setTimeout(async () => {
  setLoading(true)

const { data, error } = await supabase
  .from('autorizacoes')
  .select('id, paciente_nome')
  .ilike('paciente_nome', `%${busca}%`)
  .limit(10)

if (!error) {
  const nomesUnicos = Array.from(
    new Set(data.map((p: any) => p.paciente_nome))
  ).map((nome) => ({ paciente_nome: nome }))

  setPacientes(nomesUnicos)
}

  setLoading(false)
}, 400)



    return () => clearTimeout(delay)
  }, [busca])

  // ⏰ HORÁRIOS
  function gerarHorarios() {
    const horarios: string[] = []

    let h = 8
    let m = 0

    while (h < 12) {
      horarios.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      m += 40

      if (m >= 60) {
        h++
        m -= 60
      }

      if (h === 11 && m > 40) break
    }

    h = 13
    m = 0

    while (h < 18) {
      horarios.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      m += 40

      if (m >= 60) {
        h++
        m -= 60
      }

      if (h === 17 && m > 0) break
    }

    return horarios
  }

  const horarios = gerarHorarios()

  return (
    <div className="p-5 bg-slate-50 min-h-[calc(100vh-80px)] justify-center">

      {/* HEADER */}
      <div className="mb-6 px-5 py-3 bg-white/80 backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-800">
          Solicitar Autorização
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Preencha os dados abaixo para solicitar a Autorização
        </p>
      </div>

      {/* CARD */}
      <div className="max-w-xl bg-white/80 backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-lg p-6 space-y-5">

        {/* AUTOCOMPLETE PACIENTE */}
        <div className="relative">
          <label className="text-xs font-semibold text-slate-500 uppercase">
            Paciente
          </label>

          <input
            type="text"
            placeholder="Digite o nome do paciente..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPacienteSelecionado(null)
            }}
            className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]"
          />

          {/* DROPDOWN */}
          {(pacientes.length > 0 || loading) && (
            <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">

              {loading && (
                <div className="px-4 py-2 text-sm text-slate-400">
                  Buscando...
                </div>
              )}

              {pacientes.map((p) => (
                <div
                  key={p.paciente_nome}
                  onClick={() => {
                    setPacienteSelecionado(p)
                    setBusca(p.paciente_nome)
                    setPacientes([])
                  }}
                  className="px-4 py-2 text-sm hover:bg-slate-100 cursor-pointer"
                >
                  {p.paciente_nome}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DATA */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase">
            Data do Atendimento
          </label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]"
          />
        </div>

        {/* HORÁRIO */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase">
            Horário da Terapia
          </label>
          <select
            value={horario}
            onChange={(e) => setHorario(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]"
          >
            <option value="">Selecione o horário</option>

            {horarios.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        {/* BOTÃO */}
        <button 
			onClick={handleSolicitar}
			className="w-full bg-[#3A8FB7] hover:bg-[#337aa0] text-white py-2 rounded-lg font-medium transition"
			>
          Solicitar
        </button>

      </div>
    </div>
  )
}