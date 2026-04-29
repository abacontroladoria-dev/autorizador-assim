//solicitar//

'use client'

import { useEffect, useState, useMemo } from 'react'

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

  const [indexSelecionado, setIndexSelecionado] = useState<number>(-1)

  const [atualizando, setAtualizando] = useState(false)

  const [pacientes, setPacientes] = useState<any[]>([])

  const [terapiaSelecionada, setTerapiaSelecionada] = useState<string | null>(null)

  const horarios = gerarHorarios()

  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)

  const [filtroHorario, setFiltroHorario] = useState('')
  
  const [modalFalta, setModalFalta] = useState(false)
  
  const [pacienteFalta, setPacienteFalta] = useState<any>(null)
  
  const [confirmarFaltaDia, setConfirmarFaltaDia] = useState(false)
  
  const [pacienteFaltaDia, setPacienteFaltaDia] = useState<any>(null)

  const [machineId, setMachineId] = useState<string | null>(null)

  const [classificacoes, setClassificacoes] = useState<any[]>([])
  
  const chamarResponsavel = async (paciente: any) => {
    try {
      const { error } = await supabase
        .from('chamada_paciente')
        .insert([
          {
            nome: paciente.paciente_nome,
            sala: paciente.sala || 'Recepção 1',
			agenda_id: paciente.id
          }
        ])
  
      if (error) {
        console.error(error)
        alert('Erro ao chamar paciente')
        return
      }
  
      console.log('✅ CHAMADA INSERIDA')
  
    } catch (err) {
      console.error(err)
    }
  }

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
  
  
  // =====================================
  // CARREGAMENTO DAS CLASSIFICACOES
  // =====================================
  
