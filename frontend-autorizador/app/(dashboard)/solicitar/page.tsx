'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { criarAutorizacao } from '@/services/autorizacoes.service'

export default function SolicitarPage() {
  const hoje = new Date().toISOString().split('T')[0]

  const [listaDia, setListaDia] = useState<any[]>([])
  const [loadingLista, setLoadingLista] = useState(true)

  // =========================
  // 🔎 FORM RETROATIVO
  // =========================
  const [busca, setBusca] = useState('')
  const [pacientes, setPacientes] = useState<any[]>([])
  const [pacienteSelecionado, setPacienteSelecionado] = useState<any>(null)

  const [data, setData] = useState(hoje)
  const [horario, setHorario] = useState('')
  const [loading, setLoading] = useState(false)

  // =========================
  // ⏱️ REGRA 30 MINUTOS
  // =========================
  function podeSolicitar(ultima: string | null) {
    if (!ultima) return true

    const agora = new Date()
    const ultimaData = new Date(ultima)

    const diffMs = agora.getTime() - ultimaData.getTime()
    const diffMin = diffMs / 1000 / 60

    return diffMin >= 30
  }

  // =========================
  // 📥 CARREGAR LISTA
  // =========================
  async function carregarLista() {
    setLoadingLista(true)

    const { data, error } = await supabase
      .from('autorizacoes')
      .select('*')
      .eq('data_atendimento', hoje)
      .eq('status', 'pendente')
      .order('horario_atendimento', { ascending: true })

    if (!error && data) setListaDia(data)

    setLoadingLista(false)
  }

  useEffect(() => {
    carregarLista()
  }, [])

  // =========================
  // 🔴 REALTIME
  // =========================
	useEffect(() => {
	  const channel = supabase
		.channel('agenda')
		.on(
		  'postgres_changes',
		  { event: 'UPDATE', schema: 'public', table: 'agenda_terapias' },
		  (payload) => {
			const updated = payload.new

			setListaDia((prev) =>
			  prev.filter((item) => item.id !== updated.id)
			)
		  }
		)
		.subscribe()

	  return () => {
		supabase.removeChannel(channel)
	  }
	}, [])

  // =========================
  // 🚀 SOLICITAR (COM TRAVA)
  // =========================
  async function handleSolicitarLista(p: any) {
    if (!podeSolicitar(p.ultima_autorizacao)) {
      alert('Aguarde 30 minutos desde a última autorização')
      return
    }

    const { error } = await supabase
      .from('agenda_terapias')
      .update({ status: 'executando' })
      .eq('id', p.id)
      .eq('status', 'pendente')

    if (error) {
      alert('Esse paciente já foi pego por outro atendente')
      return
    }

    await criarAutorizacao({
      paciente_nome: p.paciente_nome,
      matricula: p.matricula,
      data: hoje,
      horario: p.horario,
      status: 'executando',
    })

    setListaDia((prev) => prev.filter((item) => item.id !== p.id))
  }

  // =========================
  // ❌ FALTA
  // =========================
  async function handleFalta(id: string) {
    await supabase
      .from('agenda_terapias')
      .update({ status: 'falta' })
      .eq('id', id)

    setListaDia((prev) => prev.filter((item) => item.id !== id))
  }

  // =========================
  // 🔎 AUTOCOMPLETE
  // =========================
  useEffect(() => {
    if (!busca) {
      setPacientes([])
      return
    }

    const delay = setTimeout(async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('autorizacoes')
        .select('paciente_nome')
        .ilike('paciente_nome', `%${busca}%`)
        .limit(10)

      if (!error && data) {
        const nomesUnicos = Array.from(
          new Set(data.map((p: any) => p.paciente_nome))
        ).map((nome) => ({ paciente_nome: nome }))

        setPacientes(nomesUnicos)
      }

      setLoading(false)
    }, 400)

    return () => clearTimeout(delay)
  }, [busca])

  // =========================
  // ⏰ HORÁRIOS
  // =========================
  function gerarHorarios() {
    const horarios: string[] = []
    let h = 8
    let m = 0

    while (h < 12) {
      horarios.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      m += 40
      if (m >= 60) { h++; m -= 60 }
      if (h === 11 && m > 40) break
    }

    h = 13
    m = 0

    while (h < 18) {
      horarios.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      m += 40
      if (m >= 60) { h++; m -= 60 }
      if (h === 17 && m > 0) break
    }

    return horarios
  }

  const horarios = gerarHorarios()

  // =========================
  // 📤 FORM RETROATIVO
  // =========================
  async function handleSolicitar() {
    if (!pacienteSelecionado || !data || !horario) {
      alert('Preencha todos os campos')
      return
    }

    await criarAutorizacao({
      paciente_nome: pacienteSelecionado.paciente_nome,
      data,
      horario,
      status: 'executando',
    })

    alert('Autorização enviada 🚀')

    setBusca('')
    setPacienteSelecionado(null)
    setHorario('')
  }

  const hojeFormatado = new Date().toLocaleDateString('pt-BR')

  // =========================
  // 🎨 UI
  // =========================
  return (
    <div className="p-5 bg-slate-50 min-h-[calc(100vh-80px)]">

  {/* HEADER */}
  <div className="mb-6 px-5 py-3 bg-white/80 backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm">
    <h1 className="text-2xl font-semibold text-slate-600">
      Solicitar Autorização
    </h1>
    <p className="text-sm text-slate-500 mt-1">
      Controle diário de atendimentos
    </p>
  </div>

  <div className="grid grid-cols-4 gap-5">

    {/* ========================= */}
    {/* CARD PRINCIPAL */}
    {/* ========================= */}
    <div className="col-span-3 bg-white/80 backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm p-6">

      <h2 className="text-lg font-semibold mb-4 text-slate-600 flex items-center gap-2">
        Agenda do Dia
        <span className="text-sm font-semibold text-slate-600">
        · {hojeFormatado}
        </span>
      </h2>

      {loadingLista ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : listaDia.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nenhum paciente pendente 🎉
        </p>
      ) : (
        <div className="space-y-3">

          {listaDia.map((p) => {
            const ativo = podeSolicitar(p.ultima_autorizacao)

            return (
              <div
                key={p.id}
                className="p-4 rounded-xl border border-slate-200 bg-white transition shadow-sm hover:shadow-md flex justify-between items-center"
              >

                {/* INFO */}
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[#3A8FB7]">
                    {p.horario}
                  </div>

                  <div className="font-semibold text-slate-800">
                    {p.paciente_nome}
                  </div>

                  <div className="text-xs text-slate-400">
                    Última: {p.ultima_autorizacao || '--'}
                  </div>
                </div>

                {/* AÇÕES */}
                <div className="flex gap-2">

                  <button
                    disabled={!ativo}
                    onClick={() => handleSolicitarLista(p)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition ${
                      ativo
                        ? 'bg-[#3A8FB7] text-white hover:opacity-90'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Autorização
                  </button>

                  <button
                    onClick={() => handleFalta(p.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:opacity-90 transition"
                  >
                    Falta
                  </button>

                </div>

              </div>
            )
          })}

        </div>
      )}
    </div>

    {/* ========================= */}
    {/* CARD LATERAL CENTRALIZADO */}
    {/* ========================= */}
    <div className="col-span-1 flex justify-center">

      <div className="w-full max-w-[280px] bg-white/80 backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm p-5">

        <div className="space-y-4">

          <h2 className="text-base font-semibold text-slate-600 text-center">
            Autorização Retroativa
          </h2>

          {/* PACIENTE */}
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPacienteSelecionado(null)
            }}
            placeholder="Paciente..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/40"
          />

          {/* DATA */}
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/40"
          />

          {/* HORÁRIO */}
          <select
            value={horario}
            onChange={(e) => setHorario(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/40"
          >
            <option value="">Horário</option>
            {horarios.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>

          {/* BOTÃO */}
          <button
            onClick={handleSolicitar}
            className="w-full bg-[#3A8FB7] text-white py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            Solicitar
          </button>

        </div>
      </div>

    </div>

  </div>
</div>
  )
}