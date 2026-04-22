'use client'

import { useEffect, useState } from 'react'

import { getSupabaseClient } from '@/lib/supabase/client'

import { criarAutorizacao } from '@/services/autorizacoes.service'

import toast from 'react-hot-toast'

import { RefreshCcw, LogIn, CalendarX } from 'lucide-react'

export default function SolicitarPage() {
  const hoje = new Date().toLocaleDateString('sv-SE')

  const [filaStatus, setFilaStatus] = useState<any[]>([])

  const [listaDia, setListaDia] = useState<any[]>([])

  const [loadingLista, setLoadingLista] = useState(true)

  const supabase = getSupabaseClient()

  const [busca, setBusca] = useState('')

  const [sugestoes, setSugestoes] = useState<any[]>([])

  const [pacienteSelecionado, setPacienteSelecionado] = useState<any>(null)

  const [data, setData] = useState(hoje)

  const [horario, setHorario] = useState('')

  const [loading, setLoading] = useState(false)

  const [indexSelecionado, setIndexSelecionado] = useState<number>(-1)

  const [atualizando, setAtualizando] = useState(false)

  const [pacientes, setPacientes] = useState<any[]>([])

  const [terapiaSelecionada, setTerapiaSelecionada] = useState<string | null>(null)

  const horarios = gerarHorarios()

  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)

  const [filtroHorario, setFiltroHorario] = useState('')
  
  
  // =====================================
  // BOTAO DE CHECK SOLICITACAO RETROATIVA
  // =====================================

  async function buscarTerapia() {
    if (!pacienteSelecionado || !data || !horario) return
    const { data: resultado, error } = await supabase
      .from('agenda_orbita')
      .select('terapia')
      .eq('paciente_nome', pacienteSelecionado.paciente_nome)
      .eq('data_atendimento', data)
      .eq('horario', horario)
      .single()
    if (error) {
      console.log('Erro ao buscar terapia:', error.message)
      setTerapiaSelecionada(null)
      return
    }
    setTerapiaSelecionada(resultado?.terapia || null)
  }

  // ==================================
  // ATUALIZAÇÃO DA TABELA DE PACIENTES
  // ==================================
  async function carregarAgenda() {
    const hoje = new Date().toLocaleDateString('sv-SE')
    const { data, error } = await supabase
      .from('agenda_orbita')
      .select('*')
      .eq('data_atendimento', hoje)
    if (error) {
      console.error('Erro ao carregar agenda:', error)
      return
    }
    setPacientes(data || [])
  }

  // BOTÃO MANUAL

	async function atualizarAgendaManual() {
	  setAtualizando(true)

	  await fetch('/api/sincronizar-agenda?force=true')

	  let status = 'running'
	  let tentativas = 0

	  while (status === 'running' && tentativas < 20) {
		await new Promise(r => setTimeout(r, 1500))

		const res = await fetch('/api/status-sync')
		const data = await res.json()

		status = data.status

		console.log('STATUS:', status)

		tentativas++
	  }

	  // 🔥 ESSA LINHA RESOLVE SEU PROBLEMA
	  await new Promise(r => setTimeout(r, 1000))

	  await carregarLista()

	  setAtualizando(false)
	}


  // =========================
  // 📥 CARREGAR LISTA SILENCIOSO
  // =========================

