// ─── Constantes ───────────────────────────────────────────────────────────────

export const ORDEM_DIAS = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta"] as const

export type DiaSemana = typeof ORDEM_DIAS[number]

// Compatibilidade geográfica: Padre Miguel é isolado; Realengo ↔ Fazendinha se cruzam.
export const UNIDADES_COMPAT: Record<string, string[]> = {
  "Realengo":     ["Realengo", "Fazendinha"],
  "Fazendinha":   ["Fazendinha", "Realengo"],
  "Padre Miguel": ["Padre Miguel"],
}

// ─── Entidades ────────────────────────────────────────────────────────────────

export interface SessaoFaltada {
  faltaId:         string        // fila_autorizacoes.id
  pacienteId:      string
  paciente:        string
  profissional:    string        // controle_terapeutico.profissional_nome
  profissionalId:  number | null // controle_terapeutico.profissional_id
  terapia:         string        // controle_terapeutico.terapia_nome
  terapiaExibicao: string        // csv_grades_profissionais.terapia_exibicao_nome
  dia:             DiaSemana | string
  hora:            string        // "08:00"
  unidade:         string        // csv_grades_profissionais.sala_nome
  dataOriginal:    string        // ISO date "2026-06-23"
  justificativa:   string | null
  origemFalta:     string        // tipo_falta — display only, não é filtro de elegibilidade
  semJoin:         boolean       // tita_agendamento_id era null → sem dados para identificar prof/unidade
}

export interface SugestaoReposicao {
  profissional:   string
  terapia:        string
  terapiaExibicao: string
  data:           string   // ISO date
  dia:            string   // "Terca"
  hora:           string   // "10:00"
  unidade:        string
  mesmaUnidade:   boolean
  prioridade:     "P1" | "P2"
}

// ─── Status e resultado ───────────────────────────────────────────────────────

export type ElegibilidadeStatus =
  | "irrecuperavel"  // falta na sexta-feira → sem dias posteriores na semana
  | "sem_dados"      // tita_agendamento_id null → profissional/unidade desconhecidos
  | "elegivel"

export type StatusReposicao = "pendente" | "aceito" | "recusado" | "inviavel"

export type ResultadoReposicao =
  | { falta: SessaoFaltada; status: "irrecuperavel" }
  | { falta: SessaoFaltada; status: "sem_dados" }
  | { falta: SessaoFaltada; status: "sem_disponibilidade" }
  | { falta: SessaoFaltada; status: "com_sugestao"; sugestoes: SugestaoReposicao[] }

// ─── Persistência localStorage ────────────────────────────────────────────────

export interface ReposicaoAceiteEntry {
  status:    StatusReposicao
  sugestao?: SugestaoReposicao   // preenchido quando status = 'aceito'
  atualizadoEm: string           // ISO timestamp
}

// Chave localStorage: "reposicao_v1"
// Estrutura: Record<faltaId, ReposicaoAceiteEntry>
export type ReposicaoStorage = Record<string, ReposicaoAceiteEntry>

// ─── Sessão da agenda do paciente (para visualização) ────────────────────────

export interface SessaoAgendada {
  data:            string
  dia:             string
  hora:            string
  unidade:         string
  terapia:         string   // nome interno (para busca de slots)
  terapiaExibicao: string
  profissional:    string
}

// ─── Sessão presente (para empty state) ──────────────────────────────────────

export interface SessaoPresente {
  data:            string
  dia:             string
  hora:            string
  unidade:         string
  terapiaExibicao: string
}

// ─── Visão geral da semana ────────────────────────────────────────────────────

export type CategoriaReposicao =
  | 'todos_comparecidos'
  | 'sem_reposicao'
  | 'reposicao_parcial'
  | 'reposicao_completa'

export interface PacienteSemana {
  pacienteId:          string
  pacienteNome:        string
  categoria:           CategoriaReposicao
  totalFaltas:         number  // faltas elegíveis (CT indisponivel)
  totalResolvidas:     number  // aceito + recusado no localStorage
  totalIrrecuperaveis: number  // faltas na sexta-feira (sem dias restantes)
}
