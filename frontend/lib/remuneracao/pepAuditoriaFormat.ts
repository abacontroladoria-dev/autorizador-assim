// Tradução do antes/depois (JSONB cru) da trilha de auditoria da PEP em algo
// legível pra usuário leigo — mesmo papel de lib/cronograma/auditoriaFormat.ts
// (Ocupação de Salas), só que pros 4 tipos de linha da PEP: registro de
// entrega, planejamento semestral, apuração mensal (liberar/reabrir) e
// calendário da competência ("Semanas no mês").

import type { PepCatalogoItem } from "@/types/pep"
import type { PepTrilhaAcao, PepTrilhaTabela } from "@/services/pepAuditoria.service"

/** Só o mínimo necessário pra calcular o resumo — usado tanto ao gravar (antes de a linha existir) quanto ao ler a trilha já salva. */
export interface AuditoriaEntradaPep {
  tabela: PepTrilhaTabela
  acao: PepTrilhaAcao
  antes?: unknown
  depois?: unknown
}

// Campos técnicos que nunca aparecem pro usuário — ids internos, timestamps
// de controle, e os campos de contexto que a linha da trilha já expõe direto
// (prestador_nome/paciente_nome/competencia), sem precisar duplicar no diff.
const CAMPOS_IGNORADOS = new Set([
  "id", "paciente_nome", "paciente_cpf", "prestador_nome", "item_id", "competencia",
  "created_at", "updated_at", "criado_em", "entregue_em", "registrado_por", "calculado_por",
  "planejamento_anterior_id",
])

const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", entregue: "Entregue" }
const ORIGEM_LABEL: Record<string, string> = {
  inicial: "Planejamento inicial",
  reprogramacao_antecipada: "Reprogramação (entrega antecipada)",
  reprogramacao_impedimento: "Reprogramação (impedimento terapêutico)",
  manual: "Ajuste manual",
}
const ESTADO_LABEL: Record<string, string> = { apurado: "Apurado", liberado: "Faturamento liberado" }

const LABEL_POR_TABELA: Record<PepTrilhaTabela, Record<string, string>> = {
  registro_entrega: {
    status: "Status",
    quantidade_entregue: "Quantidade entregue",
    evidencias: "Evidências",
    observacao: "Observação",
    data_entrega: "Data de entrega",
  },
  planejamento_semestral: {
    competencia_planejada: "Competência planejada",
    data_planejada: "Data planejada",
    origem: "Origem",
    ativo: "Planejamento ativo",
    motivo: "Motivo do planejamento",
    evidencias: "Evidências",
  },
  apuracao_mensal: {
    estado: "Estado do faturamento",
  },
  calendario_competencia: {
    semanas_supervisao_estudo: "Semanas no mês (Sup./Estudo)",
    observacao: "Observação",
  },
}

function formatarEvidencias(valor: unknown): string {
  if (!Array.isArray(valor) || valor.length === 0) return "—"
  return valor
    .filter((e): e is { caminho: string; nome: string | null } => !!e && typeof e === "object" && "caminho" in e && !!(e as { caminho?: string }).caminho)
    .map(e => e.nome || e.caminho)
    .join(", ") || "—"
}

function formatarValor(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—"
  if (campo === "status") return STATUS_LABEL[valor as string] ?? String(valor)
  if (campo === "origem") return ORIGEM_LABEL[valor as string] ?? String(valor)
  if (campo === "estado") return ESTADO_LABEL[valor as string] ?? String(valor)
  if (campo === "ativo") return valor ? "Sim" : "Não"
  if (campo === "evidencias") return formatarEvidencias(valor)
  if (campo === "data_planejada" || campo === "data_entrega") {
    const [ano, mes, dia] = String(valor).split("-")
    return dia && mes && ano ? `${dia}/${mes}/${ano}` : String(valor)
  }
  return String(valor)
}

export interface CampoAlteracaoPep {
  label: string
  antes: string
  depois: string
  mudou: boolean
}

export interface CampoSnapshotPep {
  label: string
  valor: string
}

function camposConhecidos(tabela: PepTrilhaTabela, registro: Record<string, unknown>): [string, string][] {
  const labels = LABEL_POR_TABELA[tabela]
  return Object.keys(labels)
    .filter(campo => !CAMPOS_IGNORADOS.has(campo) && campo in registro)
    .map(campo => [campo, labels[campo]])
}

/** Linhas "campo: antes → depois", só dos campos que de fato mudaram. */
export function camposAlterados(item: AuditoriaEntradaPep): CampoAlteracaoPep[] {
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
export function camposSnapshot(item: AuditoriaEntradaPep): CampoSnapshotPep[] {
  const registro = (item.acao === "excluir" ? item.antes : item.depois ?? item.antes) as Record<string, unknown> | null
  if (!registro) return []
  return camposConhecidos(item.tabela, registro).map(([campo, label]) => ({ label, valor: formatarValor(campo, registro[campo]) }))
}

/**
 * Uma linha só, pronta pra ler direto na planilha do Supabase (coluna
 * `resumo`) sem abrir o JSON de antes/depois.
 */
export function resumoAlteracao(item: AuditoriaEntradaPep): string {
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

/** Nome do item de catálogo referenciado por uma linha da trilha (antes ou depois), pro cabeçalho da lista — resolve item_id sem precisar de nova consulta. */
export function nomeItemDaTrilha(
  item: { antes?: unknown; depois?: unknown },
  catalogo: PepCatalogoItem[]
): string | null {
  const registro = (item.depois ?? item.antes) as { item_id?: string } | null
  if (!registro?.item_id) return null
  return catalogo.find(c => c.id === registro.item_id)?.nome ?? null
}