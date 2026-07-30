//solicitar//

'use client'

import { useEffect, useState, useMemo } from 'react'

import { getSupabaseClient } from '@/lib/supabase/client'

import { criarAutorizacao, resolverNomeUsuario } from '@/services/autorizacoes.service'

import toast from 'react-hot-toast'

import { Lock, CheckCircle, Megaphone, XCircle } from 'lucide-react'

import { getMachineId } from '@/lib/machine'


// =========================
// TERAPIAS OCULTAS
// (não exibidas na Central de Atendimentos)
// =========================
const TERAPIAS_OCULTAS = [
  'equoterapia',
  'fisioterapia aquática',
  'fisioterapia aquatica',
]

function terapiaOculta(p: any) {
  return (p.terapias || []).some((t: string) =>
    TERAPIAS_OCULTAS.includes((t || '').toLowerCase().trim())
  )
}


const CAMPOS_CENTRAL_AUTORIZACOES = `
    paciente_id,
    paciente_nome,
    cpf,
    data_nascimento,

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
    cancelado_por_nome,
    ultima_autorizacao_anterior
`

const CAMPOS_CENTRAL_AUTORIZACOES_LEGADO = `
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
`


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

  // Snapshot completo e ESTÁVEL do dia (setado só no carregarLista, nunca mutado
  // pelos handlers de falta/manual). Usado para a contagem "N de Total" do badge,
  // que antes encolhia conforme o operador processava sessões.
  const [listaDiaCompleta, setListaDiaCompleta] = useState<any[]>([])

  const [loadingLista, setLoadingLista] = useState(true)

  const supabase = getSupabaseClient()

  const horarios = gerarHorarios()

