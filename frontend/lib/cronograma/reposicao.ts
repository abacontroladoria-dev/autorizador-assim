import {
  ORDEM_DIAS,
  UNIDADES_COMPAT,
  type DiaSemana,
  type ResultadoReposicao,
  type SessaoFaltada,
  type SugestaoReposicao,
} from "@/types/reposicao"
import { pm } from "@/lib/cronograma/helpers"

// ─── Helpers de dia ───────────────────────────────────────────────────────────

export function diasPosteriores(dia: string): string[] {
  const idx = ORDEM_DIAS.indexOf(dia as DiaSemana)
  if (idx < 0) return []
  return ORDEM_DIAS.slice(idx + 1) as string[]
}

// Extrai a palavra-chave da unidade a partir do nome completo da sala.
// Ex: "Unid. Realengo - Sala 5" → "Realengo"
export function extrairUnidade(sala: string): string {
  if (sala.includes('Realengo'))     return 'Realengo'
  if (sala.includes('Fazendinha'))   return 'Fazendinha'
  if (sala.includes('Padre Miguel')) return 'Padre Miguel'
  return sala
}

export function unidadesCompativeis(unidade: string): string[] {
  const key = extrairUnidade(unidade)
  return UNIDADES_COMPAT[key] ?? [key]
}

// ─── Tipos internos do algoritmo ──────────────────────────────────────────────

export interface SlotLivre {
  profissional:    string
  terapia:         string
  terapiaExibicao: string
  data:            string   // ISO date
  dia:             string   // "Terca"
  hora:            string   // "10:00"
  unidade:         string
}

export interface AgendaPacienteSlot {
  data:    string
  dia:     string
  hora:    string
  unidade: string
}

// ─── Verificações de conflito ─────────────────────────────────────────────────

function temConflitoPaciente(
  slot: SlotLivre,
  agendaPaciente: AgendaPacienteSlot[],
): boolean {
  return agendaPaciente.some(
    a => a.data === slot.data && a.hora === slot.hora,
  )
}

// R5.4: sessões consecutivas (40 min) em unidades diferentes são inviáveis.
// Compara no nível da unidade (prédio), não da sala, pois "Sala 5" e "Sala 21"
// são salas distintas dentro da mesma unidade Realengo.
function temConflitoCrossUnidade(
  slot: SlotLivre,
  agendaPaciente: AgendaPacienteSlot[],
): boolean {
  const slotMin  = pm(slot.hora) ?? 0
  const slotUnid = extrairUnidade(slot.unidade)
  const mesmaData = agendaPaciente.filter(a => a.data === slot.data)

  for (const a of mesmaData) {
    if (extrairUnidade(a.unidade) === slotUnid) continue  // mesma unidade → ok
    const aMin = pm(a.hora) ?? 0
    if (Math.abs(slotMin - aMin) === 40) return true
  }
  return false
}

// R5.1: inserir o slot não pode criar gap (intervalo ≠ 40 min) entre sessões
// da mesma unidade no dia de destino. Usa extrairUnidade para agrupar salas
// do mesmo prédio (ex: "Sala 5" e "Sala 21" → ambas "Realengo").
function temGapNoDestino(
  slot: SlotLivre,
  agendaPaciente: AgendaPacienteSlot[],
): boolean {
  const slotUnid   = extrairUnidade(slot.unidade)
  const sessoesDia = agendaPaciente
    .filter(a => a.data === slot.data && extrairUnidade(a.unidade) === slotUnid)
    .map(a => pm(a.hora) ?? 0)
  const slotMin = pm(slot.hora) ?? 0
  const todos = [...new Set([...sessoesDia, slotMin])].sort((a, b) => a - b)
  for (let i = 0; i < todos.length - 1; i++) {
    if (todos[i + 1] - todos[i] !== 40) return true
  }
  return false
}

// ─── Avaliação de um slot candidato ──────────────────────────────────────────

interface AvaliacaoSlot {
  viavel:       boolean
  motivo?:      string
  prioridade:   "P1" | "P2"
  mesmaUnidade: boolean
  slot:         SlotLivre
}