async function carregarClassificacoes() {
  const { data, error } = await supabase
    .from('paciente_classificacao')
    .select('*')

  if (!error) {
    setClassificacoes(data || [])
  }
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

  // 🔥 pede sincronização (FORÇADA)
  const { error } = await supabase
    .from('sync_controle')
    .update({
      status: 'pendente',
      force: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1)

  if (error) {
    console.error(error)
    setAtualizando(false)
    return
  }

  let status = 'pendente'
  let tentativas = 0

  // 🔄 acompanha status pelo banco (não precisa mais function)
  while (status === 'running' && tentativas < 20) {
    await new Promise(r => setTimeout(r, 1500))

    const { data } = await supabase
      .from('sync_controle')
      .select('status')
      .eq('id', 1)
      .single()

    status = data?.status || 'idle'

    console.log('STATUS:', status)

    tentativas++
  }

  await new Promise(r => setTimeout(r, 1000))

  await carregarLista()

  setAtualizando(false)
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
      const filtrado = data.filter((p: any) =>
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
	  if (!machineId) {
	  toast.error('Máquina não identificada')
	  return
	}
	try {
    const statusItem = statusMap[`${p.paciente_id}_${p.horario}`]

    if (!podeSolicitar(p.ultima_autorizacao, statusItem?.status)) {
      toast.error('Aguarde 30 minutos desde a última autorização')
      return
    }

    // 🔍 VERIFICAR SE JÁ EXISTE NA FILA
    const { data: existente } = await supabase
      .from('fila_autorizacoes')
      .select('id, status')
      .eq('paciente_id', p.paciente_id)
      .eq('data_atendimento', p.data_atendimento)
      .eq('horario', p.horario)
      .maybeSingle()

    if (existente) {
      // 🚫 já em processamento
      if (['pendente', 'processando'].includes(existente.status)) {
        toast.error('Paciente já está sendo atendido')
        return
      }

      // 🔁 erro → reaproveita
      if (existente.status === 'erro') {
        const { error } = await supabase
          .from('fila_autorizacoes')
          .update({ status: 'pendente', machine_id: machineId })
          .eq('id', existente.id)

        if (error) {
          console.error(error)
          toast.error('Erro ao reprocessar')
          return
        }

        toast.success('Reprocessando autorização 🔁')
        await carregarFila()
        return
      }

      // ⏱️ regra de tempo
      if (!podeSolicitar(p.ultima_autorizacao)) {
        toast.error('Aguarde 30 minutos desde a última autorização')
        return
      }
    }

    // 🚀 INSERIR NA FILA COM agenda_id
    const { error } = await supabase
      .from('fila_autorizacoes')
      .insert([
        {
          agenda_id: p.id,
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
          status: 'pendente',
		  machine_id: machineId
        }
      ])

    if (error) {
      console.error(error)
      toast.error(error.message)
      return
    }

    toast.success('Autorização iniciada 🚀')
    await carregarFila()

  } catch (err) {
    console.error(err)
    toast.error('Erro inesperado')
  }
}

  // ==========================
  // IDENTIFICAR PACIENTE ASSIM
  // ==========================

async function marcarAssim(p: any) {
  const { error } = await supabase
    .from('paciente_classificacao')
    .upsert([
      {
        paciente_id: p.paciente_id,
        paciente_nome: p.paciente_nome,
        convenio_tipo: 'ASSIM'
      }
    ], { onConflict: 'paciente_id' })

  if (error) {
    console.error(error)
    toast.error('Erro ao marcar ASSIM')
    return
  }
  
  toast.success(`✔ ${p.paciente_nome} classificado`)
  
  setClassificacoes(prev => [
    ...prev.filter(c => c.paciente_id !== p.paciente_id),
    {
      paciente_id: p.paciente_id,
      paciente_nome: p.paciente_nome,
      convenio_tipo: 'ASSIM'
    }
  ])
}


  // ======================================
  // IDENTIFICAR PACIENTE DE OUTRO CONVENIO
  // ======================================
  
async function marcarOutro(p: any) {
  const { error } = await supabase
    .from('paciente_classificacao')
    .upsert([
      {
        paciente_id: p.paciente_id,
        paciente_nome: p.paciente_nome,
        convenio_tipo: 'OUTRO_CONVENIO'
      }
    ], { onConflict: 'paciente_id' })

  if (error) {
    console.error(error)
    toast.error('Erro ao classificar')
    return
  }

  toast.success(`✔ ${p.paciente_nome} classificado`)

  setListaDia(prev =>
    prev.filter(item => item.paciente_id !== p.paciente_id)
  )  
  setClassificacoes(prev => [
    ...prev.filter(c => c.paciente_id !== p.paciente_id),
    {
      paciente_id: p.paciente_id,
      paciente_nome: p.paciente_nome,
      convenio_tipo: 'OUTRO_CONVENIO'
    }
  ])
}

  // =========================
  // ❌ FALTA
  // =========================

async function handleFalta(p: any, tipo: 'paciente' | 'terapeuta') {
	if (!machineId) {
	  toast.error('Máquina não identificada')
	  return
	}
	try {
    const { data: existente } = await supabase
      .from('fila_autorizacoes')
      .select('id, status')
      .eq('paciente_id', p.paciente_id)
      .eq('data_atendimento', p.data_atendimento)
      .eq('horario', p.horario)
      .maybeSingle()

    // 🔁 SE JÁ EXISTE (inclusive erro)
    if (existente) {
      const { error } = await supabase
        .from('fila_autorizacoes')
        .update({ 
          status: 'falta',
          tipo_falta: tipo,
		  machine_id: machineId,
          terapia_falta: p.terapia || null
        })
        .eq('id', existente.id)

      if (error) {
        console.error(error)
        toast.error('Erro ao atualizar falta')
        return
      }

      toast.success('Falta registrada (atualizado)')
      setListaDia((prev) => prev.filter((item) => item.id !== p.id))
      await carregarFila()
      return
    }

    // 🚀 SE NÃO EXISTE → INSERT NORMAL
    const { error } = await supabase
      .from('fila_autorizacoes')
      .insert([
	  {
        paciente_id: p.paciente_id,
        paciente_nome: p.paciente_nome,
        data_atendimento: hoje,
        horario: p.horario,
        status: 'falta',
        tipo_falta: tipo,
		machine_id: machineId,
        terapia_falta: p.terapia || null
      }
	  ])

    if (error) {
      console.error(error)
      toast.error('Erro ao registrar falta')
      return
    }

    setListaDia((prev) => prev.filter((item) => item.id !== p.id))
    toast.success('Falta registrada com sucesso')

  } catch (err) {
    console.error(err)
    toast.error('Erro inesperado')
  }
}

  // ===========================
  // ❌ FALTA DIA DE ATENDIMENTO
  // ===========================
async function handleFaltaDia(paciente: any) {
	if (!machineId) {
	  toast.error('Máquina não identificada')
	  return
	}
  const dataAtendimento = paciente.data_atendimento

  // 🔥 USAR A LISTA DA TELA (fonte confiável)
  const atendimentos = listaDia.filter(
    (p) =>
      p.paciente_id === paciente.paciente_id &&
      p.data_atendimento === dataAtendimento
  )

  for (const p of atendimentos) {
    const { data: existente } = await supabase
      .from('fila_autorizacoes')
      .select('id')
      .eq('paciente_id', p.paciente_id)
      .eq('data_atendimento', dataAtendimento)
      .eq('horario', p.horario)
      .maybeSingle()

    if (existente) {
      await supabase
        .from('fila_autorizacoes')
        .update({
          status: 'falta',
          tipo_falta: 'paciente',
		  machine_id: machineId,
          terapia_falta: p.terapia || null
        })
        .eq('id', existente.id)
    } else {
      await supabase
        .from('fila_autorizacoes')
        .insert([
		{
          paciente_id: p.paciente_id,
          paciente_nome: p.paciente_nome,
          data_atendimento: dataAtendimento,
          horario: p.horario,
          status: 'falta',
          tipo_falta: 'paciente',
		  machine_id: machineId,
          terapia_falta: p.terapia || null
        }
		])
    }
  }

  toast.success('Faltas aplicadas para o dia todo')

  // 🔥 remove da tela imediatamente
  setListaDia(prev =>
    prev.filter(p => p.paciente_id !== paciente.paciente_id)
  )

  await carregarFila()
}
 
  // =========================
  // 📤 FORM RETROATIVO
  // =========================

 async function handleSolicitar() {
	if (!machineId) {
	  toast.error('Máquina não identificada')
	  return
	}
  if (!pacienteSelecionado || !data || !horario) {
    toast.error('Preencha todos os campos')
    return
  }

  try {
    // 🔥 BUSCAR AGENDAMENTO CORRETO
    const { data: agenda, error: erroBusca } = await supabase
      .from('agenda_orbita')
      .select('*')
      .eq('paciente_nome', pacienteSelecionado.paciente_nome)
      .eq('data_atendimento', data)
      .eq('horario', horario)
      .single()

    if (erroBusca || !agenda) {
      console.error(erroBusca)
      toast.error('Não foi possível localizar o agendamento')
      return
    }

    // 🚀 INSERIR NA FILA (COM agenda_id CORRETO)
    const { error } = await supabase
      .from('fila_autorizacoes')
      .insert([
        {
          agenda_id: agenda.id,
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
          status: 'pendente',
		  machine_id: machineId
        }
      ])

    if (error) {
      console.error(error)
      toast.error('Erro ao solicitar')
      return
    }

    toast.success('Autorização enviada 🚀')

    // 🔄 RESET FORM
    setBusca('')
    setPacienteSelecionado(null)
    setHorario('')

  } catch (err) {
    console.error(err)
    toast.error('Erro inesperado')
  }
}

  const hojeFormatado = new Date().toLocaleDateString('pt-BR')

  const [filtro, setFiltro] = useState('')

  // =========================
  // CONCLUSAO MANUAL
  // =========================
  
async function handleManualLista(p: any) {
  if (!machineId) {
    toast.error('Máquina não identificada')
    return
  }

  try {
    // 🔍 VERIFICA SE JÁ EXISTE NA FILA
    const { data: existente } = await supabase
      .from('fila_autorizacoes')
      .select('id, status')
      .eq('paciente_id', p.paciente_id)
	  .eq('data_atendimento', p.data_atendimento)
      .eq('horario', p.horario)
      .maybeSingle()

    // 🔁 SE JÁ EXISTE → ATUALIZA
    if (existente) {
      const { error } = await supabase
        .from('fila_autorizacoes')
        .update({
          status: 'concluido',
          completion_type: 'manual',
          numero_autorizacao: 'MANUAL',
          completed_at: new Date().toISOString(),
          machine_id: machineId
        })
        .eq('id', existente.id)

      if (error) {
        console.log('ERRO COMPLETO:', JSON.stringify(error, null, 2))
        toast.error('Erro ao atualizar manual')
        return
      }

      toast.success('Atualizado como manual 📝')

    } else {
      // 🚀 SE NÃO EXISTE → INSERT
      const { error } = await supabase
        .from('fila_autorizacoes')
        .insert([
          {
            agenda_id: p.id,
            paciente_id: p.paciente_id,
            paciente_nome: p.paciente_nome,
            empresa: p.empresa,
            matricula: p.matricula,
            dep: p.dep,
            crm: p.crm,
            nome_medico: p.nome_medico,
            tuss: p.tuss,
            data_atendimento: p.data_atendimento,
            horario: p.horario,

            status: 'concluido',
            completion_type: 'manual',
            numero_autorizacao: 'MANUAL',
            machine_id: machineId,
            completed_at: new Date().toISOString()
          }
        ])

      if (error) {
        console.error(error)
        toast.error('Erro ao registrar manual')
        return
      }

      toast.success('Autorização manual registrada 📝')
    }

    // 🔥 REMOVE DA LISTA (igual falta)
    setListaDia(prev => prev.filter(item => item.id !== p.id))

    await carregarFila()

  } catch (err) {
    console.error(err)
    toast.error('Erro inesperado')
  }
}
  // =========================
  // ⏱️ REGRA 30 MINUTOS
  // =========================

	function podeSolicitar(ultima: string | null, status?: string) {
	  // 🔥 ERRO SEMPRE LIBERA
	  if (status === 'erro') return true

	  if (!ultima) return true

	  const agora = new Date()
	  const ultimaData = new Date(ultima + 'Z')
	  const diffMs = agora.getTime() - ultimaData.getTime()
	  const diffMin = diffMs / 1000 / 60

	  return diffMin >= 30
	}

  // =================================
  // PEGAR A CLASSIFICACAO DE CONVENIO
  // =================================
  
	function getClassificacao(p: any) {
	  return classificacaoMap[p.paciente_id]
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

  // =========================
  // CARREGAR AGENDA
  // =========================
  
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
        { event: 'UPDATE', schema: 'public', table: 'agenda_orbita' },
        (payload: any) => {
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
	  carregarClassificacoes()

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
          new Map(data.map((p: any) => [p.paciente_nome, p])).values()
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
  // BUSCAR MAQUINA
  // =========================
	useEffect(() => {
	  async function carregarMachineId() {
		const { data: userData } = await supabase.auth.getUser()

		const user = userData?.user
		if (!user) return

		const { data, error } = await supabase
		  .from('maquinas')
		  .select('id')
		  .eq('user_id', user.id)
		  .single()

		if (error) {
		  console.error('Erro ao buscar machine_id:', error)
		  return
		}

		setMachineId(data?.id || null)
	  }

	  carregarMachineId()
	}, [])


  // =========================
  // BUSCAR STATUS DO PACIENTE
  // =========================
	const classificacaoMap = useMemo(() => {
	  const map: any = {}

	  classificacoes.forEach(c => {
		map[c.paciente_id] = c
	  })

	  return map
	}, [classificacoes])

	const statusMap = useMemo(() => {
	  const map: any = {}

	  filaStatus.forEach(f => {
		const key = `${f.paciente_id}_${f.horario}`
		map[key] = f
	  })

	  return map
	}, [filaStatus])

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
			    
				const classificacao = classificacaoMap[p.paciente_id]
				const statusItem = statusMap[`${p.paciente_id}_${p.horario}`]

				// 🚫 REMOVE OUTROS CONVÊNIOS
				if (classificacao?.convenio_tipo === 'OUTRO_CONVENIO') {
				  return false
				}
			  
			  // 🚫 ESCONDER FALTA E CONCLUÍDO
			  if (['falta', 'concluido'].includes(statusItem?.status)) {
				return false
			  }

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
                  Nenhum resultado encontrado 🔍
                </p>
              )
            }
			const listaOrdenada = [...listaFiltrada].sort((a, b) => {
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
				  const statusItem = statusMap[`${p.paciente_id}_${p.horario}`]
				  const classificacao = getClassificacao(p)
				  const ativo = podeSolicitar(p.ultima_autorizacao,statusItem?.status)
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
<div className="flex flex-1 justify-between p-2 items-center gap-4">

  <div className="flex flex-col gap-2 min-w-0">

    {/* NOME */}
    <span className="text-lg font-semibold text-slate-800 leading-tight truncate">
      {p.paciente_nome}
    </span>

    {/* TRIAGEM (AÇÃO) */}
    {!classificacao && (
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => marcarAssim(p)}
          className="text-[11px] px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
        >
          ✅ ASSIM
        </button>

        <button
          onClick={() => marcarOutro(p)}
          className="text-[11px] px-2 py-1 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
        >
          🟡 Outro
        </button>
      </div>
    )}

    {/* BADGES (INFORMAÇÃO) */}
    <div className="flex items-center gap-2 flex-wrap">

      {/* TERAPIA */}
      <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100/70 text-slate-600 border border-slate-200">
        {p.terapia || 'Sem terapia'}
      </span>

      {/* CLASSIFICAÇÃO */}
      {classificacao?.convenio_tipo === 'ASSIM' && (
        <span className="text-[11px] px-2 py-0.5 rounded-md bg-green-100 text-green-700 border border-green-200 font-medium">
          ✔ ASSIM
        </span>
      )}

      {/* STATUS */}
      {statusItem?.status === 'pendente' && (
        <span className="flex items-center gap-1 text-xs font-semibold text-yellow-800 bg-yellow-100 px-2 py-0.5 rounded-md">
          <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
          Pendente
        </span>
      )}

      {(statusItem?.status === 'processando' || statusItem?.status === 'executando') && (
        <span className="flex items-center gap-1 text-xs font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
          Processando
        </span>
      )}

      {statusItem?.status === 'erro' && (
        <span className="flex items-center gap-1 text-xs font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded-md">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
          Erro
        </span>
      )}
    </div>

    {/* ÚLTIMA AUTORIZAÇÃO */}
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
  <div className="flex flex-col gap-2 ml-4 w-[220px]">

    {/* LINHA 1 */}
    <div className="flex gap-2">
      <button
        disabled={!ativo || statusItem?.status === 'processando'}
        onClick={() => handleSolicitarLista(p)}
        className={`flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-lg font-medium transition ${
          ativo
            ? 'bg-[#3A8FB7] text-white shadow-md hover:brightness-110'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        🔐 Autorização
      </button>

      <button
        onClick={() => chamarResponsavel(p)}
        className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-lg font-medium bg-emerald-600 text-white hover:brightness-110 transition"
      >
        📢 Chamar
      </button>
    </div>

    {/* LINHA 2 */}
    <div className="flex gap-2">
      <button
        onClick={() => handleManualLista(p)}
        className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-lg font-medium bg-slate-500 text-white hover:bg-slate-600 transition"
      >
        📝 Manual
      </button>

      <button
        onClick={() => {
          setPacienteFalta(p)
          setModalFalta(true)
        }}
        className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition"
      >
        🚫 Falta
      </button>
    </div>

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
                        setSugestoes([])
                        setMostrarSugestoes(false)
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


{/* MODAL FALTA */}
{modalFalta && (
  <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">

    <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[360px] border border-slate-200">

      {/* FECHAR (X) */}
      <button
        onClick={() => setModalFalta(false)}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 text-lg"
      >
        ✕
      </button>

      {/* TÍTULO */}
      <h2 className="text-lg font-semibold text-slate-800 text-center">
        Como deseja registrar a falta?
      </h2>

      {/* PACIENTE */}
      <p className="text-sm text-slate-600 text-center mt-2">
        {pacienteFalta?.paciente_nome}
      </p>

      {/* ESPAÇAMENTO */}
		<div className="mt-6 flex flex-col gap-3">

		  {/* PACIENTE */}
		  <button
			onClick={() => {
			  if (!pacienteFalta) return
			  setPacienteFaltaDia(pacienteFalta)
			  setConfirmarFaltaDia(true)
			  setModalFalta(false)
			}}
			className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 bg-white transition font-medium hover:bg-blue-50 hover:border-blue-300"
		  >
			Falta do Paciente
		  </button>

		  {/* TERAPEUTA */}
		  <button
			onClick={async () => {
			  if (!pacienteFalta) return
			  await handleFalta(pacienteFalta, 'terapeuta')
			  setModalFalta(false)
			}}
			className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 bg-white transition font-medium hover:bg-orange-50 hover:border-orange-300"
		  >
			Falta do Terapeuta
		  </button>

		</div>

    </div>
  </div>
)}


{/* MODAL FALTA CONFIRMACAO */}
{confirmarFaltaDia && (
  <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">

    <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[360px] border border-slate-200">

      {/* BOTÃO FECHAR (X) */}
      <button
        onClick={() => setConfirmarFaltaDia(false)}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 text-lg"
      >
        ✕
      </button>

      {/* TÍTULO */}
      <h2 className="text-lg font-semibold text-slate-800 text-center">
        Como deseja registrar a falta?
      </h2>

      {/* PACIENTE */}
      <p className="text-sm text-slate-600 text-center mt-2">
        {pacienteFaltaDia?.paciente_nome}
      </p>

      {/* ESPAÇO */}
      <div className="mt-6 flex flex-col gap-3">

        {/* SÓ ESTE */}
        <button
          onClick={async () => {
            if (!pacienteFaltaDia) return
            await handleFalta(pacienteFaltaDia, 'paciente')
            setConfirmarFaltaDia(false)
          }}
          className="w-full py-2.5 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 transition"
        >
          Só este atendimento
        </button>

        {/* DIA TODO */}
        <button
          onClick={async () => {
            if (!pacienteFaltaDia) return
			setConfirmarFaltaDia(false)
			setPacienteFaltaDia(null)

			await handleFaltaDia(pacienteFaltaDia)
          }}
          className="w-full py-2.5 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition"
        >
          Todos os atendimentos do dia
        </button>

      </div>

      {/* AVISO */}
      <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
        Essa ação não pode ser desfeita facilmente.
      </p>

    </div>
  </div>
)}
	</div>
  )
}