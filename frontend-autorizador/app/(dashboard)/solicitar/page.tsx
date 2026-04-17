'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { criarAutorizacao } from '@/services/autorizacoes.service'
import toast from 'react-hot-toast'

export default function SolicitarPage() {
  const hoje = new Date().toISOString().split('T')[0]
  const [filaStatus, setFilaStatus] = useState<any[]>([])
  const [listaDia, setListaDia] = useState<any[]>([])
  const [loadingLista, setLoadingLista] = useState(true)
  const supabase = getSupabaseClient()
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
			.from('agenda_terapias')
			.select('*')
			.eq('data_atendimento', hoje)
			.order('horario', { ascending: true }) // ✅ corrigido

			console.log('DADOS SEM FILTRO:', data)
			
		  if (error) {
			console.error('Erro ao carregar agenda:', error)
		  }

		  if (data) {
			console.log('DADOS AGENDA:', data) // 🔥 DEBUG
			setListaDia(data)
		  }

		  setLoadingLista(false)
		}

	// =========================
	//  CARREGAR FILA
	// =========================
		async function carregarFila() {
		  const { data, error } = await supabase
			.from('fila_autorizacoes')
			.select('*')
			.eq('data_atendimento', hoje)

		  if (!error) {
			setFilaStatus(data || [])
		  }
		}


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
	// CARREGAR LISTA e FILA
	// =========================
	
	
	useEffect(() => {
	  carregarLista()
	  carregarFila()
	}, [])
	// =========================
	// Testar usuario
	// =========================
useEffect(() => {
  async function verificarUsuario() {
    const { data, error } = await supabase.auth.getUser()

    console.log('USER:', data)
    console.log('ERROR:', error)
  }

  verificarUsuario()
}, [])

  // =========================
  // 🚀 SOLICITAR (COM TRAVA)
  // =========================
async function handleSolicitarLista(p: any) {
  try {
    if (!podeSolicitar(p.ultima_autorizacao)) {
      toast.error('Aguarde 30 minutos desde a última autorização')
      return
    }

    const { data: existente, error: erroBusca } = await supabase
      .from('fila_autorizacoes')
      .select('id, status')
      .eq('paciente_id', p.paciente_id)
      .eq('data_atendimento', hoje)
      .eq('horario', p.horario)
      .in('status', ['pendente', 'processando'])
      .maybeSingle()

    if (erroBusca) {
      toast.error('Erro ao verificar fila')
      return
    }

    if (existente) {
      toast.error('Paciente já está sendo atendido')
      return
    }

    const { error } = await supabase
      .from('fila_autorizacoes')
      .insert([
        {
          paciente_id: p.paciente_id,
          paciente_nome: p.paciente_nome,
          data_atendimento: hoje,
          horario: p.horario,
          status: 'pendente'
        }
      ])

    if (error) {
      toast.error('Erro ao enviar para o robô')
      return
    }

    toast.success('Autorização iniciada 🚀')
    await carregarFila()

  } catch (err) {
    console.error(err)
    toast.error('Erro inesperado')
  }
}


		// =========================
		// ❌ FALTA
		// =========================
				
		async function handleFalta(p: any) {
		  try {
			const { error } = await supabase
			  .from('fila_autorizacoes')
			  .insert({
				paciente_id: p.paciente_id,
				paciente_nome: p.paciente_nome,
				data_atendimento: hoje,
				horario: p.horario,
				status: 'falta'
			  })

			if (error) {
			  toast.error('Erro ao registrar falta')
			  return
			}

			// remove da tela
			setListaDia((prev) => prev.filter((item) => item.id !== p.id))

			toast.success('Falta registrada com sucesso')

		  } catch (err) {
			console.error(err)
			toast.error('Erro inesperado')
		  }
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
        .from('agenda_terapias')
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
        toast.error('Preencha todos os campos')
        return
      }

      const { error } = await supabase
        .from('fila_autorizacoes')
        .insert({
          paciente_id: pacienteSelecionado.id || null,
          paciente_nome: pacienteSelecionado.paciente_nome,
          data_atendimento: data,
          horario,
          status: 'pendente'
        })

      if (error) {
        toast.error("Erro ao solicitar")
        return
      }

      toast.success('Autorização enviada 🚀')

      setBusca('')
      setPacienteSelecionado(null)
      setHorario('')
    }

  const hojeFormatado = new Date().toLocaleDateString('pt-BR')
  const [filtro, setFiltro] = useState('')
  
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

  {/* HEADER COM FILTRO */}
  <div className="flex items-center justify-between mb-4">

    {/* ESQUERDA */}
    <h2 className="text-lg font-semibold text-slate-600 flex items-center gap-2">
      Agenda do Dia
      <span className="text-sm font-normal text-slate-400">
        · {hojeFormatado}
      </span>
    </h2>

    {/* DIREITA */}
    <input
      type="text"
      placeholder="Buscar paciente..."
      value={filtro}
      onChange={(e) => setFiltro(e.target.value)}
      className="w-56 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/40"
    />

  </div>

    {loadingLista ? (
      <p className="text-sm text-slate-400">Carregando...</p>
    ) : (() => {
    
    const listaFiltrada = listaDia.filter((p) =>
      (p.paciente_nome || '').toLowerCase().includes(filtro.toLowerCase())
    )

    if (listaDia.length === 0) {
      return (
        <p className="text-sm text-slate-400">
          Nenhum paciente pendente 🎉
        </p>
      )
    }

    if (listaFiltrada.length === 0) {
      return (
        <p className="text-sm text-slate-400">
          Nenhum resultado encontrado 🔍
        </p>
      )
    }
    
    const listaOrdenada = [...listaFiltrada].sort((a, b) => {
      // 1. horário da terapia
      if (a.horario !== b.horario) {
      return a.horario.localeCompare(b.horario)
      }

      // 2. última autorização
      const ultimaA = a.ultima_autorizacao
      ? new Date(a.ultima_autorizacao).getTime()
      : 0

      const ultimaB = b.ultima_autorizacao
        ? new Date(b.ultima_autorizacao).getTime()
        : 0

      if (ultimaA !== ultimaB) {
        return ultimaA - ultimaB
      }

      // 3. nome do paciente
      return (a.paciente_nome || '').localeCompare(b.paciente_nome || '')
    })

return (
      <div className="space-y-3">

        {listaOrdenada.map((p) => {
          const ativo = podeSolicitar(p.ultima_autorizacao)

          return (
            <div
              key={p.id}
              className="p-4 rounded-xl border border-slate-200 bg-white transition shadow-sm hover:shadow-md flex justify-between items-center"
            >

              {/* INFO */}
              <div className="flex items-center gap-4">
                <div className="text-sm font-semibold text-[#3A8FB7]">
                  {p.horario}
                </div>

                <div className="font-semibold text-slate-800">
                  {p.paciente_nome}
                </div>

                <div className="text-xs text-slate-400">
                  Última Autorização: {p.ultima_autorizacao
                ? new Date(p.ultima_autorizacao).toLocaleTimeString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : '--'}
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
                  onClick={() => handleFalta(p)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:opacity-90 transition"
                >
                  Falta
                </button>

              </div>

            </div>
          )
        })}

      </div>
    )
  })()}

</div>

    {/* ========================= */}
    {/* CARD LATERAL CENTRALIZADO */}
    {/* ========================= */}
    <div className="col-span-1 flex justify-center">

      <div className="w-full max-w-[280px] bg-white/80 backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm p-5">

        <div className="space-y-4">

          <h2 className="text-base font-semibold text-slate-600 text-center">
            Solicitar Autorização Retroativa
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