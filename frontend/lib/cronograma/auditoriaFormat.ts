// Tradução do antes/depois (JSONB cru) da trilha de auditoria de Ocupação de
// Salas em algo legível pra usuário leigo — ver HistoricoAuditoriaModal.tsx.
// Nada de mostrar JSON puro na tela: cada campo relevante vira uma linha
// "Rótulo: valor antigo → valor novo" (edição) ou "Rótulo: valor" (criação/exclusão).

import { CAPACIDADE_LABEL_CURTO, STATUS_LABEL_CURTO, type SalaCapacidade, type SalaStatus } from "./salasTypes"
import type { CronogramaTrilhaAcao, CronogramaTrilhaTabela } from "@/services/salasAuditoria.service"

/** Só o mínimo necessário pra calcular o resumo — usado tanto ao gravar (antes de a linha existir) quanto ao ler a trilha já salva. */
export interface AuditoriaEntrada {
  tabela: CronogramaTrilhaTabela
  acao: CronogramaTrilhaAcao
  antes?: unknown
  depois?: unknown
}

const DOW_NOME: Record<number, string> = {
  1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira", 4: "Quinta-feira", 5: "Sexta-feira",
}

const TONE_NOME: Record<string, string> = {
  green: "Verde", amber: "Âmbar", blue: "Azul", purple: "Roxo", red: "Vermelho", slate: "Cinza",
}

// Campos técnicos que nunca aparecem pro usuário (ids internos, timestamps de
// controle, chaves estáveis que duplicam o *_nome já exibido).
const CAMPOS_IGNORADOS = new Set(["id", "created_at", "updated_at", "sala_id", "profissional_id", "terapia_id", "codigo"])

const LABEL_POR_TABELA: Record<CronogramaTrilhaTabela, Record<string, string>> = {
  sala: {
    unidade_nome: "Unidade",
    nucleo: "Núcleo",
    andar: "Andar",
    numero_sala: "Número da sala",
    nome_exibicao: "Nome de exibição",
    capacidade: "Capacidade",
    status: "Status",
    sala_nome_referencia: "Referência na grade",
    observacoes: "Observações",
  },
  alocacao: {
    dow: "Dia da semana",
    turno: "Turno",
    profissional_nome: "Profissional",
    terapia_nome: "Terapia",
  },
  nucleo: {
    nome: "Nome",
  },
  status_label: {
    label: "Rótulo (formulário)",
    label_curto: "Rótulo curto",
    tone: "Cor",
  },
  exclusividade_terapia: {
    terapia_nome: "Terapia",
    modo: "Modo",
  },
}

function formatarValor(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—"
  if (campo === "capacidade") return CAPACIDADE_LABEL_CURTO[valor as SalaCapacidade] ?? String(valor)
  if (campo === "status") return STATUS_LABEL_CURTO[valor as SalaStatus] ?? String(valor)
  if (campo === "dow") return DOW_NOME[valor as number] ?? String(valor)
  if (campo === "tone") return TONE_NOME[valor as string] ?? String(valor)
  if (campo === "modo") return valor === "obrigatoria" ? "Obrigatória" : valor === "preferencial" ? "Preferencial" : String(valor)
  return String(valor)
}

export interface CampoAlteracao {
  label: string
  antes: string
  depois: string
  mudou: boolean
}

/** Usado na exclusão/criação: só o snapshot que existe, sem comparação. */
export interface CampoSnapshot {
  label: string
  valor: string
}

function camposConhecidos(tabela: CronogramaTrilhaTabela, registro: Record<string, unknown>): [string, string][] {
  const labels = LABEL_POR_TABELA[tabela]
  return Object.keys(labels)
    .filter(campo => !CAMPOS_IGNORADOS.has(campo) && campo in registro)
    .map(campo => [campo, labels[campo]])
}

/** Linhas "campo: antes → depois", só dos campos que de fato mudaram. */
export function camposAlterados(item: AuditoriaEntrada): CampoAlteracao[] {
  const antes = (item.antes ?? {}) as Record<string, unknown>
  const depois = (item.depois ?? {}) as Record<string, unknown>
  const base = Object.keys(depois).length ? depois : antes
  return camposConhecidos(item.tabela, base)
    .map(([campo, label]) => ({
      label,
      antes: formatarValor(campo, antes[campo]),
      depois: formatarValor(campo, depois[campo]),
      mudou: JSON.stringify(antes[campo] ?? null) !== JSON.stringify(depois[campo] ?? null),
    }))
    .filter(c => c.mudou)
}

/** Linhas "campo: valor" — usado em criação (depois) e exclusão (antes). */
export function camposSnapshot(item: AuditoriaEntrada): CampoSnapshot[] {
  const registro = (item.acao === "excluir" ? item.antes : item.depois ?? item.antes) as Record<string, unknown> | null
  if (!registro) return []
  return camposConhecidos(item.tabela, registro).map(([campo, label]) => ({ label, valor: formatarValor(campo, registro[campo]) }))
}

/**
 * Uma linha só, pronta pra ler direto na planilha do Supabase (coluna
 * `resumo`) sem abrir o JSON de antes/depois — "Núcleo: Terapia ABA →
 * Especialidades Terapêuticas · Capacidade: Duplo → Único".
 */
export function resumoAlteracao(item: AuditoriaEntrada): string {
  if (item.acao === "editar") {
    const alteracoes = camposAlterados(item)
    return alteracoes.length
      ? alteracoes.map(c => `${c.label}: ${c.antes} → ${c.depois}`).join(" · ")
      : "Nenhum campo alterado."
  }
  const snapshot = camposSnapshot(item)
  if (!snapshot.length) return item.acao === "criar" ? "Registro criado." : "Registro excluído."
  return snapshot.map(c => `${c.label}: ${c.valor}`).join(" · ")
}