async function carregarListaSilencioso() {
  const { data, error } = await supabase
    .from('agenda_orbita')
    .select('*')
    .eq('data_atendimento', hoje)
    .not('matricula', 'is', null)
    .not('empresa', 'is', null)
    .not('dep', 'is', null)
    .not('tuss', 'is', null)
    .not('crm', 'is', null)
    .not('nome_medico', 'is', null)
    .not('terapia', 'in', '("Coordenador","Aplicador Suporte","Aplicador Suporte (MT)","Aplicador ABA Casa","Aplicador ABA Escola")')
    .order('horario', { ascending: true })

  if (data) {
    const filtrado = data.filter((p) =>
      p.matricula &&
      p.empresa &&
      p.dep &&
      p.tuss &&
      p.crm &&
      p.nome_medico
    )
    setListaDia(filtrado)
  }
}

  // =========================
  // 📥 CARREGAR LISTA
  // =========================

  async function carregarLista() {
    setLoadingLista(true)
    const { data, error } = await supabase
      .from('agenda_orbita')
      .select('*')
      .eq('data_atendimento', hoje)
      .not('matricula', 'is', null)
      .not('empresa', 'is', null)
      .not('dep', 'is', null)
      .not('tuss', 'is', null)
      .not('crm', 'is', null)
      .not('nome_medico', 'is', null)
      .not('terapia', 'in', '("Coordenador","Aplicador Suporte","Aplicador Suporte (MT)","Aplicador ABA Casa","Aplicador ABA Escola")')
      .order('horario', { ascending: true })
    if (error) {
      console.error('Erro ao carregar agenda:', error)
    }
    if (data) {
      // 🔥 segurança extra contra EMPTY string
      const filtrado = data.filter((p) =>
        p.matricula &&
        p.empresa &&
        p.dep &&
        p.tuss &&
        p.crm &&
        p.nome_medico
      )
      setListaDia(filtrado)
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
            empresa: p.empresa,
            matricula: p.matricula,
            dep: p.dep,
            crm: p.crm,
            nome_medico: p.nome_medico,
            tuss: p.tuss,
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
  // 📤 FORM RETROATIVO
  // =========================

  async function handleSolicitar() {
    if (!pacienteSelecionado || !data || !horario) {
      toast.error('Preencha todos os campos')
      return
    }
    // 🔥 BUSCAR DADOS COMPLETOS NA AGENDA
    const { data: agenda, error: erroBusca } = await supabase
      .from('agenda_orbita')
      .select('*')
      .eq('paciente_nome', pacienteSelecionado.paciente_nome)
      .eq('data_atendimento', data)
      .eq('horario', horario)
      .single()
    if (erroBusca || !agenda) {
      toast.error('Não foi possível localizar o agendamento')
      return
    }
    // 🚀 INSERIR NA FILA COM DADOS COMPLETOS
    const { error } = await supabase
      .from('fila_autorizacoes')
      .insert([
      {
        paciente_id: agenda.paciente_id,
        paciente_nome: agenda.paciente_nome,
        empresa: agenda.empresa,
        matricula: agenda.matricula,
        dep: agenda.dep,
        crm: agenda.crm,
        nome_medico: agenda.nome_medico,
        tuss: agenda.tuss,
        data_atendimento: agenda.data_atendimento,
        horario: agenda.horario,
        status: 'pendente'
      }
    ])
    if (error) {
      toast.error('Erro ao solicitar')
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
  // ⏱️ REGRA 30 MINUTOS
  // =========================

  function podeSolicitar(ultima: string | null) {
    if (!ultima) return true
    const agora = new Date()
    const ultimaData = new Date(ultima + 'Z')
    const diffMs = agora.getTime() - ultimaData.getTime()
    const diffMin = diffMs / 1000 / 60
    return diffMin >= 30
  }

  // =========================
  // ULTIMA AUTORIZACAO
  // =========================
  
	function getUltimaAutorizacaoConcluida(p: any) {
	  const itens = filaStatus
		.filter(
		  (f) =>
			f.paciente_id === p.paciente_id &&
			f.status?.toLowerCase() === 'concluido'
		)
		.sort(
		  (a, b) =>
			new Date(b.updated_at).getTime() -
			new Date(a.updated_at).getTime()
		)

	  return itens[0] || null
	}

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

  useEffect(() => {
     carregarAgenda()
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
  // CARREGAR LISTA e FILA
  // =========================

	useEffect(() => {
	  carregarLista()
	  carregarFila()

	  const interval = setInterval(() => {
		carregarFila()
	  }, 3000) // 🔥 atualiza a cada 3s

	  return () => clearInterval(interval)
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
  // 🔎 AUTOCOMPLETE
  // =========================

  useEffect(() => {
    if (!busca || pacienteSelecionado) return
    const buscar = async () => {
      const { data } = await supabase
        .from('agenda_orbita')
        .select('*')
        .ilike('paciente_nome', `%${busca}%`)
        .limit(50)
      if (data) {
        const unicos = Array.from(
          new Map(data.map(p => [p.paciente_nome, p])).values()
        )
        setSugestoes(unicos)
      }
    }
    buscar()
  }, [busca])

  // =========================
  // BUSCAR TERAPIA
  // =========================

  useEffect(() => {
    buscarTerapia()
  }, [pacienteSelecionado, data, horario])

  // =========================
  // BUSCAR STATUS DO PACIENTE
  // =========================
	function getStatusPaciente(p: any) {
	  return filaStatus.find(
		(f) =>
		  f.paciente_id === p.paciente_id &&
		  f.horario === p.horario &&
		  f.data_atendimento === hoje
	  )
	}

  // =========================
  // 🎨 UI
  // =========================

  return (
    <div className="p-6 min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* HEADER */}
      <div className="mb-6 px-5 py-3 bg-white/70 backdrop-blur-md backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm">
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
        <div className="col-span-3 bg-white/70 backdrop-blur-md backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm p-6">
          {/* HEADER COM FILTRO */}
          <div className="flex items-center justify-between mb-4">
            {/* ESQUERDA */}
            <h2 className="text-base font-semibold text-slate-600 flex items-center gap-2">
              Agenda do Dia
              <span className="text-sm font-normal text-slate-400">
                · {hojeFormatado}
              </span>
            </h2>
           
		   {/* DIREITA (AGRUPADO) */}
            <div className="flex items-center gap-2">

			  {/* 🔥 FILTRO HORÁRIO BONITO */}
			  <div className="relative">
				<select
				  value={filtroHorario}
				  onChange={(e) => setFiltroHorario(e.target.value)}
				  className="appearance-none bg-white border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/40"
				>
				  <option value="">Horário</option>
				  {horarios.map((h) => (
					<option key={h} value={h}>{h}</option>
				  ))}
				</select>

				{/* Ícone */}
				<div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
				  ▼
				</div>
			  </div>

			  {/* 🔎 FILTRO NOME */}
			  <input
				type="text"
				placeholder="Buscar paciente..."
				value={filtro}
				onChange={(e) => setFiltro(e.target.value)}
				className="w-56 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/40"
			  />

			  {/* 🔄 BOTÃO */}
				<button
				  onClick={atualizarAgendaManual}
				  disabled={atualizando}
				  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:brightness-110 active:scale-[0.98] transition disabled:opacity-50 whitespace-nowrap"
				>
				  <RefreshCcw size={16} className={atualizando ? 'animate-spin' : ''} />
				  {atualizando ? 'Atualizando...' : 'Atualizar'}
				</button>

			</div>
			
          </div>
          {loadingLista ? (
            <p className="text-sm text-slate-400">Carregando...</p>
          ) : (() => {
            const listaFiltrada = listaDia.filter((p) => {
			  const matchNome =
				!filtro ||
				(p.paciente_nome || '').toLowerCase().includes(filtro.toLowerCase())

			  const matchHorario =
				!filtroHorario ||
				p.horario?.slice(0, 5) === filtroHorario

			  return matchNome && matchHorario
			})
            if (listaFiltrada.length === 0) {
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
			  // 1️⃣ horário da terapia
			  if (a.horario !== b.horario) {
				return a.horario.localeCompare(b.horario)
			  }

			  // 2️⃣ última autorização (mais antigo primeiro 🔥)
			  const ultA = getUltimaAutorizacaoConcluida(a)
			  const ultB = getUltimaAutorizacaoConcluida(b)

			  const dataA = ultA ? new Date(ultA.updated_at + 'Z').getTime() : Infinity
			  const dataB = ultB ? new Date(ultB.updated_at + 'Z').getTime() : Infinity

			  if (dataA !== dataB) {
				return dataA - dataB // 🔥 MAIS ANTIGO PRIMEIRO
			  }

			  // 3️⃣ nome
			  return (a.paciente_nome || '').localeCompare(b.paciente_nome || '')
			})
return (
  <div className="space-y-3">
    {listaOrdenada.map((p) => {
      const ativo = podeSolicitar(p.ultima_autorizacao)
      const statusItem = getStatusPaciente(p)
      const ultimaConcluida = getUltimaAutorizacaoConcluida(p)

      if (statusItem?.status === 'concluido') return null

      return (
<div
  key={p.id}
  className="flex rounded-2xl border border-white/60 bg-white/90 border-slate-200/60 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.10)] hover:-translate-y-[1px] transition-all duration-200 overflow-hidden"
>
  {/* ⏰ HORÁRIO */}
<div className="bg-gradient-to-b from-[#3A8FB7]/15 to-[#3A8FB7]/5 px-6 flex items-center justify-center min-w-[130px] border-r border-slate-200/60">
  <span className="text-2xl font-bold text-[#3A8FB7] tracking-tight">
    {p.horario?.slice(0, 5)}
  </span>
</div>

  {/* CONTEÚDO */}
  <div className="flex flex-1 justify-between p-3 items-center">
    
    {/* INFO */}
    <div className="flex flex-col gap-1 min-w-0">
      
      <span className="text-lg font-semibold text-slate-800 leading-tight truncate">
        {p.paciente_nome}
      </span>

      <div className="flex items-center gap-2 flex-wrap">
        
        <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100/70 text-slate-600 border border-slate-200">
          {p.terapia || 'Sem terapia'}
        </span>

        {/* PENDENTE */}
{statusItem?.status === 'pendente' && (
  <span className="flex items-center gap-1 text-xs font-semibold text-yellow-800 bg-yellow-100 px-2 py-0.5 rounded-md">
    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
    Pendente
  </span>
)}

          {/* PROCESSANDO */}
        {(statusItem?.status === 'processando' || statusItem?.status === 'executando') && (
<span className="flex items-center gap-1 text-xs font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
            Processando
          </span>
        )}

          {/* ERRO */}
        {statusItem?.status === 'erro' && (
<span className="flex items-center gap-1 text-xs font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded-md">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
            Erro
          </span>
        )}
      </div>

      <span className="text-xs text-slate-400">
        Última Autorização:{' '}
        {ultimaConcluida
          ? new Date(ultimaConcluida.updated_at + 'Z').toLocaleTimeString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '-'}
      </span>
    </div>

    {/* AÇÕES */}
    <div className="flex flex-col gap-2 ml-4">
      
      <button
        disabled={!ativo || statusItem?.status === 'processando'}
        onClick={() => handleSolicitarLista(p)}
className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition ${
  ativo
    ? 'bg-[#3A8FB7] text-white shadow-md hover:brightness-110 hover:shadow-lg active:scale-[0.97]'
    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
}`}
      >
        <LogIn size={14} />
        Autorização
      </button>

      <button
        onClick={() => handleFalta(p)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 active:scale-[0.97] transition"
      >
        <CalendarX size={14} />
        Falta
      </button>

    </div>
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
          <div className="w-full max-w-[280px] bg-white/70 backdrop-blur-md backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm p-5">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-600 text-center">
                Solicitar Autorização Retroativa
              </h2>
              {/* PACIENTE */}
              <div className="relative">
                <input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value)
                    setPacienteSelecionado(null)
                    setIndexSelecionado(-1)
                    setMostrarSugestoes(true)
                  }}
                  onFocus={() => setMostrarSugestoes(true)}
                  onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
                  onKeyDown={(e) => {
                    if (!sugestoes.length) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setIndexSelecionado((prev) =>
                        prev < sugestoes.length - 1 ? prev + 1 : prev
                      )
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setIndexSelecionado((prev) =>
                        prev > 0 ? prev - 1 : 0
                      )
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (indexSelecionado >= 0) {
                        const p = sugestoes[indexSelecionado]
                        setBusca(p.paciente_nome)
                        setPacienteSelecionado(p)
                        setSugestoes([]) // 🔥 limpa lista
                        setMostrarSugestoes(false) // 🔥 fecha dropdown
                        setIndexSelecionado(-1)
                      }
                    }
                    if (e.key === 'Escape') {
                      setSugestoes([])
                      setMostrarSugestoes(false)
                      setIndexSelecionado(-1)
                    }
                  }}
                  placeholder="Paciente..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]"
                />
                {sugestoes.length > 0 && (
                  <div className="absolute z-10 bg-white border border-slate-200 rounded-lg mt-1 w-full max-h-40 overflow-auto shadow-lg">
                    {sugestoes.map((p, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setBusca(p.paciente_nome)
                          setPacienteSelecionado(p)
                          setSugestoes([])
                          setMostrarSugestoes(false)
                          setIndexSelecionado(-1)
                        }}
                        className={`px-3 py-2 text-sm cursor-pointer ${
                          i === indexSelecionado
                            ? 'bg-blue-100'
                            : 'hover:bg-slate-100'
                        }`}
                      >
                        {p.paciente_nome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              <div>
                <label className="text-xs text-slate-500">Terapia</label>
                <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600 text-center">
                  {terapiaSelecionada || 'Sem Terapia Selecionada'}
                </div>
              </div>
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