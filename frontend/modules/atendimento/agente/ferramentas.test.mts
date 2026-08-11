// Exercita as ferramentas do agente contra o Supabase LOCAL, sem LLM nenhum.
//
// O ponto do teste é provar que o caminho da IA passa pelas MESMAS regras do
// caminho humano: vaga tem que existir na grade, não pode estar no passado,
// não pode estar prometida a outro, e cancelar devolve a vaga.
//
// Rodar com a stack local de pé:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service role local> \
//   npx tsx modules/atendimento/agente/ferramentas.test.mts
//
// Não usa framework de teste para não acoplar o módulo a um runner: é um script
// que sai com código 1 se qualquer asserção falhar.

import { createClient } from '@supabase/supabase-js'
import { AppointmentRepository } from '../repositories/appointment.repository.js'
import { AvailabilityRepository } from '../repositories/availability.repository.js'
import { AuditRepository } from '../repositories/audit.repository.js'
import { AppointmentService } from '../services/appointment.service.js'
import { FerramentasAgente, MOTIVO } from './ferramentas.js'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG = 'a0000000-0000-0000-0000-000000000001'

if (!KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY (use a chave da stack LOCAL).')
  process.exit(1)
}
if (!URL.includes('127.0.0.1') && !URL.includes('localhost')) {
  console.error(`Recusando rodar contra ${URL}: este teste grava e apaga agendamentos, use a stack local.`)
  process.exit(1)
}