const unidades = [

  ...new Set(

    (listaDia || [])
      .flatMap(p => p.sala_nome || [])
      .map((s: string) =>
        s
          ?.replace('Unid. ', '')
          ?.split(' - ')[0]
      )
      .filter(Boolean)

  )

].sort()

  const sessoesHoje = useMemo(() => {
    const grupos: Record<number, { horario: string; terapia: string }[]> = {}

    // Conta sobre o dia COMPLETO e estável, excluindo terapias ocultas/blacklist.
    // Assim "N de Total" reflete todas as sessões do dia do paciente e NÃO encolhe
    // ao concluir/marcar falta (que só removem de listaDia, usado na exibição).
    listaDiaCompleta
      .filter(p => !terapiaOculta(p))
      .forEach(p => {
        const id = p.paciente_id
        if (!grupos[id]) grupos[id] = []
        grupos[id].push({ horario: p.horario ?? '', terapia: p.terapias?.[0] ?? '' })
      })

    const lookup: Record<string, { index: number; total: number }> = {}
    Object.entries(grupos).forEach(([id, sessoes]) => {
      sessoes.sort((a, b) => a.horario.localeCompare(b.horario))
      sessoes.forEach((s, i) => {
        lookup[`${id}_${s.horario}_${s.terapia}`] = { index: i + 1, total: sessoes.length }
      })
    })

    return lookup
  }, [listaDiaCompleta])

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

  const [justificativaFalta, setJustificativaFalta] = useState('')

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
			agenda_id: null
          }
        ])
  
      if (error) {
        console.error(error)
        toast.error('Erro ao chamar paciente')
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

  let cancelado = false

  async function carregarMachine() {

    const id =
      await getMachineId()

    if (cancelado) return

    setMachineId(id)

	setWorkerOnline(!!id)
  }

  carregarMachine()

  // Re-checa periodicamente para detectar o worker assim que ele sobe (ou cai),
  // sem exigir refresh manual da página.
  const interval = setInterval(carregarMachine, 5000)

  return () => {
    cancelado = true
    clearInterval(interval)
  }

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

  let { data, error } = await supabase
    .rpc('listar_central_autorizacoes', { p_data: dataFiltro })

  if (
    error &&
    erroColunaPacienteComplementar(error)
  ) {

    const retry = await supabase
      .from('vw_central_autorizacoes')
      .select(CAMPOS_CENTRAL_AUTORIZACOES_LEGADO)
      .eq('data_atendimento', dataFiltro)
      .eq('mostrar_na_tela', true)

    data = retry.data as typeof data
    error = retry.error
  }

  if (error) {
    console.error(error)
    toast.error('Erro ao carregar lista')
    setLoadingLista(false)
    return
  }

  setListaDia(data || [])
  setListaDiaCompleta(data || [])

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
          existente.status === 'erro' ||
          existente.status === 'cancelado'
      ) {

		await supabase
		  .from('fila_autorizacoes')
				.update({
				  status: 'pendente',
				  error_message: null,
				  machine_id: MACHINE_ID || 'WEB',
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
        existente.status === 'concluido' ||
        existente.status === 'concluido_sem_guia'
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

    // validação — apenas campos obrigatórios
    const faltando = []
    if (!p.matricula) faltando.push('Matrícula')
    // TUSS é obrigatório para ASSIM, mas pode faltar
    // CRM e Médico podem faltar (serão preenchidos manualmente no ASSIM)

    if (faltando.length > 0) {
      toast.error(`Dados incompletos: ${faltando.join(', ')}`)
      console.warn('[VALIDAÇÃO] Campos faltando:', { matricula: p.matricula, tuss: p.codigos_tuss, crm: p.crm, medico: p.nome_medico })
      return
    }

    // insert
    const inserted =
      await criarAutorizacao({

        agenda_id: p.agendamentos?.[0],

        paciente_nome:
          p.paciente_nome,
		
		cpf:
		  p.cpf,

		data_nascimento:
		  p.data_nascimento,

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

async function handleFalta(p: any, tipo: 'paciente' | 'terapeuta', justificativa?: string) {

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
      // Registra a atendente responsável também no fluxo de falta: este UPDATE
      // não passa por criarAutorizacao, então o criado_por ficava NULL.
      const criadoPor = await resolverNomeUsuario(supabase)
      const { error } = await supabase
        .from('fila_autorizacoes')
        .update({
          status: 'falta',
          tipo_falta: tipo,
          terapia_falta: p.terapias?.join(' + ') || null,
          justificativa_falta: justificativa || null,
          criado_por: criadoPor
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
	  cpf: p.cpf,
	  data_nascimento: p.data_nascimento,
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
      machine_id: MACHINE_ID || 'WEB'
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
        terapia_falta: p.terapias?.join(' + ') || null,
        justificativa_falta: justificativa || null
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
  
async function handleFaltaDia(paciente: any, justificativa?: string) {

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
      const criadoPor = await resolverNomeUsuario(supabase)
      await supabase
        .from('fila_autorizacoes')
        .update({
          status: 'falta',
          tipo_falta: 'paciente',
          terapia_falta: p.terapias?.join(' + ') || null,
          justificativa_falta: justificativa || null,
          criado_por: criadoPor
        })
        .eq('id', existente.id)

    } else {
      // 🚀 CRIA PADRONIZADO
      const inserted = await criarAutorizacao({
        agenda_id: p.agendamentos?.[0],
        paciente_nome: p.paciente_nome,
		cpf: p.cpf,
		data_nascimento: p.data_nascimento,
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
        machine_id: MACHINE_ID || 'WEB'
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
          terapia_falta: p.terapias?.join(' + ') || null,
          justificativa_falta: justificativa || null
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

  try {
    // Atendente responsável — gravada também no UPDATE (não passa por criarAutorizacao).
    const criadoPor = await resolverNomeUsuario(supabase)
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
		  criado_por: criadoPor,
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
		cpf: p.cpf,
		data_nascimento: p.data_nascimento,
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
        machine_id: MACHINE_ID || 'WEB'
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
// ⛔ CANCELAR PROCESSAMENTO
// =========================

async function handleCancelarProcessamento(p: any) {
  try {
    const { data: existente } = await supabase
      .from('fila_autorizacoes')
      .select('id, status')
      .eq('paciente_id', p.paciente_id)
      .eq('data_atendimento', p.data_atendimento)
      .eq('horario', p.horario)
      .eq('tuss', p.codigos_tuss?.[0])
      .eq('status', 'processando')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!existente) {
      toast.error('Nenhum item em processamento encontrado')
      return
    }

    // Identifica quem está cancelando (para rastreio de autoria)
    const { data: { user } } = await supabase.auth.getUser()
    let nomeUsuario = user?.email ?? 'Desconhecido'
    if (user) {
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('nome')
        .eq('id', user.id)
        .maybeSingle()
      if (perfil?.nome) nomeUsuario = perfil.nome
    }

    const { error } = await supabase
      .from('fila_autorizacoes')
      .update({
        status: 'cancelado',
        cancelado_por_nome: nomeUsuario,
        cancelado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existente.id)
      .eq('status', 'processando')

    if (error) {
      toast.error('Erro ao cancelar solicitação')
      return
    }

    toast.success('Solicitação cancelada')

    setListaDia(prev =>
      prev.map(item =>
        buildCardKey(item) === buildCardKey(p)
          ? { ...item, status_final: 'cancelado', cancelado_por_nome: nomeUsuario }
          : item
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
    String(p.terapias?.[0] || '')
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
// REALTIME STATUS CARD
// =========================

// =========================
// REALTIME STATUS CARD
// =========================

useEffect(() => {

  const channel = supabase
    .channel(`realtime-status-card-${dataSelecionada}`)

    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'fila_autorizacoes',
        filter: `data_atendimento=eq.${dataSelecionada}`
      },

      (payload: any) => {

        console.log('REALTIME:', payload)

        const novo = payload.new as any

        if (!novo) return
		
		if (
		  String(novo.data_atendimento).slice(0, 10)
		  !==
		  String(dataSelecionada).slice(0, 10)
		) {
		  return
		}

        setListaDia(prev => {

          return prev
            .map(item => {

              const mesmoItem =

                String(item.paciente_id)

                ===

                String(novo.paciente_id)

                &&

                String(item.data_atendimento)

                ===

                String(novo.data_atendimento)

                &&

                String(item.horario)
                  .slice(0, 5)

                ===

                String(novo.horario)
                  .slice(0, 5)

                &&

                String(item.codigos_tuss?.[0])

                ===

                String(novo.tuss)

              if (!mesmoItem) {
                return item
              }

              // REMOVE DA TELA
              if (novo.status === 'concluido' || novo.status === 'concluido_sem_guia') {
                return null
              }

              // ATUALIZA STATUS
              return {
                ...item,
                status_final: novo.status,
                cancelado_por_nome: novo.cancelado_por_nome ?? item.cancelado_por_nome
              }
            })

            .filter(Boolean)
        })
      }
    )

    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }

}, [])


  // =========================
  // 🎨 UI
  // =========================

  return (
    <div className="p-6 min-h-[calc(100vh-80px)] bg-background">
      {/* HEADER */}
      <div className="mb-6 px-5 py-3 bg-card border border-border rounded-2xl shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-600">
          Central de Atendimentos
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestão diária de presenças, faltas e autorizações
        </p>
        {!workerOnline && (
          <div className="
            mt-4
            rounded-xl
            border border-amber-200
            bg-amber-50
            px-4
            py-3
            text-sm
            text-amber-800
            flex
            items-center
            gap-2
          ">
            <span className="text-base">⚠</span>

            <span>
              Worker não detectado neste computador — abra o sistema no PC onde o robô de autorização está instalado e em execução.
            </span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-5">
        {/* ========================= */}
        {/* CARD PRINCIPAL */}
        {/* ========================= */}
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6">
	
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
				.filter(
				  (p) => !terapiaOculta(p)
				)
				.filter((p) => {
				
				const unidadesPaciente =
				  (p.sala_nome || []).map((s: string) =>
					s
					  ?.replace('Unid. ', '')
					  ?.split(' - ')[0]
				  )

				const matchUnidade =
				  !filtroUnidade ||
				  unidadesPaciente.includes(filtroUnidade)
  
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

          const sessaoKey = `${p.paciente_id}_${p.horario ?? ''}_${p.terapias?.[0] ?? ''}`
          const sessaoInfo = sessoesHoje[sessaoKey]

			  const ativo =
				![
				  'processando',
				  'pendente'
				].includes(p.status_final)

			  const cpfFormatado =
				formatarCpf(p.cpf)

			  const dataNascimentoFormatada =
				formatarDataNascimento(
				  p.data_nascimento
				)

				  return (
			<div
			  key={buildCardKey(p)}
			  className="flex rounded-2xl border border-white/60 bg-white/90 border-slate-200/60 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.10)] hover:-translate-y-[1px] transition-all duration-200 overflow-hidden"
			>
			  {/* ⏰ HORÁRIO */}
			<div className="bg-gradient-to-b from-[#3A8FB7]/15 to-[#3A8FB7]/5 px-6 flex flex-col items-center justify-center gap-1 min-w-[130px] border-r border-slate-200/60">
			  <span className="text-2xl font-bold text-[#3A8FB7] tracking-tight">
				{p.horario?.slice(0, 5)}
			  </span>
			  {sessaoInfo && sessaoInfo.total > 1 && (
			    <span className="text-[11px] font-bold text-white bg-[#3A8FB7] px-2.5 py-0.5 rounded-full shadow-sm">
			      {sessaoInfo.index}/{sessaoInfo.total}
			    </span>
			  )}
			</div>

{/* CONTEÚDO */}
<div className="flex flex-1 justify-between p-2 items-start gap-4">

  <div className="flex flex-col gap-2 min-w-0">

    {/* NOME */}
    <span className="text-lg font-semibold text-slate-800 leading-tight truncate">
      {formatarNome(p.paciente_nome)}
    </span>

		{(cpfFormatado || dataNascimentoFormatada) && (
		  <span className="text-xs text-slate-500 leading-tight">
			{[
			  cpfFormatado
				? `CPF: ${cpfFormatado}`
				: null,

			  dataNascimentoFormatada
				? `Nascimento: ${dataNascimentoFormatada}`
				: null
			]
			  .filter(Boolean)
			  .join(' | ')}
		  </span>
		)}
		
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

      {p.status_final === 'cancelado' && (
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
          {p.cancelado_por_nome
            ? `Cancelada por: ${p.cancelado_por_nome}`
            : 'Cancelada'}
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

{p.status_final === 'processando' && (
  <button
    onClick={() => handleCancelarProcessamento(p)}
    className="w-full flex items-start justify-center gap-1.5 text-[12px] px-2 py-1.5 rounded-lg font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 tracking-tight leading-none"
  >
    <XCircle size={14} className="relative -top-[1px]" />
    Cancelar
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
        onClick={() => { setConfirmarFaltaDia(false); setJustificativaFalta('') }}
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

      {/* JUSTIFICATIVA */}
      <textarea
        value={justificativaFalta}
        onChange={e => setJustificativaFalta(e.target.value)}
        placeholder="Justificativa obrigatória"
        rows={3}
        className="w-full mt-4 px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-700 placeholder:text-slate-400"
      />

      {/* ESPAÇO */}
      <div className="mt-4 flex flex-col gap-3">

        {/* SÓ ESTE */}
        <button
          disabled={!justificativaFalta.trim()}
          onClick={async () => {
            if (!pacienteFaltaDia) return
            await handleFalta(pacienteFaltaDia, 'paciente', justificativaFalta)
            setJustificativaFalta('')
            setConfirmarFaltaDia(false)
          }}
          className="w-full py-2.5 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Só este atendimento
        </button>

        {/* DIA TODO */}
        <button
          disabled={!justificativaFalta.trim()}
          onClick={async () => {
            if (!pacienteFaltaDia) return
            const justificativa = justificativaFalta
			setConfirmarFaltaDia(false)
			setPacienteFaltaDia(null)
            setJustificativaFalta('')
			await handleFaltaDia(pacienteFaltaDia, justificativa)
          }}
          className="w-full py-2.5 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
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
function formatarCpf(
  cpf?: string | number | null
) {

  if (cpf == null) return ''

  return String(cpf)
    .replace(/\D/g, '')
}

function formatarDataNascimento(
  data?: string | null
) {

  if (!data) return ''

  const texto = String(data).trim()

  const iso =
    texto.match(/^(\d{4})-(\d{2})-(\d{2})/)

  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`
  }

  return texto
}

function erroColunaPacienteComplementar(
  error: any
) {

  const mensagem = [
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    mensagem.includes('cpf') ||
    mensagem.includes('data_nascimento')
  )
}