function avaliarSlot(
  slot:           SlotLivre,
  falta:          SessaoFaltada,
  agendaVirtual:  AgendaPacienteSlot[],
): AvaliacaoSlot {
  const mesmoProf    = slot.profissional === falta.profissional
  const prioridade: "P1" | "P2" = mesmoProf ? "P1" : "P2"

  // Normaliza sala_nome → palavra-chave da unidade para comparar com UNIDADES_COMPAT.
  // Ex: "Unid. Realengo - Sala 5" e "Unid. Realengo - Sala 21" → ambas "Realengo".
  const faltaUnidNorm = extrairUnidade(falta.unidade)
  const slotUnidNorm  = extrairUnidade(slot.unidade)
  const unidsOk       = unidadesCompativeis(falta.unidade)
  const mesmaUnidade  = slotUnidNorm === faltaUnidNorm
  // Se a unidade da falta é desconhecida (tita_agendamento_id null + slot liberado),
  // não rejeita por unidade — o coordenador avalia a sugestão.
  const unidadeOk     = falta.unidade === '' || unidsOk.includes(slotUnidNorm)

  if (!unidadeOk) {
    return { viavel: false, motivo: "unidade_incompativel", prioridade, mesmaUnidade, slot }
  }

  // R2.1 (temDiaComSessoes) é OMITIDO no contexto de reposição:
  // a regra "PERMITE EXCEÇÃO" (CLAUDE.md R2.1) e quando o paciente perde um dia
  // inteiro, a agendaVirtual estaria vazia — rejeitar tudo seria incorreto.
  // O coordenador avalia se a reposição isolada vale a pena ao aceitar/recusar.

  if (temConflitoPaciente(slot, agendaVirtual)) {
    return { viavel: false, motivo: "conflito_paciente", prioridade, mesmaUnidade, slot }
  }

  if (temConflitoCrossUnidade(slot, agendaVirtual)) {
    return { viavel: false, motivo: "cross_unidade", prioridade, mesmaUnidade, slot }
  }

  // R5.1: inserção não pode criar gap entre sessões no dia de destino.
  // agendaVirtual cresce com cada reposição alocada, garantindo que múltiplas
  // reposições no mesmo dia também sejam verificadas entre si.
  if (temGapNoDestino(slot, agendaVirtual)) {
    return { viavel: false, motivo: "gap_destino", prioridade, mesmaUnidade, slot }
  }

  return { viavel: true, prioridade, mesmaUnidade, slot }
}

// ─── Ordenação final das sugestões ────────────────────────────────────────────

function ordenarSugestoes(a: AvaliacaoSlot, b: AvaliacaoSlot): number {
  // P1 antes de P2
  if (a.prioridade !== b.prioridade) return a.prioridade < b.prioridade ? -1 : 1
  // mesma unidade primeiro
  if (a.mesmaUnidade !== b.mesmaUnidade) return a.mesmaUnidade ? -1 : 1
  // data mais próxima
  if (a.slot.data !== b.slot.data) return a.slot.data < b.slot.data ? -1 : 1
  // hora mais cedo
  return a.slot.hora < b.slot.hora ? -1 : 1
}

// ─── Função principal ─────────────────────────────────────────────────────────

export function calcularSugestoes(
  faltas:         SessaoFaltada[],
  slotsLivres:    SlotLivre[],
  agendaPaciente: AgendaPacienteSlot[],
): ResultadoReposicao[] {
  const slotsAlocados = new Set<string>()

  // Agenda virtual: começa com as sessões existentes do paciente e cresce com
  // cada reposição alocada. Isso garante que:
  // (a) R5.1 (gap) seja verificado entre múltiplas reposições no mesmo dia;
  // (b) R2.1 (quando reintroduzido futuramente) use a agenda atualizada.
  const agendaVirtual: AgendaPacienteSlot[] = [...agendaPaciente]

  function chaveSlot(s: SlotLivre): string {
    return `${s.terapia}|${s.profissional}|${s.data}|${s.hora}`
  }

  return faltas.map((falta): ResultadoReposicao => {
    if (falta.semJoin) {
      return { falta, status: "sem_dados" }
    }

    // Usa comparação de data ISO em vez de diasPosteriores() para suportar
    // reposições em semanas futuras (tabela pode não ter dados da semana corrente).
    const dataOriginal = falta.dataOriginal

    // Filtra slots candidatos: mesma terapia (P1 = mesmo prof, P2 = prof diferente),
    // data posterior à falta, não já alocado por outra falta.
    const candidatos: AvaliacaoSlot[] = slotsLivres
      .filter(s => s.terapia === falta.terapia)
      .filter(s => s.data > dataOriginal)
      .filter(s => !slotsAlocados.has(chaveSlot(s)))
      .map(s => avaliarSlot(s, falta, agendaVirtual))
      .filter(a => a.viavel)
      .sort(ordenarSugestoes)

    if (candidatos.length === 0) {
      return { falta, status: "sem_disponibilidade" }
    }

    // Reserva todos os candidatos para evitar duplicação em outra falta.
    // Adiciona apenas o melhor ao agendaVirtual: representa a escolha mais provável
    // e evita que todas as opções criem conflitos artificiais para faltas subsequentes.
    candidatos.forEach(a => slotsAlocados.add(chaveSlot(a.slot)))
    agendaVirtual.push({
      data:    candidatos[0].slot.data,
      dia:     candidatos[0].slot.dia,
      hora:    candidatos[0].slot.hora,
      unidade: candidatos[0].slot.unidade,
    })

    const sugestoes: SugestaoReposicao[] = candidatos.map(a => ({
      profissional:    a.slot.profissional,
      terapia:         a.slot.terapia,
      terapiaExibicao: a.slot.terapiaExibicao,
      data:            a.slot.data,
      dia:             a.slot.dia,
      hora:            a.slot.hora,
      unidade:         a.slot.unidade,
      mesmaUnidade:    a.mesmaUnidade,
      prioridade:      a.prioridade,
    }))

    return { falta, status: "com_sugestao", sugestoes }
  })
}