let falhas = 0
function checar(condicao: boolean, descricao: string, extra?: unknown) {
  if (condicao) {
    console.log(`  ok   ${descricao}`)
  } else {
    falhas++
    console.log(`  FALHA ${descricao}`)
    if (extra !== undefined) console.log('        ', JSON.stringify(extra))
  }
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

const repo = new AppointmentRepository(supabase)
const service = new AppointmentService(
  repo,
  new AvailabilityRepository(supabase),
  new AuditRepository(supabase),
)
const ferramentas = new FerramentasAgente(service, repo, {
  orgId: ORG,
  contactId: null,
  conversationId: null,
})

const criados: string[] = []

try {
  console.log('\n1. consultar_especialidades_disponiveis')
  const esp: any = await ferramentas.executar('consultar_especialidades_disponiveis', {})
  checar(esp.ok === true, 'retorna ok', esp)
  checar(Array.isArray(esp.especialidades) && esp.especialidades.length > 0, 'lista ao menos uma especialidade')
  const terapia = esp.especialidades?.[0]
  checar(typeof terapia?.terapiaId === 'number', 'especialidade traz terapiaId numérico', terapia)

  console.log('\n2. consultar_horarios_disponiveis')
  const hor: any = await ferramentas.executar('consultar_horarios_disponiveis', {
    // string de propósito: o modelo manda número como texto com frequência
    terapiaId: String(terapia.terapiaId),
    limite: 5,
  })
  checar(hor.ok === true, 'retorna ok', hor)
  checar(hor.horarios?.length > 0, 'lista ao menos um horário')
  const vaga = hor.horarios?.[0]
  checar(/^\d{2}:\d{2}$/.test(vaga?.hora ?? ''), 'hora vem como HH:MM, sem segundos', vaga?.hora)
  checar(!!vaga?.profissional, 'horário identifica o profissional', vaga)

  console.log('\n3. agendar_sessao na vaga oferecida')
  const ag: any = await ferramentas.executar('agendar_sessao', {
    profissionalId: vaga.profissionalId,
    data: vaga.data,
    hora: vaga.hora,
    tipo: 'triagem',
    observacao: 'teste automatizado das ferramentas',
  })
  checar(ag.ok === true, 'reserva aceita', ag)
  if (ag.ok) criados.push(ag.agendamentoId)
  checar(ag.confirmacao?.profissional === vaga.profissional, 'confirmação repete o profissional da vaga', ag.confirmacao)
  checar(ag.confirmacao?.duracaoMin > 0, 'duração deduzida da grade', ag.confirmacao)

  console.log('\n4. a vaga sai da oferta')
  const hor2: any = await ferramentas.executar('consultar_horarios_disponiveis', {
    terapiaId: terapia.terapiaId, limite: 50,
  })
  const aindaOferecida = hor2.horarios?.some(
    (h: any) => h.profissionalId === vaga.profissionalId && h.data === vaga.data && h.hora === vaga.hora,
  )
  checar(aindaOferecida === false, 'vaga reservada não é mais oferecida')

  console.log('\n5. reserva dupla é recusada com motivo específico')
  const dupla: any = await ferramentas.executar('agendar_sessao', {
    profissionalId: vaga.profissionalId, data: vaga.data, hora: vaga.hora,
  })
  checar(dupla.ok === false, 'segunda reserva recusada', dupla)
  checar(dupla.motivo === MOTIVO.VAGA_TOMADA, `motivo é ${MOTIVO.VAGA_TOMADA}`, dupla)

  console.log('\n6. horário que não existe na grade é recusado')
  const inexistente: any = await ferramentas.executar('agendar_sessao', {
    // 03:17 de madrugada nunca é vaga de grade — é exatamente o que o input de
    // horário livre do componente antigo permitia gravar.
    profissionalId: vaga.profissionalId, data: vaga.data, hora: '03:17',
  })
  checar(inexistente.ok === false, 'recusa horário fora da grade', inexistente)
  checar(inexistente.motivo === MOTIVO.VAGA_INEXISTENTE, `motivo é ${MOTIVO.VAGA_INEXISTENTE}`, inexistente)

  console.log('\n7. data no passado é recusada')
  const passado: any = await ferramentas.executar('agendar_sessao', {
    profissionalId: vaga.profissionalId, data: '2026-01-05', hora: vaga.hora,
  })
  checar(passado.ok === false, 'recusa data passada', passado)
  checar(
    passado.motivo === MOTIVO.VAGA_NO_PASSADO || passado.motivo === MOTIVO.VAGA_INEXISTENTE,
    'motivo é passado ou inexistente (a grade antiga também não oferece a vaga)',
    passado,
  )

  console.log('\n8. ferramenta desconhecida não explode')
  const nada: any = await ferramentas.executar('ferramenta_que_nao_existe', {})
  checar(nada.ok === false && nada.motivo === MOTIVO.ERRO_INTERNO, 'devolve recusa em vez de lançar', nada)

  console.log('\n9. argumentos faltando não explodem')
  const semArgs: any = await ferramentas.executar('agendar_sessao', {})
  checar(semArgs.ok === false, 'recusa sem argumentos', semArgs)

  console.log('\n10. cancelar devolve a vaga')
  const canc: any = await ferramentas.executar('cancelar_sessao', {
    agendamentoId: criados[0], motivo: 'teste',
  })
  checar(canc.ok === true, 'cancelamento aceito', canc)
  const hor3: any = await ferramentas.executar('consultar_horarios_disponiveis', {
    terapiaId: terapia.terapiaId, limite: 50,
  })
  const voltou = hor3.horarios?.some(
    (h: any) => h.profissionalId === vaga.profissionalId && h.data === vaga.data && h.hora === vaga.hora,
  )
  checar(voltou === true, 'vaga volta a ser oferecida após cancelamento')

  console.log('\n11. cancelar id inexistente é recusa, não exceção')
  const fantasma: any = await ferramentas.executar('cancelar_sessao', {
    agendamentoId: '00000000-0000-0000-0000-000000000000',
  })
  checar(fantasma.ok === false && fantasma.motivo === MOTIVO.NAO_ENCONTRADO, 'motivo nao_encontrado', fantasma)
} finally {
  // Limpa o que o teste criou, inclusive os cancelados.
  for (const id of criados) {
    await supabase.schema('central').from('appointments').delete().eq('id', id)
  }
  await supabase.schema('central').from('appointments')
    .delete().eq('organization_id', ORG)
    .eq('description', 'teste automatizado das ferramentas')
}

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} ASSERÇÃO(ÕES) FALHARAM`)
process.exit(falhas === 0 ? 0 : 1)
