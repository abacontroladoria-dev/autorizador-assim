//solicitar//

'use client'

import { useEffect, useState } from 'react'

import { getSupabaseClient } from '@/lib/supabase/client'

import { criarAutorizacao } from '@/services/autorizacoes.service'

import toast from 'react-hot-toast'

import { Lock, CheckCircle, Megaphone, XCircle } from 'lucide-react'

import { getMachineId } from '@/lib/machine'

export default function SolicitarPage() {
  const hoje = (() => {
	  const d = new Date()

	  const ano = d.getFullYear()
	  const mes = String(
		d.getMonth() + 1
	  ).padStart(2, '0')

	  const dia = String(
		d.getDate()
	  ).padStart(2, '0')

	  return `${ano}-${mes}-${dia}`
	})()

  const [dataSelecionada, setDataSelecionada] = useState(hoje)

  const [listaDia, setListaDia] = useState<any[]>([])

  const [loadingLista, setLoadingLista] = useState(true)

  const supabase = getSupabaseClient()

  const horarios = gerarHorarios()

  const unidades = [

	  ...new Set(

		(listaDia || [])
		  .map(p =>
			p.sala_nome
			  ?.replace('Unid. ', '')
			  ?.split(' - ')[0]
		  )
		  .filter(Boolean)

	  )

	].sort()

  const convenios = [

	  ...new Set(

		(listaDia || [])
		  .map(p => p.convenio_nome)
		  .filter(Boolean)

	  )

	].sort()

  const [filtroHorario, setFiltroHorario] = useState('')
  
  const [filtroUnidade, setFiltroUnidade] = useState('')
  
  const [filtroConvenio, setFiltroConvenio] = useState('')
  
  const [modalFalta, setModalFalta] = useState(false)
  
  const [pacienteFalta, setPacienteFalta] = useState<any>(null)
  
  const [confirmarFaltaDia, setConfirmarFaltaDia] = useState(false)
  
  const [pacienteFaltaDia, setPacienteFaltaDia] = useState<any>(null)

  const [filtro, setFiltro] = useState('')
  
  const [MACHINE_ID, setMachineId] = useState<string | null>(null)
  
  const [workerOnline, setWorkerOnline] = useState(false)
  
  const chamarResponsavel = async (paciente: any) => {
    try {
      const { error } = await supabase
        .from('chamada_paciente')
        .insert([
          {
            nome: paciente.paciente_nome,
            sala:  'Recepção 1',
			agenda_id: paciente.agendamentos?.[0]
          }
        ])
  
      if (error) {
        console.error(error)
        alert('Erro ao chamar paciente')
        return
      }
  
      } catch (err) {
      console.error(err)
    }
  }

// =========================
// AJUSTE DE NOME
// =========================
function formatarNome(nome?: string) {

  if (!nome) return ''

  return nome
    .toLowerCase()
    .split(' ')
    .map(p =>
      p.charAt(0).toUpperCase() +
      p.slice(1)
    )
    .join(' ')
}


// =========================
// CARREGAR ID MAQUINA
// =========================

useEffect(() => {

  async function carregarMachine() {

    const id =
      await getMachineId()

    setMachineId(id)

	setWorkerOnline(!!id)
  }

  carregarMachine()

}, [])

// =========================
// PODE SOLICITAR
// =========================

function podeSolicitar(
  ultima: string | null,
  status?: string
) {

  if (status === 'erro') {
    return true
  }

  if (!ultima) {
    return true
  }

  const agora = new Date()

  const ultimaData =
    new Date(ultima)

  const diffMs =
    agora.getTime() -
    ultimaData.getTime()

  const diffMin =
    diffMs / 1000 / 60

  return diffMin >= 30
}

  // =========================
  // 📥 CARREGAR LISTA
  // =========================

async function carregarLista() {

  setLoadingLista(true)

	const dataFiltro = dataSelecionada

  console.log('DATA FILTRO:', dataFiltro)

const { data, error } = await supabase
  .from('vw_central_autorizacoes')
  .select(`
    paciente_id,
    paciente_nome,
    horario,
    data_atendimento,

    codigos_tuss,

    convenio_nome,
    convenio_id,

    sala_nome,

    empresa,
    matricula,
    dep,

    crm,
    nome_medico,

    status_final,
    mostrar_na_tela,
    tipo_fluxo,

    terapias,
    profissionais,
    agendamentos,

    horario_autorizacao,
	ultima_autorizacao_anterior
  `)
  .eq('data_atendimento', dataFiltro)
  .order('horario', { ascending: true })

if (error) {
  console.error(error)
  toast.error('Erro ao carregar lista')
  setLoadingLista(false)
  return
}

  console.log(
    (data || []).map((p: any) => ({
      paciente: p.paciente_nome,
      status: p.status_final,
    }))
  )

  setListaDia(data || [])
  
  setLoadingLista(false)
}

// =========================
// SOLICITAR LISTA
// =========================

async function handleSolicitarLista(
  p: any
) {

  if (!MACHINE_ID) {

    toast.error(
      'Máquina não identificada'
    )

    return
  }

  try {

    const statusAtual = p.status_final
    // evita clique duplo
    if (
      p.status_final === 'processando'
    ) {
      return
    }

    // regra 30 min
    if (
      !podeSolicitar(
        p.ultima_autorizacao_anterior,
        statusAtual
      )
    ) {

      toast.error(
        'Aguarde 30 minutos desde a última autorização'
      )

      return
    }

    // busca existente
    const { data: existente } =
      await supabase
        .from('fila_autorizacoes')
        .select('*')
		.eq('paciente_id', p.paciente_id)
		.eq('data_atendimento', p.data_atendimento)
		.eq('horario', p.horario)
		.eq(
		  'tuss',
		  p.codigos_tuss?.[0]
		)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle()
		
    // reaproveita
    if (existente) {

      if (
        existente.status === 'erro'
      ) {

		await supabase
		  .from('fila_autorizacoes')
				.update({
				  status: 'pendente',
				  error_message: null,
				  machine_id: MACHINE_ID,
				  updated_at: new Date().toISOString()
				})
		  .eq('id', existente.id)

        toast.success(
          'Reprocessando 🔄'
        )
		setListaDia(prev =>
		  prev.map(item =>
			buildCardKey(item) === buildCardKey(p)
			  ? {
				  ...item,
				  status_final: 'pendente'
				}
			  : item
		  )
		)
		
        return
      }

      if (
        existente.status === 'processando'
      ) {

        toast.error(
          'Já está em execução'
        )

        return
      }

      if (
        existente.status === 'concluido'
      ) {

        toast.error(
          'Já autorizado'
        )

        return
      }

      toast(
        'Já existe registro'
      )

      return
    }

    // validação
    if (
      !p.matricula ||
      !p.codigos_tuss?.length
    ) {

      toast.error(
        'Dados incompletos'
      )

      return
    }

    // insert
    const inserted =
      await criarAutorizacao({

        agenda_id: p.agendamentos?.[0],

        paciente_nome:
          p.paciente_nome,

        matricula:
          p.matricula,

        paciente_id:
          p.paciente_id,

        data:
          p.data_atendimento,

        horario:
          p.horario,
		
		terapia_exibicao_id:
		  p.terapia_exibicao_id,

        tuss1:
          p.codigos_tuss?.[0] || null,

        status:
          'pendente',

        empresa:
          p.empresa,

        dep:
          p.dep,

        crm:
          p.crm,

        nome_medico:
          p.nome_medico,

        terapia_nome:
          p.terapias?.join(' + '),

        machine_id:
          MACHINE_ID
      })

    if (!inserted) {

      toast.error(
        'Erro ao solicitar'
      )

      return
    }

    toast.success(
      'Autorização enviada 🚀'
    )

	setListaDia(prev =>
	  prev.map(item =>
		buildCardKey(item) === buildCardKey(p)
		  ? {
			  ...item,
			  status_final: 'pendente'
			}
		  : item
	  )
	)

  } catch (err) {

    console.error(err)

    toast.error(
      'Erro inesperado'
    )
  }
}

  // =========================
  // ❌ FALTA
  // =========================

async function handleFalta(p: any, tipo: 'paciente' | 'terapeuta') {

    if (!MACHINE_ID) {
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
		.eq(
  'tuss',
  p.codigos_tuss?.[0]
)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle()

    // 🔁 SE JÁ EXISTE → ATUALIZA
    if (existente) {
      const { error } = await supabase
        .from('fila_autorizacoes')
        .update({
          status: 'falta',
          tipo_falta: tipo,
          terapia_falta: p.terapias?.join(' + ') || null
        })
        .eq('id', existente.id)

      if (error) {
        console.error(error)
        toast.error('Erro ao atualizar falta')
        return
      }


      toast.success('Falta registrada (atualizado)')
		setListaDia(prev =>
		  prev.filter(
			item =>
			  buildCardKey(item) !== buildCardKey(p)
		  )
		)
      return
    }

    // 🚀 SE NÃO EXISTE → CRIA PADRONIZADO
    const inserted = await criarAutorizacao({
      agenda_id: p.agendamentos?.[0],
      paciente_nome: p.paciente_nome,
      matricula: p.matricula || null,
      data: p.data_atendimento, // ⚠️ corrigido (antes usava "hoje")
      horario: p.horario,
	  paciente_id: p.paciente_id,
	  terapia_nome: p.terapias?.join(' + '),
	  terapia_exibicao_id: p.terapia_exibicao_id,
      tuss1: p.codigos_tuss?.[0] || null,
      status: 'falta',
      empresa: p.empresa || null,
      dep: p.dep || null,
      crm: p.crm || null,
      nome_medico: p.nome_medico || null,
      machine_id: tipo === 'paciente' ? 'falta_paciente' : 'falta_terapeuta'
    })

    if (!inserted) {
      toast.error('Erro ao registrar falta')
      return
    }

    // 🔥 COMPLEMENTA CAMPOS DE FALTA
    await supabase
      .from('fila_autorizacoes')
      .update({
        tipo_falta: tipo,
        terapia_falta: p.terapias?.join(' + ') || null
      })
      .eq('id', inserted.id)

    toast.success('Falta registrada com sucesso')
	
	setListaDia(prev =>
	  prev.filter(
		item =>
		  buildCardKey(item) !== buildCardKey(p)
	  )
	)

  } catch (err) {
    console.error(err)
    toast.error('Erro inesperado')
  }
}
  // ===========================
  // ❌ FALTA DIA DE ATENDIMENTO
  // ===========================
  
async function handleFaltaDia(paciente: any) {

    if (!MACHINE_ID) {
	  toast.error('Máquina não identificada')
	  return
	}
	
  const dataAtendimento = paciente.data_atendimento

const atendimentos = Object.values(

  listaDia
    .filter(
      (p) =>
        p.paciente_id === paciente.paciente_id &&
        p.data_atendimento === dataAtendimento
    )

    .reduce((acc: any, p: any) => {

      const key = buildCardKey(p)

      if (!acc[key]) {
        acc[key] = p
      }

      return acc

    }, {})

)

  for (const p of atendimentos as any[]) {

    const { data: existente } = await supabase
      .from('fila_autorizacoes')
      .select('id')
		.eq('paciente_id', p.paciente_id)
		.eq('data_atendimento', p.data_atendimento)
		.eq('horario', p.horario)
		.eq(
		  'tuss',
		  p.codigos_tuss?.[0]
		)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle()

    if (existente) {
      // 🔄 ATUALIZA
      await supabase
        .from('fila_autorizacoes')
        .update({
          status: 'falta',
          tipo_falta: 'paciente',
          terapia_falta: p.terapias?.join(' + ') || null
        })
        .eq('id', existente.id)

    } else {
      // 🚀 CRIA PADRONIZADO
      const inserted = await criarAutorizacao({
        agenda_id: p.agendamentos?.[0],
        paciente_nome: p.paciente_nome,
        matricula: p.matricula || null,
        data: dataAtendimento,
		paciente_id: p.paciente_id,
        horario: p.horario,
		terapia_nome: p.terapias?.join(' + '),
		terapia_exibicao_id: p.terapia_exibicao_id,
        tuss1: p.codigos_tuss?.[0] || null,
        status: 'falta',
        empresa: p.empresa || null,
        dep: p.dep || null,
        crm: p.crm || null,
        nome_medico: p.nome_medico || null,
        machine_id: 'falta_dia'
      })

      if (!inserted) {
        console.log('Erro ao criar falta:', p.paciente_nome)
        continue
      }

	
      // 🔥 GARANTE CAMPOS ESPECÍFICOS DE FALTA
      await supabase
        .from('fila_autorizacoes')
        .update({
          tipo_falta: 'paciente',
          terapia_falta: p.terapias?.join(' + ') || null
        })
        .eq('id', inserted.id)
    }
  }

  toast.success('Faltas aplicadas para o dia todo')

  // 🔥 remove da tela
	setListaDia(prev =>
	  prev.filter(
		item =>
		  item.paciente_id !== paciente.paciente_id ||
		  item.data_atendimento !== paciente.data_atendimento
	  )
	)

} 
  

  // =========================
  // CONCLUSAO MANUAL
  // =========================
  
async function handleManualLista(p: any) {
	    if (!MACHINE_ID) {
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
		.eq(
		  'tuss',
		  p.codigos_tuss?.[0]
		)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle()

    // 🔁 SE JÁ EXISTE → ATUALIZA
    if (existente) {
      const { error } = await supabase
        .from('fila_autorizacoes')
		.update({
		  status: 'concluido',
		  completion_type: 'manual',
		  numero_autorizacao: 'MANUAL',
		  horario_autorizacao: new Date().toISOString(),
		  completed_at: new Date().toISOString(),
		})
        .eq('id', existente.id)

      if (error) {
        console.log('ERRO COMPLETO:', JSON.stringify(error, null, 2))
        toast.error('Erro ao atualizar manual')
        return
      }

	
      toast.success('Atualizado como manual 📝')

    } else {
      // 🚀 SE NÃO EXISTE → INSERT PADRONIZADO
      const inserted = await criarAutorizacao({
        agenda_id: p.agendamentos?.[0],
        paciente_nome: p.paciente_nome,
        matricula: p.matricula,
        data: p.data_atendimento,
		paciente_id: p.paciente_id,
        horario: p.horario,
        tuss1: p.codigos_tuss?.[0] || null,
        status: 'concluido',
		horario_autorizacao: new Date().toISOString(),
        empresa: p.empresa,
		terapia_nome: p.terapias?.join(' + '),
		terapia_exibicao_id: p.terapia_exibicao_id,
        dep: p.dep,
        crm: p.crm,
        nome_medico: p.nome_medico,
        machine_id: MACHINE_ID
      })

      if (!inserted) {
        toast.error('Erro ao registrar manual')
        return
      }

      // 🔥 GARANTE QUE FIQUE COMO MANUAL (extra segurança)
      await supabase
        .from('fila_autorizacoes')
		.update({
		  completion_type: 'manual',
		  numero_autorizacao: 'MANUAL',
		  horario_autorizacao: new Date().toISOString(),
		  completed_at: new Date().toISOString(),
		})
        .eq('id', inserted.id)

      toast.success('Autorização manual registrada 📝')
    }

    // 🔥 REMOVE DA LISTA (igual falta)
    setListaDia(prev =>
	  prev.filter(
		item =>
		  buildCardKey(item) !== buildCardKey(p)
	  )
	)

  } catch (err) {
    console.error(err)
    toast.error('Erro inesperado')
  }
}  


// =========================
// BUILD CARD KEY
// =========================

function buildCardKey(p: any) {
  return [
    String(p.paciente_id),
    String(p.data_atendimento),
    String(p.horario),
  ].join('_')
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
// DATA DA AUTORIZACAO
// =========================

useEffect(() => {

  carregarLista()

}, [dataSelecionada])


  // =========================
  // 🎨 UI
  // =========================

  return (
    <div className="p-6 min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* HEADER */}
      <div className="mb-6 px-5 py-3 bg-white/70 backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-600">
          Central de Atendimentos
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestão diária de presenças, faltas e autorizações
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5">
        {/* ========================= */}
        {/* CARD PRINCIPAL */}
        {/* ========================= */}
        <div className="bg-white/70 backdrop-blur-md border border-slate-200/70 rounded-2xl shadow-sm p-6">
	
{/* HEADER COM FILTRO */}
<div className="grid grid-cols-12 gap-3 mb-5">

  {/* 🔎 BUSCA */}
  <input
    type="text"
    placeholder="Buscar paciente..."
    value={filtro}
    onChange={(e) => setFiltro(e.target.value)}
    className="
      col-span-3
      border border-slate-200
      rounded-lg
      px-3 py-1.5
      text-sm
      bg-white
      text-slate-600
      shadow-sm
      focus:outline-none
      focus:ring-2
      focus:ring-[#3A8FB7]/40
    "
  />

  {/* 📅 DATA */}
  <input
    type="date"
    value={dataSelecionada}
    onChange={(e) =>
      setDataSelecionada(e.target.value)
    }
    className="
      col-span-2
      border border-slate-200
      rounded-lg
      px-3 py-1.5
      text-sm
      bg-white
      text-slate-600
      shadow-sm
      focus:outline-none
      focus:ring-2
      focus:ring-[#3A8FB7]/40
    "
  />

  {/* ⏰ HORÁRIO */}
  <div className="relative col-span-2">
    <select
      value={filtroHorario}
      onChange={(e) =>
        setFiltroHorario(e.target.value)
      }
      className="
        w-full
        appearance-none
        bg-white
        border border-slate-200
        rounded-lg
        px-3 py-1.5 pr-8
        text-sm
        text-slate-600
        shadow-sm
        focus:outline-none
        focus:ring-2
        focus:ring-[#3A8FB7]/40
      "
    >
      <option value="">Horário</option>

      {horarios.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>

    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
      ▼
    </div>
  </div>

  {/* 🏥 CONVÊNIO */}
  <div className="relative col-span-3">
    <select
      value={filtroConvenio}
      onChange={(e) =>
        setFiltroConvenio(e.target.value)
      }
      className="
        w-full
        appearance-none
        bg-white
        border border-slate-200
        rounded-lg
        px-3 py-1.5 pr-8
        text-sm
        text-slate-600
        shadow-sm
        focus:outline-none
        focus:ring-2
        focus:ring-[#3A8FB7]/40
      "
    >
      <option value="">Convênio</option>

      {convenios.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>

    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
      ▼
    </div>
  </div>

  {/* 🏢 UNIDADE */}
  <div className="relative col-span-2">
    <select
      value={filtroUnidade}
      onChange={(e) =>
        setFiltroUnidade(e.target.value)
      }
      className="
        w-full
        appearance-none
        bg-white
        border border-slate-200
        rounded-lg
        px-3 py-1.5 pr-8
        text-sm
        text-slate-600
        shadow-sm
        focus:outline-none
        focus:ring-2
        focus:ring-[#3A8FB7]/40
      "
    >
      <option value="">Unidade</option>

      {unidades.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>

    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
      ▼
    </div>
  </div>

</div>
          {loadingLista ? (
            <p className="text-sm text-slate-400">Carregando...</p>
          ) : (() => {
				const listaFiltrada = (
				  listaDia || []
				)
				.filter(
				  (p) => p.mostrar_na_tela
				)
				.filter((p) => {
				
				const unidade =
				  p.sala_nome
					?.replace('Unid. ', '')
					?.split(' - ')[0]

				const matchUnidade =
				  !filtroUnidade ||
				  unidade === filtroUnidade
  
			  const matchNome =
				!filtro ||
				(p.paciente_nome || '').toLowerCase().includes(filtro.toLowerCase())

			  const matchHorario =
				!filtroHorario ||
				p.horario?.slice(0, 5) === filtroHorario

			  const matchConvenio =
			    !filtroConvenio ||
			    p.convenio_nome === filtroConvenio
  
			  return (
					  matchNome &&
					  matchHorario &&
					  matchUnidade &&
					  matchConvenio
					)
			})
			
				
            if (listaFiltrada.length === 0) {
              return (
                <p className="text-sm text-slate-400">
                  Nenhum resultado encontrado 🔍
                </p>
              )
            }
			const listaOrdenada = [...listaFiltrada].sort((a: any, b: any) => {

			  // horário
				if (a.horario !== b.horario) {
				  return a.horario.localeCompare(b.horario)
				}

			  // nome
			  return (a.paciente_nome || '')
				.localeCompare(b.paciente_nome || '')

			})
			return (
			  <div className="space-y-3">
				{(listaOrdenada as any[]).map((p) => {
				const ativo =
				  ![
					'processando',
					'pendente'
				  ].includes(p.status_final)

				  return (
			<div
			  key={buildCardKey(p)}
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
      {formatarNome(p.paciente_nome)}
    </span>

    {/* BADGES (INFORMAÇÃO) */}
    <div className="flex items-center gap-2 flex-wrap">

		  {/* TERAPIA */}
		  <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
		  	{p.terapias?.join(' + ') || 'Sem terapia'}
		  </span>

		{/* CONVENIO */}
		<span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100/70 text-slate-600 border border-slate-200">
		  {p.convenio_nome || 'Sem convênio'}
		</span>

      {/* STATUS */}
      {(p.status_final === 'processando') &&
	  (
        <span className="flex items-center gap-1 text-xs font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
          Processando
        </span>
      )}

		{p.status_final === 'pendente' && (
		  <span className="flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
			<span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
			Na fila
		  </span>
		)}

      {p.status_final === 'erro' && (
        <span className="flex items-center gap-1 text-xs font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded-md">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
          Erro
        </span>
      )}
    </div>

{/* ÚLTIMA AUTORIZAÇÃO */}
{p.tipo_fluxo === 'autorizacao' && (
  <span className="text-xs text-slate-400">
    Última autorização:{' '}
    {p.ultima_autorizacao_anterior
      ? new Date(
          p.ultima_autorizacao_anterior
        ).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : '-'}
  </span>
)}


  </div>

<div className="flex flex-col gap-1 ml-4 w-[135px]">

{p.tipo_fluxo === 'autorizacao' ? (

  <button
    disabled={
      !workerOnline ||
      !ativo ||
      p.status_final === 'processando'
    }
    onClick={() => handleSolicitarLista(p)}
    className={`w-full flex items-start justify-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg font-medium leading-none tracking-tight ${
      !workerOnline
        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
        : ativo
          ? 'bg-[#3A8FB7] text-white shadow-md hover:brightness-110'
          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
    }`}
  >
    <Lock size={14} className="relative -top-[1px]" />

    {
      !workerOnline
        ? 'Sistema Offline'
        : 'Autorizar'
    }
  </button>

) : (

  <button
    disabled={!ativo}
    onClick={() => handleManualLista(p)}
    className={`w-full flex items-start justify-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg font-medium leading-none tracking-tight ${
		  ativo
			? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700'
			: 'bg-slate-200 text-slate-400 cursor-not-allowed'
	  }`}
  >
  <CheckCircle
    size={14}
    className="relative -top-[1px]"
  />

  Presença
</button>

)}

<button
  onClick={() => chamarResponsavel(p)}
  className="w-full flex items-start justify-center gap-1.5 text-[12px] px-2 py-1.5 rounded-lg font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 tracking-tight leading-none"
>
  <Megaphone size={14} className="relative -top-[1px]" />
  Chamar
</button>

<button
  onClick={() => {
    setPacienteFalta(p)
    setModalFalta(true)
  }}
  className="w-full flex items-start justify-center gap-1.5 text-[12px] px-2 py-1.5 rounded-lg font-medium bg-red-100 text-red-600 hover:bg-red-200 tracking-tight leading-none"
>
  <XCircle size={14} className="relative -top-[1px]" />
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