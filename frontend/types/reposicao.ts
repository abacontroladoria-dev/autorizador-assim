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
  profissional:    string        // csv_reposicao_faltas.profissional_nome (fallback: controle_terapeutico)
  profissionalId:  number | null // controle_terapeutico.profissional_id
  terapia:         string        // csv_reposicao_faltas.terapia_nome (fallback: controle_terapeutico, depois fila_autorizacoes)
  terapiaExibicao: string        // idem, mais EXIB_NOME (IDs especiais ABA) como prioridade máxima
  dia:             DiaSemana | string
  hora:            string        // "08:00"
  unidade:         string        // csv_reposicao_faltas.sala_nome — única fonte de sala para uma FALTA
                                  // (controle_terapeutico não tem coluna de sala; csv_grades_profissionais
                                  // nunca tem a linha, só cobre "hoje em diante"). Fica '' se a semana
                                  // estiver fora da cobertura de csv_reposicao_faltas (caso raro).
  dataOriginal:    string        // ISO date "2026-06-23"
  justificativa:   string | null
  origemFalta:     string        // tipo_falta — display only, não é filtro de elegibilidade
  semJoin:         boolean       // nenhuma fonte (csv_reposicao_faltas, controle_terapeutico, fila) forneceu a terapia
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

// ─── Sessão concluída (status CONCLUÍDO na grade) ────────────────────────────

export interface SessaoConcluida {
  data:            string
  dia:             string
  hora:            string
  unidade:         string
  terapia:         string   // terapia de ação (ex.: "Coordenador de Caso")
  terapiaExibicao: string   // terapia de exibição — pode divergir da ação (ex.: "Psicologia ABA")
  profissional:    string   // pode ser '' se não resolvido
  // true quando fila_autorizacoes.status = 'glosa': sessão aconteceu normalmente,
  // "glosa" é o convênio negando/questionando o pagamento depois — não afeta
  // comparecimento nem elegibilidade de reposição, só o rótulo exibido.
  glosa:           boolean
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
  totalFaltas:         number  // faltas elegíveis (status='falta', não cancelada/revertida)
  totalResolvidas:     number  // aceito + recusado no localStorage
  totalRepostas:       number  // só aceito no localStorage — reposição de fato realizada
  totalIrrecuperaveis: number  // faltas na sexta-feira (sem dias restantes)
}
